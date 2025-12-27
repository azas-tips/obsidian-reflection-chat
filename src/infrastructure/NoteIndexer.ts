import type { App, TFile, TAbstractFile, EventRef } from 'obsidian';
import { TFile as ObsidianTFile, Notice } from 'obsidian';
import { Embedder } from './Embedder';
import { VectorStore, VectorMetadata } from './VectorStore';
import {
	parseFrontmatter,
	getFrontmatterString,
	getFrontmatterStringArray,
} from '../utils/frontmatter';
import { logger } from '../utils/logger';
import { getTranslations } from '../i18n';

export class NoteIndexer {
	private static readonly DEBOUNCE_MS = 1000;
	private static readonly MAX_SUMMARY_LENGTH = 500;
	private static readonly MAX_PENDING_UPDATES = 50; // Prevent memory leaks from rapid file changes
	private static readonly MAX_RETRY_COUNT = 3; // Maximum retry attempts for dropped files

	private app: App;
	private embedder: Embedder;
	private vectorStore: VectorStore;
	private journalFolder: string;
	private entitiesFolder: string;
	private isIndexing = false;
	private isDestroyed = false; // Flag to prevent operations after destroy
	private isInitialized = false; // Prevent duplicate initialization
	private pendingUpdates: Map<string, NodeJS.Timeout> = new Map();
	private indexingPaths: Set<string> = new Set(); // Track files currently being indexed
	private droppedFiles: Map<string, number> = new Map(); // Track files dropped from queue with retry count
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
		const foldersChanged =
			this.journalFolder !== journalFolder || this.entitiesFolder !== entitiesFolder;

		this.journalFolder = journalFolder;
		this.entitiesFolder = entitiesFolder;

