import { App, TFile, TFolder } from 'obsidian';

export interface VectorMetadata {
	path: string;
	title: string;
	date: string;
	summary: string;
	tags: string[];
	category: string;
	type: 'session' | 'entity';
}

export interface VectorItem {
	id: string;
	vector: number[];
	metadata: VectorMetadata;
}

export interface VectorSearchResult {
	id: string;
	score: number;
	metadata: VectorMetadata;
}

/**
 * Browser-compatible vector store using Obsidian's vault API
 * Stores each vector in a separate JSON file for better scalability
 */
export class VectorStore {
	private app: App;
	private vectorsDir: string;
	private items: Map<string, VectorItem> = new Map();
	private dirtyItems: Set<string> = new Set(); // Track which items need saving
	private deletedItems: Set<string> = new Set(); // Track deleted items
	private initialized = false;
	private saveTimeout: ReturnType<typeof setTimeout> | null = null;

	private static readonly SAVE_DEBOUNCE_MS = 1000;
	private static readonly LEGACY_INDEX_FILE = 'vector-index.json';

	constructor(app: App, basePath: string) {
		this.app = app;
		this.vectorsDir = basePath.endsWith('/')
			? `${basePath}vectors`
			: `${basePath}/vectors`;
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			// Ensure vectors directory exists
			await this.ensureDirectory(this.vectorsDir);

			// Check for legacy single-file format and migrate if needed
			await this.migrateFromLegacyFormat();

			// Load all vector files
			await this.loadAllVectors();

			this.initialized = true;
			console.log('Vector store initialized with', this.items.size, 'items');
		} catch (error) {
			console.error('Failed to initialize vector store:', error);
			this.items = new Map();
			this.initialized = true;
		}
	}

	private async migrateFromLegacyFormat(): Promise<void> {
		const basePath = this.vectorsDir.substring(0, this.vectorsDir.lastIndexOf('/'));
		const legacyPath = `${basePath}/${VectorStore.LEGACY_INDEX_FILE}`;

		const legacyFile = this.app.vault.getAbstractFileByPath(legacyPath);
		if (!(legacyFile instanceof TFile)) {
			return; // No legacy file, nothing to migrate
		}

		console.log('Migrating from legacy vector-index.json format...');

		try {
			const content = await this.app.vault.read(legacyFile);
			const legacyData = JSON.parse(content);

			if (legacyData.items && Array.isArray(legacyData.items)) {
				// Save each item as individual file
				for (const item of legacyData.items) {
					const fileName = this.getFileNameForId(item.id);
					const filePath = `${this.vectorsDir}/${fileName}`;
					await this.app.vault.create(filePath, JSON.stringify(item));
				}

				console.log(`Migrated ${legacyData.items.length} vectors to individual files`);

				// Delete legacy file
				await this.app.vault.delete(legacyFile);
				console.log('Deleted legacy vector-index.json');
			}
		} catch (error) {
			console.error('Migration failed:', error);
		}
	}

	private async loadAllVectors(): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(this.vectorsDir);
		if (!(folder instanceof TFolder)) {
			return;
		}

		for (const file of folder.children) {
			if (file instanceof TFile && file.extension === 'json') {
				try {
					const content = await this.app.vault.read(file);
					const item: VectorItem = JSON.parse(content);
					if (item.id && item.vector && item.metadata) {
						this.items.set(item.id, item);
					}
				} catch (error) {
					console.error(`Failed to load vector file ${file.path}:`, error);
				}
			}
		}
	}

	private getFileNameForId(id: string): string {
		// Create a safe filename from the id
		// Replace special characters that might cause issues
		const safeId = id
			.replace(/[/\\:*?"<>|]/g, '_')
			.replace(/\s+/g, '_')
			.substring(0, 100); // Limit length
		return `${safeId}.json`;
	}

	private async ensureDirectory(path: string): Promise<void> {
		if (!path || path === '.') return;

		const folder = this.app.vault.getAbstractFileByPath(path);
		if (!folder) {
			const parentPath = path.substring(0, path.lastIndexOf('/'));
			if (parentPath) {
				await this.ensureDirectory(parentPath);
			}
			try {
				await this.app.vault.createFolder(path);
			} catch {
				// Folder might already exist
			}
		}
	}

	private scheduleSave(): void {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}
		this.saveTimeout = setTimeout(async () => {
			await this.saveChanges();
		}, VectorStore.SAVE_DEBOUNCE_MS);
	}

	private async saveChanges(): Promise<void> {
		// Save dirty items
		for (const id of this.dirtyItems) {
			const item = this.items.get(id);
			if (item) {
				await this.saveItem(item);
			}
		}
		this.dirtyItems.clear();

		// Delete removed items
		for (const id of this.deletedItems) {
			await this.deleteItemFile(id);
		}
		this.deletedItems.clear();
	}

	private async saveItem(item: VectorItem): Promise<void> {
		const fileName = this.getFileNameForId(item.id);
		const filePath = `${this.vectorsDir}/${fileName}`;
		const content = JSON.stringify(item);

		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, content);
			} else {
				await this.app.vault.create(filePath, content);
			}
		} catch (error) {
			console.error(`Failed to save vector ${item.id}:`, error);
		}
	}

	private async deleteItemFile(id: string): Promise<void> {
		const fileName = this.getFileNameForId(id);
		const filePath = `${this.vectorsDir}/${fileName}`;

		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				await this.app.vault.delete(file);
			}
		} catch (error) {
			console.error(`Failed to delete vector file ${id}:`, error);
		}
	}

	async upsert(id: string, vector: number[], metadata: VectorMetadata): Promise<void> {
		if (!this.initialized) {
			throw new Error('VectorStore not initialized');
		}

		this.items.set(id, { id, vector, metadata });
		this.dirtyItems.add(id);
		this.deletedItems.delete(id); // In case it was marked for deletion
		this.scheduleSave();
	}

	async search(
		queryVector: number[],
		limit: number = 5,
		filter?: Partial<VectorMetadata>
	): Promise<VectorSearchResult[]> {
		if (!this.initialized) {
			throw new Error('VectorStore not initialized');
		}

		const results: VectorSearchResult[] = [];

		for (const item of this.items.values()) {
			if (filter && !this.matchesFilter(item.metadata, filter)) {
				continue;
			}

			const score = this.cosineSimilarity(queryVector, item.vector);
			results.push({
				id: item.id,
				score,
				metadata: item.metadata,
			});
		}

		return results.sort((a, b) => b.score - a.score).slice(0, limit);
	}

	private matchesFilter(metadata: VectorMetadata, filter: Partial<VectorMetadata>): boolean {
		for (const [key, value] of Object.entries(filter)) {
			if (key === 'tags') {
				const filterTags = value as string[];
				const itemTags = metadata.tags || [];
				if (!filterTags.some((t) => itemTags.includes(t))) {
					return false;
				}
			} else if (metadata[key as keyof VectorMetadata] !== value) {
				return false;
			}
		}
		return true;
	}

	private cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) {
			return 0;
		}

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
		if (magnitude === 0) return 0;

		return dotProduct / magnitude;
	}

	async delete(id: string): Promise<void> {
		if (!this.initialized) {
			throw new Error('VectorStore not initialized');
		}

		if (this.items.delete(id)) {
			this.dirtyItems.delete(id);
			this.deletedItems.add(id);
			this.scheduleSave();
		}
	}

	async getItem(id: string): Promise<VectorSearchResult | null> {
		if (!this.initialized) {
			throw new Error('VectorStore not initialized');
		}

		const item = this.items.get(id);
		if (!item) return null;

		return {
			id: item.id,
			score: 1.0,
			metadata: item.metadata,
		};
	}

	async clear(): Promise<void> {
		if (!this.initialized) {
			throw new Error('VectorStore not initialized');
		}

		// Mark all items for deletion
		for (const id of this.items.keys()) {
			this.deletedItems.add(id);
		}
		this.items.clear();
		this.dirtyItems.clear();

		await this.saveChanges();
	}

	async getStats(): Promise<{ count: number }> {
		if (!this.initialized) {
			return { count: 0 };
		}

		return { count: this.items.size };
	}

	/**
	 * Force save any pending changes (call on plugin unload)
	 */
	async flush(): Promise<void> {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}
		await this.saveChanges();
	}
}
