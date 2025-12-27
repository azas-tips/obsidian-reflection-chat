import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { ConversationContext, NoteSummary, SearchResult, Entity, Message } from '../types';
import { Embedder } from '../infrastructure/Embedder';
import { VectorStore, VectorMetadata } from '../infrastructure/VectorStore';
import {
	parseFrontmatter,
	getFrontmatterString,
	getFrontmatterStringArray,
} from '../utils/frontmatter';
import { sanitizeFileName, escapeRegex } from '../utils/sanitize';
import { getAllTranslations } from '../i18n';
import { logger } from '../utils/logger';

export class ContextRetriever {
	private static readonly MAX_RECENT_NOTES = 10;
	private static readonly HISTORY_MESSAGES_FOR_QUERY = 3;
	private static readonly MAX_SUMMARY_LENGTH = 200;
	private static readonly MAX_INPUT_LENGTH_FOR_REGEX = 100000; // 100KB limit for regex processing
	private static readonly MAX_ENTITY_NAMES_FOR_REGEX = 100; // Limit number of entity names to check
	private static readonly MIN_CONTEXT_WINDOW_DAYS = 1;
	private static readonly MAX_CONTEXT_WINDOW_DAYS = 365;

	private app: App;
	private embedder: Embedder;
	private vectorStore: VectorStore;
	private journalFolder: string;
	private entitiesFolder: string;
	private contextWindowDays: number;
	private maxSemanticResults: number;

	constructor(
		app: App,
		embedder: Embedder,
		vectorStore: VectorStore,
		journalFolder: string,
		entitiesFolder: string,
		contextWindowDays: number,
		maxSemanticResults: number
	) {
		this.app = app;
		this.embedder = embedder;
		this.vectorStore = vectorStore;
		this.journalFolder = journalFolder;
		this.entitiesFolder = entitiesFolder;
		// Validate initial values - can't use instance method in constructor, use inline validation
		this.contextWindowDays = Math.max(
			ContextRetriever.MIN_CONTEXT_WINDOW_DAYS,
			Math.min(ContextRetriever.MAX_CONTEXT_WINDOW_DAYS, Math.floor(contextWindowDays))
		);
		this.maxSemanticResults = Math.max(1, Math.floor(maxSemanticResults));
	}

	/**
	 * Validate and clamp contextWindowDays to valid range
	 */
	private validateContextWindowDays(days: number): number {
		if (!Number.isFinite(days) || days < ContextRetriever.MIN_CONTEXT_WINDOW_DAYS) {
			logger.warn(
				`Invalid contextWindowDays: ${days}, using minimum: ${ContextRetriever.MIN_CONTEXT_WINDOW_DAYS}`
			);
			return ContextRetriever.MIN_CONTEXT_WINDOW_DAYS;
		}
		if (days > ContextRetriever.MAX_CONTEXT_WINDOW_DAYS) {
			logger.warn(
				`contextWindowDays ${days} exceeds maximum, clamping to ${ContextRetriever.MAX_CONTEXT_WINDOW_DAYS}`
			);
			return ContextRetriever.MAX_CONTEXT_WINDOW_DAYS;
		}
		return Math.floor(days); // Ensure integer
	}

	updateSettings(
		journalFolder: string,
		entitiesFolder: string,
		contextWindowDays: number,
		maxSemanticResults: number
	): void {
		this.journalFolder = journalFolder;
		this.entitiesFolder = entitiesFolder;
		this.contextWindowDays = this.validateContextWindowDays(contextWindowDays);
		this.maxSemanticResults = Math.max(1, Math.floor(maxSemanticResults));
	}

	async retrieve(currentMessage: string, history: Message[]): Promise<ConversationContext> {
		const [recentNotes, semanticMatches, linkedEntities] = await Promise.all([
			this.getRecentNotes(),
			this.getSemanticMatches(currentMessage, history),
			this.getLinkedEntities(currentMessage, history),
		]);

		return {
			recentNotes,
			semanticMatches,
			linkedEntities,
		};
	}