		// Clear stale tracking data when folders change to prevent memory leaks
		if (foldersChanged) {
			// Clear pending timeouts for old folder paths
			for (const timeout of this.pendingUpdates.values()) {
				clearTimeout(timeout);
			}
			this.pendingUpdates.clear();
			this.indexingPaths.clear();
			this.droppedFiles.clear();
		}
	}

	async initialize(): Promise<void> {
		// Prevent duplicate initialization
		if (this.isInitialized) {
			logger.warn('NoteIndexer.initialize() called multiple times');
			return;
		}
		this.isInitialized = true;

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
		// Mark as destroyed to prevent new operations
		this.isDestroyed = true;

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
		this.indexingPaths.clear();
		this.droppedFiles.clear();
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

		// Remove from dropped files if it was previously dropped (it's now being scheduled)
		this.droppedFiles.delete(file.path);

		// Enforce maximum pending updates to prevent memory leaks
		if (this.pendingUpdates.size >= NoteIndexer.MAX_PENDING_UPDATES) {
			// Clear oldest entries (FIFO cleanup) and track for retry
			const iterator = this.pendingUpdates.entries();
			const oldest = iterator.next().value;
			if (oldest) {
				const [droppedPath, droppedTimeout] = oldest;
				clearTimeout(droppedTimeout);
				this.pendingUpdates.delete(droppedPath);
				// Track dropped file for retry when queue has capacity (increment retry count)
				const currentRetries = this.droppedFiles.get(droppedPath) ?? 0;
				if (currentRetries < NoteIndexer.MAX_RETRY_COUNT) {
					this.droppedFiles.set(droppedPath, currentRetries + 1);
					logger.warn(
						`Dropped pending index update for ${droppedPath}, will retry later`
					);
				} else {
					logger.error(`Max retries exceeded for ${droppedPath}, skipping`);
				}
			}
		}

		const timeout = setTimeout(() => {
			this.pendingUpdates.delete(file.path);

			// Skip if indexer was destroyed while waiting
			if (this.isDestroyed) {
				return;
			}

			// If this file is currently being indexed, reschedule to avoid race condition
			if (this.indexingPaths.has(file.path)) {
				this.debouncedIndex(file);
				return;
			}

			// Mark file as being indexed
			this.indexingPaths.add(file.path);

			// Use void IIFE to handle async operation properly
			void (async () => {
				try {
					await this.indexFile(file);
				} catch (error) {
					// Skip error notification if destroyed during indexing
					if (this.isDestroyed) return;

					logger.error(
						`Failed to index ${file.path}:`,
						error instanceof Error ? error : undefined
					);
					// Notify user of background indexing failure
					const t = getTranslations();
					new Notice(`${t.notices.indexFailed}: ${file.basename}`);
				} finally {
					// Always remove from indexing set when done
					this.indexingPaths.delete(file.path);

					// Retry dropped files if queue has capacity
					this.retryDroppedFiles();
				}
			})();
		}, NoteIndexer.DEBOUNCE_MS);

		this.pendingUpdates.set(file.path, timeout);
	}

	/**
	 * Retry indexing files that were dropped from the queue
	 * Called after each indexing operation completes
	 */
	private retryDroppedFiles(): void {
		if (this.isDestroyed || this.droppedFiles.size === 0) return;

		// Only retry if queue has capacity
		const availableSlots = NoteIndexer.MAX_PENDING_UPDATES - this.pendingUpdates.size;
		if (availableSlots <= 0) return;

		// Take up to availableSlots files from dropped map
		const filesToRetry: string[] = [];
		for (const path of this.droppedFiles.keys()) {
			if (filesToRetry.length >= availableSlots) break;
			filesToRetry.push(path);
		}

		// Schedule retry for each file
		for (const path of filesToRetry) {
			// Check again in case destroy() was called during iteration
			if (this.isDestroyed) break;

			this.droppedFiles.delete(path);
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof ObsidianTFile && this.isTargetFile(file)) {
				logger.info(`Retrying dropped file: ${path}`);
				this.debouncedIndex(file);
			}
		}
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

			logger.info(`Indexing ${files.length} files...`);

			for (const file of files) {
				try {
					await this.indexFile(file);
					indexed++;
				} catch (error) {
					logger.error(
						`Failed to index ${file.path}:`,
						error instanceof Error ? error : undefined
					);
					errors++;
				}
			}

			logger.info(`Indexed ${indexed} files, ${errors} errors`);
		} finally {
			this.isIndexing = false;
		}

		return { indexed, errors };
	}

	async indexFile(file: TFile): Promise<void> {
		// Check if destroyed before starting
		if (this.isDestroyed) {
			return;
		}

		try {
			// Read file content
			const content = await this.app.vault.read(file);

			// Check again after async operation
			if (this.isDestroyed) return;

			// Parse frontmatter and content
			const { frontmatter, body } = parseFrontmatter(content);

			// Extract metadata
			const metadata = this.extractMetadata(file, frontmatter, body);

			// Create text for embedding
			const embeddingText = this.createEmbeddingText(metadata);

			// Generate embedding
			const vector = await this.embedder.embedDocument(embeddingText);

			// Check again after async operation
			if (this.isDestroyed) return;

			// Upsert to vector store
			await this.vectorStore.upsert(file.path, vector, metadata);
		} catch (error) {
			// Don't log errors if destroyed during operation
			if (this.isDestroyed) return;

			logger.error(
				`Error indexing ${file.path}:`,
				error instanceof Error ? error : undefined
			);
			throw error;
		}
	}

	private extractMetadata(
		file: TFile,
		frontmatter: Record<string, unknown>,
		body: string
	): VectorMetadata {
		// Get title from file name or first heading
		let title = file.basename;
		const headingMatch = body.match(/^#\s+(.+)$/m);
		if (headingMatch) {
			title = headingMatch[1];
		}

		// Extract summary from body, excluding headings
		const summaryText = body
			.replace(/^#+\s+.+$/gm, '') // Remove headings
			.replace(/<[^>]+>/g, '') // Remove HTML tags
			.replace(/\n+/g, ' ') // Replace newlines
			.trim()
			.slice(0, NoteIndexer.MAX_SUMMARY_LENGTH);

		// Extract inline tags
		const tagMatches = body.match(/#[\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]+/g) || [];
		const inlineTags = tagMatches.map((t) => t.slice(1));

		// Combine frontmatter tags and inline tags using type-safe accessor
		const frontmatterTags = getFrontmatterStringArray(frontmatter, 'tags');
		const allTags = [...new Set([...frontmatterTags, ...inlineTags])];

		// Determine type
		const type = file.path.startsWith(this.entitiesFolder + '/') ? 'entity' : 'session';

		return {
			path: file.path,
			title,
			date: getFrontmatterString(frontmatter, 'date', this.getFileDate(file)),
			summary: summaryText,
			tags: allTags,
			category: getFrontmatterString(frontmatter, 'category', 'life'),
			type: type as 'session' | 'entity',
		};
	}

	private createEmbeddingText(metadata: VectorMetadata): string {
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
