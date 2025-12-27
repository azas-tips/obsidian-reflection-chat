import { App, TFile } from 'obsidian';

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

interface VectorIndex {
	version: number;
	items: VectorItem[];
}

/**
 * Browser-compatible vector store using Obsidian's vault API
 * Stores vectors in a JSON file within the plugin folder
 */
export class VectorStore {
	private app: App;
	private indexPath: string;
	private items: Map<string, VectorItem> = new Map();
	private initialized = false;
	private dirty = false;
	private saveTimeout: ReturnType<typeof setTimeout> | null = null;

	private static readonly INDEX_VERSION = 1;
	private static readonly SAVE_DEBOUNCE_MS = 1000;

	constructor(app: App, basePath: string) {
		this.app = app;
		// Store index in plugin folder as JSON
		this.indexPath = basePath.endsWith('/')
			? `${basePath}vector-index.json`
			: `${basePath}/vector-index.json`;
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			await this.loadIndex();
			this.initialized = true;
			console.log('Vector store initialized with', this.items.size, 'items');
		} catch (error) {
			console.error('Failed to initialize vector store:', error);
			// Start with empty index
			this.items = new Map();
			this.initialized = true;
		}
	}

	private async loadIndex(): Promise<void> {
		try {
			const file = this.app.vault.getAbstractFileByPath(this.indexPath);
			if (file instanceof TFile) {
				const content = await this.app.vault.read(file);
				const index: VectorIndex = JSON.parse(content);

				// Version check for future migrations
				if (index.version === VectorStore.INDEX_VERSION) {
					this.items = new Map(index.items.map((item) => [item.id, item]));
				} else {
					console.log('Vector index version mismatch, starting fresh');
					this.items = new Map();
				}
			}
		} catch {
			// File doesn't exist or is invalid, start fresh
			this.items = new Map();
		}
	}

	private async saveIndex(): Promise<void> {
		const index: VectorIndex = {
			version: VectorStore.INDEX_VERSION,
			items: Array.from(this.items.values()),
		};

		const content = JSON.stringify(index);

		try {
			const file = this.app.vault.getAbstractFileByPath(this.indexPath);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, content);
			} else {
				// Create new file - ensure directory exists
				const dirPath = this.indexPath.substring(0, this.indexPath.lastIndexOf('/'));
				await this.ensureDirectory(dirPath);
				await this.app.vault.create(this.indexPath, content);
			}
		} catch (error) {
			console.error('Failed to save vector index:', error);
			throw error;
		}
	}

	private async ensureDirectory(path: string): Promise<void> {
		if (!path || path === '.') return;

		const folder = this.app.vault.getAbstractFileByPath(path);
		if (!folder) {
			// Create parent directories recursively
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
		this.dirty = true;
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}
		this.saveTimeout = setTimeout(async () => {
			if (this.dirty) {
				await this.saveIndex();
				this.dirty = false;
			}
		}, VectorStore.SAVE_DEBOUNCE_MS);
	}

	async upsert(id: string, vector: number[], metadata: VectorMetadata): Promise<void> {
		if (!this.initialized) {
			throw new Error('VectorStore not initialized');
		}

		this.items.set(id, { id, vector, metadata });
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
			// Apply filter
			if (filter && !this.matchesFilter(item.metadata, filter)) {
				continue;
			}

			// Calculate cosine similarity
			const score = this.cosineSimilarity(queryVector, item.vector);
			results.push({
				id: item.id,
				score,
				metadata: item.metadata,
			});
		}

		// Sort by score descending and return top results
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

		this.items.clear();
		await this.saveIndex();
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
		if (this.dirty) {
			await this.saveIndex();
			this.dirty = false;
		}
	}
}
