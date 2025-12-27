import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type {
	Session,
	Message,
	SessionSummary,
	ExtractedEntity,
	ConversationContext,
	ModelInfo,
} from '../types';

export class SessionManager {
	private app: App;
	private journalFolder: string;
	private entitiesFolder: string;
	private currentSession: Session | null = null;

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
			id: this.generateId(),
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
		if (this.currentSession) {
			this.currentSession.messages.push(message);
		}
	}

	updateContext(context: ConversationContext): void {
		if (this.currentSession) {
			this.currentSession.context = context;
		}
	}

	async saveSession(summary: SessionSummary, modelInfo?: ModelInfo): Promise<TFile | null> {
		if (!this.currentSession || this.currentSession.messages.length === 0) {
			return null;
		}

		// Ensure folder exists
		await this.ensureFolder(this.journalFolder);

		// Generate note content
		const content = this.formatSessionNote(this.currentSession, summary, modelInfo);

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
				this.formatSessionSection(this.currentSession, summary, timeStr);
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

		return file;
	}

	async createEntityNotes(entities: ExtractedEntity[], sessionDate: string): Promise<void> {
		await this.ensureFolder(this.entitiesFolder);

		for (const entity of entities) {
			const fileName = `${entity.name}.md`;
			const filePath = `${this.entitiesFolder}/${fileName}`;
			const existingFile = this.app.vault.getAbstractFileByPath(filePath);

			if (existingFile instanceof TFile) {
				// Append to existing entity note
				const existingContent = await this.app.vault.read(existingFile);
				const sessionLink = `- [[${sessionDate}]] - ${entity.context}`;

				if (!existingContent.includes(sessionLink)) {
					// Find the "関連するセッション" section and append
					const updatedContent = this.appendToSection(
						existingContent,
						'関連するセッション',
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
	}

	private formatSessionNote(
		session: Session,
		summary: SessionSummary,
		modelInfo?: ModelInfo
	): string {
		const date = new Date(session.startedAt);
		const dateStr = this.formatDate(date);
		const timeStr = this.formatTime(date);

		const frontmatterLines = [
			'---',
			`date: ${dateStr}`,
			'type: session',
			`category: ${summary.category}`,
			`tags: [${summary.tags.join(', ')}]`,
			`entities: [${summary.entities.map((e) => e.name).join(', ')}]`,
		];

		// Add model info if provided
		if (modelInfo) {
			frontmatterLines.push(`chat_model: ${modelInfo.chatModel}`);
			frontmatterLines.push(`summary_model: ${modelInfo.summaryModel}`);
			frontmatterLines.push(`embedding_model: ${modelInfo.embeddingModel}`);
		}

		frontmatterLines.push('---');
		const frontmatter = frontmatterLines.join('\n');

		const body = this.formatSessionSection(session, summary, timeStr);

		return `${frontmatter}\n\n# ${dateStr} セッション\n\n${body}`;
	}

	private formatSessionSection(
		session: Session,
		summary: SessionSummary,
		timeStr: string
	): string {
		const sections: string[] = [];

		sections.push(`## ${timeStr}`);

		sections.push('\n### 要約');
		sections.push(summary.summary);

		sections.push('\n### タグ');
		sections.push(summary.tags.map((t) => `#${t}`).join(' '));

		if (summary.decisions.length > 0) {
			sections.push('\n### 検討中の意思決定');
			for (const decision of summary.decisions) {
				sections.push(`- ${decision}`);
			}
		}

		if (summary.insights.length > 0) {
			sections.push('\n### 気づき');
			for (const insight of summary.insights) {
				sections.push(`- ${insight}`);
			}
		}

		if (summary.entities.length > 0) {
			sections.push('\n### 言及されたエンティティ');
			for (const entity of summary.entities) {
				sections.push(`- [[${entity.name}]] - ${entity.context}`);
			}
		}

		if (summary.values.length > 0) {
			sections.push('\n### 価値観・判断軸');
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
		sections.push('<summary>会話ログ</summary>\n');
		for (const msg of session.messages) {
			const speaker = msg.role === 'user' ? '**自分**' : '**Bot**';
			sections.push(`${speaker}: ${msg.content}\n`);
		}
		sections.push('</details>');

		return sections.join('\n');
	}

	private formatEntityNote(entity: ExtractedEntity, sessionDate: string): string {
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

## 概要
${entity.description}

## 関係性
（関係性があれば追記）

## メモ
- 初回言及: ${sessionDate}

## 関連するセッション
- [[${sessionDate}]] - ${entity.context}
`;
	}

	private appendToSection(content: string, sectionName: string, newLine: string): string {
		const sectionRegex = new RegExp(`(## ${sectionName}[\\s\\S]*?)(\n## |$)`);
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
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folder) {
			await this.app.vault.createFolder(folderPath);
		}
	}

	private formatDate(date: Date): string {
		return date.toISOString().split('T')[0];
	}

	private formatTime(date: Date): string {
		return date.toTimeString().slice(0, 5);
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}
