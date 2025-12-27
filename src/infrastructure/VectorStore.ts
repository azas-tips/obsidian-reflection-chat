import { App, TFile, TFolder } from 'obsidian';
import { withRetry } from '../utils/errors';
import { logger } from '../utils/logger';

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
	private isInitializing = false; // Prevent concurrent initialization
	private initializationError: Error | null = null; // Track initialization failures
	private saveTimeout: ReturnType<typeof setTimeout> | null = null;
	private saveLock: Promise<void> = Promise.resolve(); // Mutex for save operations

	private static readonly SAVE_DEBOUNCE_MS = 1000;
	private static readonly LEGACY_INDEX_FILE = 'vector-index.json';
	private static readonly MAX_VECTOR_DIMENSION = 4096; // Maximum embedding dimension supported
	private static readonly MIN_VECTOR_DIMENSION = 64; // Minimum expected embedding dimension
	private static readonly MAX_ITEMS_LIMIT = 10000; // Maximum number of vectors to load

	constructor(app: App, basePath: string) {
		this.app = app;
		this.vectorsDir = basePath.endsWith('/') ? `${basePath}vectors` : `${basePath}/vectors`;
	}

	/**
	 * Initialize the vector store by loading existing vectors from disk
	 * @throws Error if initialization fails critically (directory creation fails)
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		// Prevent concurrent initialization attempts
		if (this.isInitializing) return;
		this.isInitializing = true;

		// Create timeout promise with cleanup capability
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => {
				reject(new Error('Vector store initialization timed out'));
			}, VectorStore.INITIALIZATION_TIMEOUT_MS);
		});

		try {
			// Race initialization against timeout
			await Promise.race([this.doInitialize(), timeoutPromise]);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			logger.error('Failed to initialize vector store:', err);

			// Mark as initialized but with error - allows graceful degradation
			this.items = new Map();
			this.initialized = true;
			this.initializationError = err;
			// Reset saveLock to prevent deadlock if it was modified during failed init
			this.saveLock = Promise.resolve();
		} finally {
			// Always clear the timeout to prevent memory leaks and unhandled rejections
			if (timeoutId !== null) {
				clearTimeout(timeoutId);
			}
			this.isInitializing = false;
		}
	}

	private async doInitialize(): Promise<void> {
		// Ensure vectors directory exists - this is critical
		await this.ensureDirectory(this.vectorsDir);

		// Check for legacy single-file format and migrate if needed
		await this.migrateFromLegacyFormat();

		// Load all vector files
		await this.loadAllVectors();

		this.initialized = true;
		this.initializationError = null;
		logger.info(`Vector store initialized with ${this.items.size} items`);
	}

	/**
	 * Check if vector store had initialization errors
	 */
	hasInitializationError(): boolean {
		return this.initializationError !== null;
	}

	/**
	 * Get initialization error if any
	 */
	getInitializationError(): Error | null {
		return this.initializationError;
	}

	private async migrateFromLegacyFormat(): Promise<void> {
		const basePath = this.vectorsDir.substring(0, this.vectorsDir.lastIndexOf('/'));
		const legacyPath = `${basePath}/${VectorStore.LEGACY_INDEX_FILE}`;

		const legacyFile = this.app.vault.getAbstractFileByPath(legacyPath);
		if (!(legacyFile instanceof TFile)) {
			return; // No legacy file, nothing to migrate
		}

		logger.info('Migrating from legacy vector-index.json format...');

		try {
			const content = await this.app.vault.read(legacyFile);
			const legacyData = JSON.parse(content);

			if (legacyData.items && Array.isArray(legacyData.items)) {
				// Transactional migration: track all successful creations
				const createdFiles: string[] = [];
				let migrationFailed = false;

				// Save each item as individual file
				for (const item of legacyData.items) {
					const fileName = this.getFileNameForId(item.id);
					const filePath = `${this.vectorsDir}/${fileName}`;
					try {
						await this.app.vault.create(filePath, JSON.stringify(item));
						createdFiles.push(filePath);
					} catch (createError) {
						logger.error(
							`Failed to create vector file during migration: ${filePath}`,
							createError instanceof Error ? createError : undefined
						);
						migrationFailed = true;
						break;
					}
				}

				if (migrationFailed) {
					// Rollback: delete any files we created
					logger.warn('Migration failed, rolling back created files...');
					for (const filePath of createdFiles) {
						try {
							const file = this.app.vault.getAbstractFileByPath(filePath);
							if (file instanceof TFile) {
								await this.app.vault.delete(file);
							}
						} catch {
							// Ignore rollback errors
						}
					}
					logger.error('Migration aborted, legacy file preserved');
					return;
				}

				logger.info(`Migrated ${legacyData.items.length} vectors to individual files`);

				// Only delete legacy file after all items successfully migrated
				await this.app.vault.delete(legacyFile);
				logger.info('Deleted legacy vector-index.json');
			}
		} catch (error) {
			logger.error('Migration failed:', error instanceof Error ? error : undefined);
		}
	}

	private async loadAllVectors(): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(this.vectorsDir);
		if (!folder) {
			// Directory doesn't exist yet, nothing to load
			return;
		}
		if (!(folder instanceof TFolder)) {
			// Path exists but is not a folder (e.g., a file with same name)
			logger.error(`Vector store path exists but is not a folder: ${this.vectorsDir}`);
			return;
		}

		let loadedCount = 0;
		let skippedCount = 0;

		for (const file of folder.children) {
			// Enforce maximum items limit to prevent memory exhaustion
			if (loadedCount >= VectorStore.MAX_ITEMS_LIMIT) {
				logger.warn(
					`Reached maximum vector limit (${VectorStore.MAX_ITEMS_LIMIT}), skipping remaining files`
				);
				break;
			}

			if (file instanceof TFile && file.extension === 'json') {
				try {
					const content = await this.app.vault.read(file);
					const item: VectorItem = JSON.parse(content);

					// Validate item structure and vector dimensions
					if (!item.id || !item.metadata) {
						logger.debug(
							`Skipping invalid vector file ${file.path}: missing required fields`
						);
						skippedCount++;
						continue;
					}

					const vectorData = item.vector as unknown;
					if (!this.isValidVectorForLoad(vectorData)) {
						const vectorLen = Array.isArray(vectorData) ? vectorData.length : 0;
						logger.debug(
							`Skipping vector file ${file.path}: invalid vector (length: ${vectorLen})`
						);
						skippedCount++;
						continue;
					}

					this.items.set(item.id, item);
					loadedCount++;
				} catch (error) {
					logger.error(
						`Failed to load vector file ${file.path}:`,
						error instanceof Error ? error : undefined
					);
					skippedCount++;
				}
			}
		}

		if (skippedCount > 0) {
			logger.warn(`Skipped ${skippedCount} invalid vector files during load`);
		}
	}

	/**
	 * Validate vector for loading - checks structure and dimension limits
	 */
	private isValidVectorForLoad(vector: unknown): vector is number[] {
		if (!Array.isArray(vector)) {
			return false;
		}
		if (
			vector.length < VectorStore.MIN_VECTOR_DIMENSION ||
			vector.length > VectorStore.MAX_VECTOR_DIMENSION
		) {
			return false;
		}
		// Sample check for valid numbers
		return (
			typeof vector[0] === 'number' &&
			Number.isFinite(vector[0]) &&
			typeof vector[vector.length - 1] === 'number' &&
			Number.isFinite(vector[vector.length - 1])
		);
	}

	/**
	 * Validate vector for upsert - stricter check with full element validation
	 */
	private isValidVectorForUpsert(vector: unknown): vector is number[] {
		if (!Array.isArray(vector)) {
			return false;
		}
		if (
			vector.length < VectorStore.MIN_VECTOR_DIMENSION ||
			vector.length > VectorStore.MAX_VECTOR_DIMENSION
		) {
			return false;
		}
		// Check all elements for upsert (stricter than load)
		for (let i = 0; i < vector.length; i++) {
			if (typeof vector[i] !== 'number' || !Number.isFinite(vector[i])) {
				return false;
			}
		}
		return true;
	}

	private static readonly MAX_FILENAME_LENGTH = 100;
	private static readonly INITIALIZATION_TIMEOUT_MS = 30000; // 30 seconds

	/**
	 * Validate and sanitize an ID to create a safe filename
	 * Prevents path traversal attacks and invalid filenames
	 */
	private getFileNameForId(id: string): string {
		// Validate input
		if (!id || typeof id !== 'string') {
			throw new Error('Invalid ID: must be a non-empty string');
		}

		// Remove all path traversal sequences (.. and variants)
		let safeId = id
			.replace(/\.\./g, '') // Standard path traversal
			.replace(/\.+[/\\]/g, '') // Multiple dots followed by separator
			.replace(/[/\\]\.+/g, ''); // Separator followed by multiple dots

		// Remove any remaining path separators
		safeId = safeId.replace(/[/\\]/g, '_');

		// Replace special characters that might cause issues
		safeId = safeId
			.replace(/[:*?"<>|]/g, '_')
			.replace(/\s+/g, '_')
			.replace(/^\.+/, '') // Remove leading dots
			.replace(/\.+$/, '') // Remove trailing dots (before extension)
			.substring(0, VectorStore.MAX_FILENAME_LENGTH);

		// Ensure we have a valid filename
		if (!safeId) {
			// Fallback to hash of original ID if sanitization results in empty string
			safeId = `id_${this.hashCode(id)}`;
		}

		return `${safeId}.json`;
	}

	/**
	 * Simple hash function for fallback filename generation
	 */
	private hashCode(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			// Bitwise shift above already converts to 32-bit signed integer
		}
		return Math.abs(hash).toString(16);
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
			} catch (error) {
				// Check if folder now exists (race condition with another create)
				const existing = this.app.vault.getAbstractFileByPath(path);
				if (!existing) {
					// Folder still doesn't exist - this is a real error
					logger.error(
						`Failed to create directory ${path}:`,
						error instanceof Error ? error : undefined
					);
				}
				// If folder exists now, another process created it - that's fine
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
		// Use mutex to prevent concurrent save operations
		// Pattern: capture previous lock, create new lock, wait for previous, then release
		const previousLock = this.saveLock;
		const unlock: { fn: () => void } = {
			fn: () => {
				/* no-op default, replaced by Promise resolve */
			},
		};
		this.saveLock = new Promise<void>((resolve) => {
			unlock.fn = resolve;
		});

		try {
			// Wait for any previous save to complete (log but don't block on previous errors)
			// This ensures serialized save operations
			await previousLock.catch((prevError) => {
				logger.warn(
					'Previous save operation failed:',
					prevError instanceof Error ? prevError : undefined
				);
			});

			// Capture items to save/delete (in case new changes come in during save)
			const itemsToSave = new Set(this.dirtyItems);
			const itemsToDelete = new Set(this.deletedItems);

			// Save dirty items - only remove from dirtyItems if save succeeds
			for (const id of itemsToSave) {
				const item = this.items.get(id);
				if (item) {
					try {
						await this.saveItem(item);
						this.dirtyItems.delete(id); // Only clear on success
					} catch (error) {
						// Keep in dirtyItems for retry on next save cycle
						logger.error(
							`Failed to save item ${id}, will retry:`,
							error instanceof Error ? error : undefined
						);
					}
				} else {
					// Item no longer exists, remove from dirty list
					this.dirtyItems.delete(id);
				}
			}

			// Delete removed items - only remove from deletedItems if delete succeeds
			for (const id of itemsToDelete) {
				try {
					await this.deleteItemFile(id);
					this.deletedItems.delete(id); // Only clear on success
				} catch (error) {
					// Keep in deletedItems for retry on next save cycle
					logger.error(
						`Failed to delete item ${id}, will retry:`,
						error instanceof Error ? error : undefined
					);
				}
			}
		} finally {
			// Always release the lock, even if an error occurred
			unlock.fn();
		}
	}

	private async saveItem(item: VectorItem): Promise<void> {
		const fileName = this.getFileNameForId(item.id);
		const filePath = `${this.vectorsDir}/${fileName}`;
		const content = JSON.stringify(item);

		try {
			await withRetry(async () => {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					await this.app.vault.modify(file, content);
				} else {
					await this.app.vault.create(filePath, content);
				}
			});
		} catch (error) {
			logger.error(
				`Failed to save vector ${item.id} after retries:`,
				error instanceof Error ? error : undefined
			);
		}
	}

	private async deleteItemFile(id: string): Promise<void> {
		const fileName = this.getFileNameForId(id);
		const filePath = `${this.vectorsDir}/${fileName}`;

		try {
			await withRetry(async () => {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					await this.app.vault.delete(file);
				}
			});
		} catch (error) {
			logger.error(
				`Failed to delete vector file ${id} after retries:`,
				error instanceof Error ? error : undefined
			);
		}
	}

	async upsert(id: string, vector: number[], metadata: VectorMetadata): Promise<void> {
		if (!this.initialized) {
			throw new Error('VectorStore not initialized');
		}
		if (this.initializationError) {
			throw new Error(
				`VectorStore initialization failed: ${this.initializationError.message}`
			);
		}

		// Validate vector dimensions to prevent storing invalid data
		// Capture length before type guard to avoid unsafe type coercion in error path
		const vectorLen = Array.isArray(vector) ? vector.length : 0;
		if (!this.isValidVectorForUpsert(vector)) {
			throw new Error(
				`Invalid vector: expected ${VectorStore.MIN_VECTOR_DIMENSION}-${VectorStore.MAX_VECTOR_DIMENSION} dimensions, got ${vectorLen}`
			);
		}

		this.items.set(id, { id, vector, metadata });
		this.dirtyItems.add(id);
		this.deletedItems.delete(id); // In case it was marked for deletion
		this.scheduleSave();
	}

	/**
	 * Search for similar vectors using cosine similarity
	 * Uses optimized bounded result set with early termination for efficiency
	 *
	 * @param queryVector - The query embedding vector
	 * @param limit - Maximum number of results to return (default: 5)
	 * @param filter - Optional filter to match metadata fields
	 * @returns Array of results sorted by similarity score (highest first)
	 * @throws Error if store is not initialized
	 */
	async search(
		queryVector: number[],
		limit: number = 5,
		filter?: Partial<VectorMetadata>
	): Promise<VectorSearchResult[]> {
		if (!this.initialized) {
			throw new Error('VectorStore not initialized');
		}
		if (this.initializationError) {
			throw new Error(
				`VectorStore initialization failed: ${this.initializationError.message}`
			);
		}

		// Validate query vector
		if (!this.isValidVector(queryVector)) {
			logger.warn('Invalid query vector provided to search');
			return [];
		}

		// Optimization: maintain a bounded result set with minimum score threshold
		// This avoids sorting the entire result set at the end
		const results: VectorSearchResult[] = [];
		let minScoreInResults = -Infinity;

		// Take a snapshot of items to prevent issues if items are modified during iteration
		const itemsSnapshot = Array.from(this.items.values());

		for (const item of itemsSnapshot) {
			// Skip items with invalid vectors (corrupted data)
			if (!this.isValidVector(item.vector)) {
				logger.debug(`Skipping item ${item.id} with invalid vector`);
				continue;
			}

			if (filter && !this.matchesFilter(item.metadata, filter)) {
				continue;
			}

			const score = this.cosineSimilarity(queryVector, item.vector);

			// Early termination: skip if score can't beat minimum in full result set
			if (results.length >= limit && score <= minScoreInResults) {
				continue;
			}

			const result: VectorSearchResult = {
				id: item.id,
				score,
				metadata: item.metadata,
			};

			// Insert in sorted order for bounded result maintenance
			if (results.length < limit) {
				// Still filling up - insert in sorted position
				const insertIndex = this.findInsertIndex(results, score);
				results.splice(insertIndex, 0, result);
				if (results.length === limit) {
					minScoreInResults = results[results.length - 1].score;
				}
			} else {
				// Result set is full - insert and remove lowest
				const insertIndex = this.findInsertIndex(results, score);
				results.splice(insertIndex, 0, result);
				results.pop(); // Remove lowest score
				minScoreInResults = results[results.length - 1].score;
			}
		}

		return results;
	}

	/**
	 * Binary search to find insertion index for maintaining descending order
	 */
	private findInsertIndex(results: VectorSearchResult[], score: number): number {
		let left = 0;
		let right = results.length;
		while (left < right) {
			const mid = Math.floor((left + right) / 2);
			if (results[mid].score > score) {
				left = mid + 1;
			} else {
				right = mid;
			}
		}
		return left;
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

	private static readonly EPSILON = 1e-10; // Threshold for near-zero magnitude detection

	private cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) {
			return 0;
		}

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			const aVal = a[i];
			const bVal = b[i];

			// Validate vector values - NaN or Infinity corrupts the entire calculation
			if (!Number.isFinite(aVal) || !Number.isFinite(bVal)) {
				return 0;
			}

			dotProduct += aVal * bVal;
			normA += aVal * aVal;
			normB += bVal * bVal;
		}

		const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
		// Use epsilon comparison instead of strict equality for floating-point safety
		if (magnitude < VectorStore.EPSILON) return 0;

		const similarity = dotProduct / magnitude;

		// Final validation - ensure result is valid
		return Number.isFinite(similarity) ? similarity : 0;
	}

	/**
	 * Validate that a vector is a valid array of finite numbers
	 */
	private isValidVector(vector: unknown): vector is number[] {
		if (!Array.isArray(vector) || vector.length === 0) {
			return false;
		}
		// Check first, middle, and last elements for performance (sampling)
		const indicesToCheck = [0, Math.floor(vector.length / 2), vector.length - 1];
		for (const i of indicesToCheck) {
			if (typeof vector[i] !== 'number' || !Number.isFinite(vector[i])) {
				return false;
			}
		}
		return true;
	}

	async delete(id: string): Promise<void> {
		if (!this.initialized) {
			throw new Error('VectorStore not initialized');
		}
		if (this.initializationError) {
			throw new Error(
				`VectorStore initialization failed: ${this.initializationError.message}`
			);
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
		if (this.initializationError) {
			throw new Error(
				`VectorStore initialization failed: ${this.initializationError.message}`
			);
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
		if (this.initializationError) {
			throw new Error(
				`VectorStore initialization failed: ${this.initializationError.message}`
			);
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
