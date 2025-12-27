import type { App } from 'obsidian';
import { TFile, TFolder } from 'obsidian';
import type {
	Session,
	Message,
	SessionSummary,
	ExtractedEntity,
	ConversationContext,
	ModelInfo,
} from '../types';
import { getTranslations } from '../i18n';
import { sanitizeFileName, generateId } from '../utils/sanitize';
import { logger } from '../utils/logger';

export class SessionManager {
	private app: App;
	private journalFolder: string;
	private entitiesFolder: string;
	private currentSession: Session | null = null;
	private saveLock: Promise<TFile | null> = Promise.resolve(null); // Mutex for save operations

	constructor(app: App, journalFolder: string, entitiesFolder: string) {
		this.app = app;
		this.journalFolder = journalFolder;
		this.entitiesFolder = entitiesFolder;
	}

	updateSettings(journalFolder: string, entitiesFolder: string): void {
		this.journalFolder = journalFolder;
		this.entitiesFolder = entitiesFolder;
	}

	startSession(): Session {
		this.currentSession = {
			id: generateId(),
			startedAt: Date.now(),
			messages: [],
			context: {
				recentNotes: [],
				semanticMatches: [],
				linkedEntities: [],
			},
		};
		return this.currentSession;
	}

	getSession(): Session | null {
		return this.currentSession;
	}

	addMessage(message: Message): void {
		if (!this.currentSession) {
			logger.warn('addMessage called without active session - message will be lost');
			return;
		}
		this.currentSession.messages.push(message);
	}

	updateContext(context: ConversationContext): void {
		if (this.currentSession) {
			this.currentSession.context = context;
		}
	}

	/**
	 * Save the current session to a journal note file
	 * Uses mutex pattern to prevent concurrent save operations
	 */
	async saveSession(summary: SessionSummary, modelInfo?: ModelInfo): Promise<TFile | null> {
		// Use mutex to prevent concurrent save operations
		// Pattern: capture previous lock, create new lock with resolver, wait for previous
		const previousLock = this.saveLock;
		let releaseLock: (value: TFile | null) => void = () => {
			/* no-op default */
		};
		let rejectLock: (error: Error) => void = () => {
			/* no-op default */
		};
		this.saveLock = new Promise<TFile | null>((resolve, reject) => {
			releaseLock = resolve;
			rejectLock = reject;
		});

		let resultFile: TFile | null = null;
		let saveError: Error | null = null;

		try {
			// Wait for any previous save to complete (ignore previous errors)
			await previousLock.catch(() => {
				// Previous save failed, but we can still proceed
			});

			if (!this.currentSession || this.currentSession.messages.length === 0) {
				return null;
			}

			// Capture current session before async operations
			const session = this.currentSession;

			// Ensure folder exists
			await this.ensureFolder(this.journalFolder);

			// Generate note content
			const content = this.formatSessionNote(session, summary, modelInfo);

			// Generate file path
			const date = new Date();
			const dateStr = this.formatDate(date);
			const timeStr = this.formatTime(date);
			const fileName = `${dateStr}.md`;
			const filePath = `${this.journalFolder}/${fileName}`;

			// Check if file exists (append to daily note)
			const existingFile = this.app.vault.getAbstractFileByPath(filePath);

			let file: TFile;
			if (existingFile instanceof TFile) {
				// Append to existing file
				const existingContent = await this.app.vault.read(existingFile);
				const newContent =
					existingContent +
					'\n\n---\n\n' +
					this.formatSessionSection(session, summary, timeStr);
				await this.app.vault.modify(existingFile, newContent);
				file = existingFile;
			} else {
				// Create new file
				file = await this.app.vault.create(filePath, content);
			}

			// Create entity notes
			await this.createEntityNotes(summary.entities, dateStr);

			// Clear session
			this.currentSession = null;

			resultFile = file;
			return file;
		} catch (error) {
			// Capture error for lock rejection
			saveError = error instanceof Error ? error : new Error(String(error));
			throw error;
		} finally {
			// Release lock with result or reject with error
			if (saveError) {
				rejectLock(saveError);
			} else {
				releaseLock(resultFile);
			}
		}
	}

