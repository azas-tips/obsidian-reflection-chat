import type { App, TFile, TAbstractFile, EventRef } from 'obsidian';
import { TFile as ObsidianTFile } from 'obsidian';
import { Embedder } from './Embedder';
import { VectorStore, VectorMetadata } from './VectorStore';
import { parseFrontmatter } from '../utils/frontmatter';

export class NoteIndexer {
	private app: App;
	private embedder: Embedder;
	private vectorStore: VectorStore;
	private journalFolder: string;
	private entitiesFolder: string;
	private isIndexing = false;
	private pendingUpdates: Map<string, NodeJS.Timeout> = new Map();
	private debounceMs = 1000;
	private eventRefs: EventRef[] = [];

	constructor(
		app: App,
		embedder: Embedder,
		vectorStore: VectorStore,
		journalFolder: string,
		entitiesFolder: string
	) {
		this.app = app;
		this.embedder = embedder;
		this.vectorStore = vectorStore;
		this.journalFolder = journalFolder;
		this.entitiesFolder = entitiesFolder;
	}

	updateSettings(journalFolder: string, entitiesFolder: string): void {
		this.journalFolder = journalFolder;
		this.entitiesFolder = entitiesFolder;
	}

	async initialize(): Promise<void> {
		// Register file watchers and store references for cleanup
		this.eventRefs.push(
			this.app.vault.on('create', (file) => this.handleFileChange(file, 'create'))
		);
		this.eventRefs.push(
			this.app.vault.on('modify', (file) => this.handleFileChange(file, 'modify'))
		);
		this.eventRefs.push(
			this.app.vault.on('delete', (file) => this.handleFileChange(file, 'delete'))
		);
		this.eventRefs.push(
			this.app.vault.on('rename', (file, oldPath) => this.handleRename(file, oldPath))
		);
	}

	destroy(): void {
		// Remove all event listeners
		for (const ref of this.eventRefs) {
			this.app.vault.offref(ref);
		}
		this.eventRefs = [];

		// Clear all pending timeouts
		for (const timeout of this.pendingUpdates.values()) {
			clearTimeout(timeout);
		}
		this.pendingUpdates.clear();
	}

	private async handleFileChange(
		file: TAbstractFile,
		action: 'create' | 'modify' | 'delete'
	): Promise<void> {
		if (!(file instanceof ObsidianTFile)) return;
		if (!this.isTargetFile(file)) return;

		if (action === 'delete') {
			// Cancel any pending update for this file
			this.cancelPendingUpdate(file.path);
			await this.vectorStore.delete(file.path);
		} else {
			// Debounce updates to avoid excessive indexing
			this.debouncedIndex(file);
		}
	}

	private async handleRename(file: TAbstractFile, oldPath: string): Promise<void> {
		if (!(file instanceof ObsidianTFile)) return;

		// Cancel any pending update for old path
		this.cancelPendingUpdate(oldPath);

		// Delete old entry
		await this.vectorStore.delete(oldPath);

		// Index with new path if it's a target file
		if (this.isTargetFile(file)) {
			this.debouncedIndex(file);
		}
	}

	private cancelPendingUpdate(path: string): void {
		const existing = this.pendingUpdates.get(path);
		if (existing) {
			clearTimeout(existing);
			this.pendingUpdates.delete(path);
		}
	}

	private debouncedIndex(file: TFile): void {
		this.cancelPendingUpdate(file.path);

		const timeout = setTimeout(async () => {
			this.pendingUpdates.delete(file.path);
			try {
				await this.indexFile(file);
			} catch (error) {
				console.error(`Failed to index ${file.path}:`, error);
			}
		}, this.debounceMs);

		this.pendingUpdates.set(file.path, timeout);
	}

	private isTargetFile(file: TFile): boolean {
		if (!file.path.endsWith('.md')) return false;

		return (
			file.path.startsWith(this.journalFolder + '/') ||
			file.path.startsWith(this.entitiesFolder + '/')
		);
	}

	async indexAll(): Promise<{ indexed: number; errors: number }> {
		if (this.isIndexing) {
			return { indexed: 0, errors: 0 };
		}

		this.isIndexing = true;
		let indexed = 0;
		let errors = 0;

		try {
			// Get all markdown files in target folders
			const files = this.app.vault.getMarkdownFiles().filter((f) => this.isTargetFile(f));

			console.log(`Indexing ${files.length} files...`);

			for (const file of files) {
				try {
					await this.indexFile(file);
					indexed++;
				} catch (error) {
					console.error(`Failed to index ${file.path}:`, error);
					errors++;
				}
			}

			console.log(`Indexed ${indexed} files, ${errors} errors`);
		} finally {
			this.isIndexing = false;
		}

		return { indexed, errors };
	}

	async indexFile(file: TFile): Promise<void> {
		try {
			// Read file content
			const content = await this.app.vault.read(file);

			// Parse frontmatter and content
			const { frontmatter, body } = parseFrontmatter(content);

			// Extract metadata
			const metadata = this.extractMetadata(file, frontmatter, body);

			// Create text for embedding
			const embeddingText = this.createEmbeddingText(metadata, body);

			// Generate embedding
			const vector = await this.embedder.embedDocument(embeddingText);

			// Upsert to vector store
			await this.vectorStore.upsert(file.path, vector, metadata);
		} catch (error) {
			console.error(`Error indexing ${file.path}:`, error);
			throw error;
		}
	}

	private extractMetadata(
		file: TFile,
		frontmatter: Record<string, any>,
		body: string
	): VectorMetadata {
		// Get title from file name or first heading
		let title = file.basename;
		const headingMatch = body.match(/^#\s+(.+)$/m);
		if (headingMatch) {
			title = headingMatch[1];
		}

		// Extract summary (first 500 characters of body, excluding headings)
		const summaryText = body
			.replace(/^#+\s+.+$/gm, '') // Remove headings
			.replace(/<[^>]+>/g, '') // Remove HTML tags
			.replace(/\n+/g, ' ') // Replace newlines
			.trim()
			.slice(0, 500);

		// Extract inline tags
		const tagMatches = body.match(/#[\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]+/g) || [];
		const inlineTags = tagMatches.map((t) => t.slice(1));

		// Combine frontmatter tags and inline tags
		const frontmatterTags = frontmatter.tags || [];
		const allTags = [...new Set([...frontmatterTags, ...inlineTags])];

		// Determine type
		const type = file.path.startsWith(this.entitiesFolder + '/') ? 'entity' : 'session';

		return {
			path: file.path,
			title,
			date: frontmatter.date || this.getFileDate(file),
			summary: summaryText,
			tags: allTags,
			category: frontmatter.category || 'life',
			type: type as 'session' | 'entity',
		};
	}

	private createEmbeddingText(metadata: VectorMetadata, _body: string): string {
		const parts = [metadata.title, metadata.summary, metadata.tags.join(' ')];

		return parts.join('\n');
	}

	private getFileDate(file: TFile): string {
		// Try to extract date from filename (YYYY-MM-DD format)
		const dateMatch = file.basename.match(/(\d{4}-\d{2}-\d{2})/);
		if (dateMatch) {
			return dateMatch[1];
		}

		// Fall back to file creation date
		return new Date(file.stat.ctime).toISOString().split('T')[0];
	}
}