	private async getRecentNotes(): Promise<NoteSummary[]> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - this.contextWindowDays);
		const cutoffStr = cutoffDate.toISOString().split('T')[0];

		// Get all markdown files in journal folder
		const files = this.app.vault.getMarkdownFiles().filter((f) => {
			if (!f.path.startsWith(this.journalFolder + '/')) return false;

			// Check if file is within the context window
			// Anchor to start to avoid matching partial date-like patterns
			const dateMatch = f.basename.match(/^(\d{4}-\d{2}-\d{2})/);
			if (dateMatch && dateMatch[1] >= cutoffStr) {
				return true;
			}

			// Fall back to modification time
			const modDate = new Date(f.stat.mtime).toISOString().split('T')[0];
			return modDate >= cutoffStr;
		});

		// Sort by date (most recent first)
		files.sort((a, b) => b.stat.mtime - a.stat.mtime);

		// Get summaries for recent notes in parallel (fixes N+1 query pattern)
		const recentFiles = files.slice(0, ContextRetriever.MAX_RECENT_NOTES);
		const summaryPromises = recentFiles.map((file) => this.getNoteSummary(file));
		const summaries = await Promise.all(summaryPromises);

		// Filter out nulls
		return summaries.filter((summary): summary is NoteSummary => summary !== null);
	}

	private async getSemanticMatches(
		currentMessage: string,
		history: Message[]
	): Promise<SearchResult[]> {
		// Build query from current message and recent history
		const recentMessages = history
			.slice(-ContextRetriever.HISTORY_MESSAGES_FOR_QUERY)
			.map((m) => m.content);
		const queryText = [...recentMessages, currentMessage].join(' ');

		try {
			// Generate embedding for query
			const queryVector = await this.embedder.embedQuery(queryText);

			// Search vector store
			const results = await this.vectorStore.search(
				queryVector,
				this.maxSemanticResults,
				{ type: 'session' } // Focus on session notes for context
			);

			return results.map((r) => ({
				id: r.id,
				score: r.score,
				metadata: this.vectorMetadataToNoteSummary(r.metadata),
			}));
		} catch (error) {
			logger.error('Semantic search error:', error instanceof Error ? error : undefined);
			return [];
		}
	}

	private static readonly MAX_REGEX_ITERATIONS = 1000;

	private async getLinkedEntities(currentMessage: string, history: Message[]): Promise<Entity[]> {
		// Extract [[links]] from current message and history
		// Truncate input to prevent regex DoS attacks
		let allText = [...history.map((m) => m.content), currentMessage].join(' ');
		if (allText.length > ContextRetriever.MAX_INPUT_LENGTH_FOR_REGEX) {
			allText = allText.slice(0, ContextRetriever.MAX_INPUT_LENGTH_FOR_REGEX);
			logger.warn('Input truncated for regex processing due to size limit');
		}
		const linkRegex = /\[\[([^\]]+)\]\]/g;
		const links: string[] = [];
		let match;
		let iterations = 0;

		while (
			(match = linkRegex.exec(allText)) !== null &&
			iterations++ < ContextRetriever.MAX_REGEX_ITERATIONS
		) {
			links.push(match[1]);
		}

		// Also search for potential entity mentions (names from entities folder)
		const entityFiles = this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.startsWith(this.entitiesFolder + '/'));

		const entityNames = entityFiles.map((f) => f.basename);

		// Filter out names already in links
		const candidateNames = entityNames.filter((name) => !links.includes(name));

		// Use simple string matching instead of regex to avoid ReDoS risks
		// This is O(n*m) but with early termination and is safer than regex alternation
		let mentionedEntities: string[] = [];
		if (candidateNames.length > 0) {
			// Limit number of entity names to prevent performance issues
			const limitedNames = candidateNames.slice(
				0,
				ContextRetriever.MAX_ENTITY_NAMES_FOR_REGEX
			);
			if (candidateNames.length > ContextRetriever.MAX_ENTITY_NAMES_FOR_REGEX) {
				logger.warn(
					`Entity name list truncated from ${candidateNames.length} to ${ContextRetriever.MAX_ENTITY_NAMES_FOR_REGEX} for performance`
				);
			}

			// Convert text to lowercase once for case-insensitive matching
			const lowerText = allText.toLowerCase();

			// Check each entity name with simple string matching
			mentionedEntities = limitedNames.filter((name) => {
				const lowerName = name.toLowerCase();
				const index = lowerText.indexOf(lowerName);
				if (index === -1) return false;

				// Check word boundaries manually (more efficient than regex)
				const beforeChar = index > 0 ? lowerText[index - 1] : ' ';
				const afterChar =
					index + lowerName.length < lowerText.length
						? lowerText[index + lowerName.length]
						: ' ';

				// Word boundary: non-alphanumeric or CJK characters are boundaries
				const isWordBoundaryBefore = !/[\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/.test(
					beforeChar
				);
				const isWordBoundaryAfter = !/[\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/.test(
					afterChar
				);

				return isWordBoundaryBefore && isWordBoundaryAfter;
			});
		}

		const allEntityNames = [...new Set([...links, ...mentionedEntities])];

		// Load entity information in parallel (fixes N+1 query pattern)
		const entityPromises = allEntityNames.map((name) => this.loadEntity(name));
		const loadedEntities = await Promise.all(entityPromises);

		// Filter out nulls
		return loadedEntities.filter((entity): entity is Entity => entity !== null);
	}

	private async loadEntity(name: string): Promise<Entity | null> {
		const safeName = sanitizeFileName(name);
		const filePath = `${this.entitiesFolder}/${safeName}.md`;
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!(file instanceof TFile)) {
			return null;
		}

		try {
			const content = await this.app.vault.read(file);
			const { frontmatter, body } = parseFrontmatter(content);

			// Extract description from body (first paragraph after Overview section)
			// Try all language patterns since notes may have been created in any language
			let description = '';
			const overviewPatterns = getAllTranslations().map(
				(t) =>
					new RegExp(
						`##\\s*${escapeRegex(t.notes.overview)}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`
					)
			);

			for (const pattern of overviewPatterns) {
				const overviewMatch = body.match(pattern);
				if (overviewMatch) {
					description = overviewMatch[1].trim().split('\n')[0];
					break;
				}
			}

			// Validate entity type
			const entityType = getFrontmatterString(frontmatter, 'entity_type', 'other');
			const validEntityTypes = ['person', 'project', 'company', 'book', 'other'];
			const type = validEntityTypes.includes(entityType)
				? (entityType as Entity['type'])
				: 'other';

			return {
				name,
				type,
				description,
				path: filePath,
			};
		} catch (error) {
			logger.error(
				`Error loading entity ${name}:`,
				error instanceof Error ? error : undefined
			);
			return null;
		}
	}

	private async getNoteSummary(file: TFile): Promise<NoteSummary | null> {
		try {
			const content = await this.app.vault.read(file);
			const { frontmatter, body } = parseFrontmatter(content);

			// Get title
			let title = file.basename;
			const headingMatch = body.match(/^#\s+(.+)$/m);
			if (headingMatch) {
				title = headingMatch[1];
			}

			// Get summary - try all language patterns since notes may be in any language
			let summary = '';
			const summaryPatterns = getAllTranslations().map(
				(t) =>
					new RegExp(
						`###?\\s*${escapeRegex(t.notes.summary)}\\s*\\n([\\s\\S]*?)(?=\\n###?|$)`
					)
			);

			for (const pattern of summaryPatterns) {
				const summaryMatch = body.match(pattern);
				if (summaryMatch) {
					summary = summaryMatch[1].trim();
					break;
				}
			}

			if (!summary) {
				summary = body
					.replace(/^#+\s+.+$/gm, '')
					.trim()
					.slice(0, ContextRetriever.MAX_SUMMARY_LENGTH);
			}

			return {
				path: file.path,
				title,
				date: getFrontmatterString(frontmatter, 'date', file.basename),
				summary,
				tags: getFrontmatterStringArray(frontmatter, 'tags'),
				category: getFrontmatterString(frontmatter, 'category', 'life'),
				type: 'session',
			};
		} catch (error) {
			logger.error(`Error reading ${file.path}:`, error instanceof Error ? error : undefined);
			return null;
		}
	}

	private vectorMetadataToNoteSummary(metadata: VectorMetadata): NoteSummary {
		return {
			path: metadata.path,
			title: metadata.title,
			date: metadata.date,
			summary: metadata.summary,
			tags: metadata.tags,
			category: metadata.category,
			type: metadata.type,
		};
	}
}
