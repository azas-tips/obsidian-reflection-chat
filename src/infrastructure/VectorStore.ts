import { LocalIndex } from 'vectra';

export interface VectorMetadata {
	path: string;
	title: string;
	date: string;
	summary: string;
	tags: string[];
	category: string;
	type: 'session' | 'entity';
}

export interface VectorSearchResult {
	id: string;
	score: number;
	metadata: VectorMetadata;
}

export class VectorStore {
	private index: LocalIndex | null = null;
	private indexPath: string;

	constructor(basePath: string) {
		// Use simple string concatenation instead of path.join for browser compatibility
		this.indexPath = basePath.endsWith('/') ? `${basePath}vectors` : `${basePath}/vectors`;
	}

	async initialize(): Promise<void> {
		if (this.index) return;

		try {
			this.index = new LocalIndex(this.indexPath);

			// Check if index exists, create if not
			if (!(await this.index.isIndexCreated())) {
				await this.index.createIndex();
				console.log('Vector index created at:', this.indexPath);
			}
		} catch (error) {
			console.error('Failed to initialize vector store:', error);
			throw error;
		}
	}

	async upsert(id: string, vector: number[], metadata: VectorMetadata): Promise<void> {
		if (!this.index) {
			throw new Error('VectorStore not initialized');
		}

		try {
			// Check if item exists
			const existing = await this.index.getItem(id);

			if (existing) {
				// Update existing item
				await this.index.deleteItem(id);
			}

			// Insert new item
			await this.index.insertItem({
				id,
				vector,
				metadata: metadata as unknown as Record<string, any>,
			});
		} catch (error) {
			console.error('Upsert error:', error);
			throw error;
		}
	}

	async search(
		queryVector: number[],
		limit: number = 5,
		filter?: Partial<VectorMetadata>
	): Promise<VectorSearchResult[]> {
		if (!this.index) {
			throw new Error('VectorStore not initialized');
		}

		try {
			const results = await this.index.queryItems(queryVector, limit * 2);

			// Apply filter if provided
			let filtered = results;
			if (filter) {
				filtered = results.filter((item) => {
					const meta = item.item.metadata as unknown as VectorMetadata;
					for (const [key, value] of Object.entries(filter)) {
						if (key === 'tags') {
							// Check if any tag matches
							const filterTags = value as string[];
							const itemTags = meta.tags || [];
							if (!filterTags.some((t) => itemTags.includes(t))) {
								return false;
							}
						} else if (meta[key as keyof VectorMetadata] !== value) {
							return false;
						}
					}
					return true;
				});
			}

			return filtered.slice(0, limit).map((item) => ({
				id: item.item.id,
				score: item.score,
				metadata: item.item.metadata as unknown as VectorMetadata,
			}));
		} catch (error) {
			console.error('Search error:', error);
			throw error;
		}
	}

	async delete(id: string): Promise<void> {
		if (!this.index) {
			throw new Error('VectorStore not initialized');
		}

		try {
			await this.index.deleteItem(id);
		} catch (error) {
			// Ignore if item doesn't exist
			console.log('Delete warning:', error);
		}
	}

	async getItem(id: string): Promise<VectorSearchResult | null> {
		if (!this.index) {
			throw new Error('VectorStore not initialized');
		}

		try {
			const item = await this.index.getItem(id);
			if (!item) return null;

			return {
				id: item.id,
				score: 1.0,
				metadata: item.metadata as unknown as VectorMetadata,
			};
		} catch {
			return null;
		}
	}

	async clear(): Promise<void> {
		if (!this.index) {
			throw new Error('VectorStore not initialized');
		}

		// Recreate the index
		await this.index.deleteIndex();
		await this.index.createIndex();
	}

	async getStats(): Promise<{ count: number }> {
		if (!this.index) {
			throw new Error('VectorStore not initialized');
		}

		try {
			const stats = await this.index.listItems();
			return { count: stats.length };
		} catch {
			return { count: 0 };
		}
	}
}