	async createEntityNotes(entities: ExtractedEntity[], sessionDate: string): Promise<void> {
		await this.ensureFolder(this.entitiesFolder);

		// Process entities in parallel with error handling for each
		const results = await Promise.allSettled(
			entities.map((entity) => this.createOrUpdateEntityNote(entity, sessionDate))
		);

		// Log any failures
		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			if (result.status === 'rejected') {
				logger.error(
					`Failed to create/update entity note for "${entities[i].name}":`,
					result.reason instanceof Error ? result.reason : undefined
				);
			}
		}
	}

	/**
	 * Create or update a single entity note
	 */
	private async createOrUpdateEntityNote(
		entity: ExtractedEntity,
		sessionDate: string
	): Promise<void> {
		const t = getTranslations();
		const safeName = sanitizeFileName(entity.name);
		const fileName = `${safeName}.md`;
		const filePath = `${this.entitiesFolder}/${fileName}`;
		const existingFile = this.app.vault.getAbstractFileByPath(filePath);

		if (existingFile instanceof TFile) {
			// Append to existing entity note
			const existingContent = await this.app.vault.read(existingFile);
			const sessionLink = `- [[${sessionDate}]] - ${entity.context}`;

			if (!existingContent.includes(sessionLink)) {
				// Find the related sessions section and append
				const updatedContent = this.appendToSection(
					existingContent,
					t.notes.relatedSessions,
					sessionLink
				);
				await this.app.vault.modify(existingFile, updatedContent);
			}
		} else {
			// Create new entity note
			const content = this.formatEntityNote(entity, sessionDate);
			await this.app.vault.create(filePath, content);
		}
	}

	private formatSessionNote(
		session: Session,
		summary: SessionSummary,
		modelInfo?: ModelInfo
	): string {
		const t = getTranslations();
		const date = new Date(session.startedAt);
		const dateStr = this.formatDate(date);
		const timeStr = this.formatTime(date);

		const sanitizedTags = summary.tags.map((tag) => this.sanitizeYamlValue(tag));
		const sanitizedEntities = summary.entities.map((e) => this.sanitizeYamlValue(e.name));

		const frontmatterLines = [
			'---',
			`date: ${dateStr}`,
			'type: session',
			`category: ${this.sanitizeYamlValue(summary.category)}`,
			`tags: [${sanitizedTags.join(', ')}]`,
			`entities: [${sanitizedEntities.join(', ')}]`,
		];

		// Add model info if provided (sanitize model IDs as they may contain special chars)
		if (modelInfo) {
			const chatModel = this.sanitizeYamlValue(modelInfo.chatModel);
			const summaryModel = this.sanitizeYamlValue(modelInfo.summaryModel);
			const embeddingModel = this.sanitizeYamlValue(modelInfo.embeddingModel);
			frontmatterLines.push(`chat_model: ${chatModel}`);
			frontmatterLines.push(`summary_model: ${summaryModel}`);
			frontmatterLines.push(`embedding_model: ${embeddingModel}`);
		}

		frontmatterLines.push('---');
		const frontmatter = frontmatterLines.join('\n');

		const body = this.formatSessionSection(session, summary, timeStr);

		return `${frontmatter}\n\n# ${dateStr} ${t.notes.sessionTitle}\n\n${body}`;
	}

	private formatSessionSection(
		session: Session,
		summary: SessionSummary,
		timeStr: string
	): string {
		const t = getTranslations();
		const sections: string[] = [];

		sections.push(`## ${timeStr}`);

		sections.push(`\n### ${t.notes.summary}`);
		sections.push(summary.summary);

		sections.push(`\n### ${t.notes.tags}`);
		sections.push(summary.tags.map((tag) => `#${tag}`).join(' '));

		if (summary.decisions.length > 0) {
			sections.push(`\n### ${t.notes.decisions}`);
			for (const decision of summary.decisions) {
				sections.push(`- ${decision}`);
			}
		}

		if (summary.insights.length > 0) {
			sections.push(`\n### ${t.notes.insights}`);
			for (const insight of summary.insights) {
				sections.push(`- ${insight}`);
			}
		}

		if (summary.entities.length > 0) {
			sections.push(`\n### ${t.notes.entities}`);
			for (const entity of summary.entities) {
				const safeName = this.escapeWikiLink(entity.name);
				sections.push(`- [[${safeName}]] - ${entity.context}`);
			}
		}

		if (summary.values.length > 0) {
			sections.push(`\n### ${t.notes.values}`);
			for (const value of summary.values) {
				const sentiment =
					value.sentiment === 'positive'
						? '+'
						: value.sentiment === 'negative'
							? '-'
							: '±';
				sections.push(`- ${sentiment} ${value.value}: ${value.context}`);
			}
		}

		// Conversation log in details
		sections.push('\n<details>');
		sections.push(`<summary>${t.notes.conversationLog}</summary>\n`);
		for (const msg of session.messages) {
			const speaker = msg.role === 'user' ? `**${t.ui.userLabel}**` : `**${t.ui.botLabel}**`;
			sections.push(`${speaker}: ${msg.content}\n`);
		}
		sections.push('</details>');

		return sections.join('\n');
	}

	private formatEntityNote(entity: ExtractedEntity, sessionDate: string): string {
		const t = getTranslations();
		const entityTypeLabel = {
			person: 'person',
			project: 'project',
			company: 'company',
			book: 'book',
			other: 'other',
		};

		return `---
type: entity
entity_type: ${entityTypeLabel[entity.type]}
---

# ${entity.name}

## ${t.notes.overview}
${entity.description}

## ${t.notes.relationships}
${t.notes.relationshipPlaceholder}

## ${t.notes.memo}
- ${t.notes.firstMention}: ${sessionDate}

## ${t.notes.relatedSessions}
- [[${sessionDate}]] - ${entity.context}
`;
	}

	/**
	 * Escape special regex characters in a string
	 */
	private escapeRegExp(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	/**
	 * Sanitize a string for use in YAML frontmatter
	 * Quotes strings containing special characters
	 */
	private sanitizeYamlValue(str: string): string {
		// If string contains special YAML characters, wrap in quotes
		if (/[:#[\],{}|>!&*?'"`\n]/.test(str) || str.trim() !== str) {
			// Escape internal quotes and wrap in double quotes
			return `"${str.replace(/"/g, '\\"')}"`;
		}
		return str;
	}

	/**
	 * Escape characters that would break wiki link syntax [[...]]
	 */
	private escapeWikiLink(str: string): string {
		// Escape ]] to prevent breaking wiki link syntax
		// Also escape | which is used for link aliases
		return str.replace(/\]\]/g, '\\]\\]').replace(/\|/g, '\\|');
	}

	private appendToSection(content: string, sectionName: string, newLine: string): string {
		// Escape special regex characters in section name to prevent regex injection
		const escapedSectionName = this.escapeRegExp(sectionName);
		const sectionRegex = new RegExp(`(## ${escapedSectionName}[\\s\\S]*?)(\n## |$)`);
		const match = content.match(sectionRegex);

		if (match) {
			const sectionContent = match[1];
			const afterSection = match[2];
			const updatedSection = sectionContent.trim() + '\n' + newLine;
			return content.replace(sectionRegex, updatedSection + '\n' + afterSection);
		}

		// If section not found, append at end
		return content + '\n' + newLine;
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(folderPath);
		if (!existing) {
			await this.app.vault.createFolder(folderPath);
		} else if (!(existing instanceof TFolder)) {
			// A file exists with the same name as our target folder
			logger.error(
				`Cannot create folder '${folderPath}': a file with this name already exists`
			);
			throw new Error(`Cannot create folder: file exists at path ${folderPath}`);
		}
		// If it's already a folder, we're good
	}

	private formatDate(date: Date): string {
		// Use local time to avoid timezone issues near midnight
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	private formatTime(date: Date): string {
		return date.toTimeString().slice(0, 5);
	}
}
