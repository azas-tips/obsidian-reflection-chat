import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { ConversationContext, NoteSummary, SearchResult, Entity, Message } from '../types';
import { Embedder } from '../infrastructure/Embedder';
import { VectorStore, VectorMetadata } from '../infrastructure/VectorStore';
import { parseFrontmatter } from '../utils/frontmatter';

export class ContextRetriever {
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
		this.contextWindowDays = contextWindowDays;
		this.maxSemanticResults = maxSemanticResults;
	}

	updateSettings(
		journalFolder: string,
		entitiesFolder: string,
		contextWindowDays: number,
		maxSemanticResults: number
	): void {
		this.journalFolder = journalFolder;
		this.entitiesFolder = entitiesFolder;
		this.contextWindowDays = contextWindowDays;
		this.maxSemanticResults = maxSemanticResults;
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
			const dateMatch = f.basename.match(/(\d{4}-\d{2}-\d{2})/);
			if (dateMatch && dateMatch[1] >= cutoffStr) {
				return true;
			}

			// Fall back to modification time
			const modDate = new Date(f.stat.mtime).toISOString().split('T')[0];
			return modDate >= cutoffStr;
		});

		// Sort by date (most recent first)
		files.sort((a, b) => b.stat.mtime - a.stat.mtime);

		// Get summaries for top 10
		const summaries: NoteSummary[] = [];
		for (const file of files.slice(0, 10)) {
			const summary = await this.getNoteSummary(file);
			if (summary) {
				summaries.push(summary);
			}
		}

		return summaries;
	}

	private async getSemanticMatches(
		currentMessage: string,
		history: Message[]
	): Promise<SearchResult[]> {
		// Build query from current message and recent history
		const recentMessages = history.slice(-3).map((m) => m.content);
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
			console.error('Semantic search error:', error);
			return [];
		}
	}

	private async getLinkedEntities(currentMessage: string, history: Message[]): Promise<Entity[]> {
		// Extract [[links]] from current message and history
		const allText = [...history.map((m) => m.content), currentMessage].join(' ');
		const linkRegex = /\[\[([^\]]+)\]\]/g;
		const links: string[] = [];
		let match;

		while ((match = linkRegex.exec(allText)) !== null) {
			links.push(match[1]);
		}

		// Also search for potential entity mentions (names from entities folder)
		const entityFiles = this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.startsWith(this.entitiesFolder + '/'));

		const entityNames = entityFiles.map((f) => f.basename);

		// Check which entities are mentioned in the conversation
		const mentionedEntities: string[] = [];
		for (const name of entityNames) {
			if (allText.includes(name) && !links.includes(name)) {
				mentionedEntities.push(name);
			}
		}

		const allEntityNames = [...new Set([...links, ...mentionedEntities])];

		// Load entity information
		const entities: Entity[] = [];
		for (const name of allEntityNames) {
			const entity = await this.loadEntity(name);
			if (entity) {
				entities.push(entity);
			}
		}

		return entities;
	}

	private async loadEntity(name: string): Promise<Entity | null> {
		const filePath = `${this.entitiesFolder}/${name}.md`;
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!(file instanceof TFile)) {
			return null;
		}

		try {
			const content = await this.app.vault.read(file);
			const { frontmatter, body } = parseFrontmatter(content);

			// Extract description from body (first paragraph after ## 概要)
			let description = '';
			const overviewMatch = body.match(/##\s*概要\s*\n([\s\S]*?)(?=\n##|$)/);
			if (overviewMatch) {
				description = overviewMatch[1].trim().split('\n')[0];
			}

			return {
				name,
				type: frontmatter.entity_type || 'other',
				description,
				path: filePath,
			};
		} catch (error) {
			console.error(`Error loading entity ${name}:`, error);
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

			// Get summary
			const summaryMatch = body.match(/###?\s*要約\s*\n([\s\S]*?)(?=\n###?|$)/);
			const summary = summaryMatch
				? summaryMatch[1].trim()
				: body
						.replace(/^#+\s+.+$/gm, '')
						.trim()
						.slice(0, 200);

			return {
				path: file.path,
				title,
				date: frontmatter.date || file.basename,
				summary,
				tags: frontmatter.tags || [],
				category: frontmatter.category || 'life',
				type: 'session',
			};
		} catch (error) {
			console.error(`Error reading ${file.path}:`, error);
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
