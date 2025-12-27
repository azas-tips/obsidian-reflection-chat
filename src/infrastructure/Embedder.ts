import { getTranslations } from '../i18n';
import { logger } from '../utils/logger';

/**
 * Embedder using OpenRouter's embedding API
 * Avoids Transformers.js compatibility issues with Obsidian's CommonJS environment
 */
export class Embedder {
	private apiKey: string;
	private model: string;
	private initialized = false;

	constructor(apiKey: string, model: string) {
		this.apiKey = apiKey;
		this.model = model;
	}

	setApiKey(apiKey: string): void {
		this.apiKey = apiKey;
	}

	setModel(model: string): void {
		this.model = model;
	}

	private static readonly MIN_API_KEY_LENGTH = 20;

	async initialize(): Promise<void> {
		if (!this.apiKey) {
			throw new Error('OpenRouter API key not set');
		}
		if (this.apiKey.length < Embedder.MIN_API_KEY_LENGTH) {
			throw new Error('OpenRouter API key appears invalid (too short)');
		}
		this.initialized = true;
		logger.info(`Embedder initialized with model: ${this.model}`);
	}

	async embedQuery(text: string): Promise<number[]> {
		const t = getTranslations();
		// Add query prefix for better retrieval
		const prefixedText = `${t.embedding.queryPrefix}${text}`;
		return this.embed(prefixedText);
	}

	async embedDocument(text: string): Promise<number[]> {
		const t = getTranslations();
		// Add document prefix
		const prefixedText = `${t.embedding.documentPrefix}${text}`;
		return this.embed(prefixedText);
	}

	private static readonly EMBEDDING_TIMEOUT_MS = 30000;
	private static readonly MAX_EMBEDDING_CHARS = 8000;
	private static readonly MIN_EMBEDDING_CHARS = 1;

	private async embed(text: string): Promise<number[]> {
		// Input validation
		if (typeof text !== 'string') {
			throw new Error('Embedding input must be a string');
		}

		const trimmedText = text.trim();
		if (trimmedText.length < Embedder.MIN_EMBEDDING_CHARS) {
			throw new Error('Embedding input is too short or empty');
		}

		if (!this.apiKey) {
			throw new Error('OpenRouter API key not set');
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), Embedder.EMBEDDING_TIMEOUT_MS);

		try {
			// Truncate text if too long
			let truncatedText = text;
			if (text.length > Embedder.MAX_EMBEDDING_CHARS) {
				truncatedText = text.slice(0, Embedder.MAX_EMBEDDING_CHARS);
				logger.warn(
					`Text truncated for embedding: ${text.length} → ${Embedder.MAX_EMBEDDING_CHARS} chars`
				);
			}

			const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': 'https://github.com/anthropics/obsidian-reflection-chat',
					'X-Title': 'Reflection Chat',
				},
				body: JSON.stringify({
					model: this.model,
					input: truncatedText,
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				// Parse error safely without exposing sensitive data
				let errorMessage = `HTTP ${response.status}`;
				try {
					const errorBody = await response.json();
					// Only extract safe error fields
					if (errorBody.error?.message) {
						errorMessage = String(errorBody.error.message).slice(0, 200);
					} else if (errorBody.message) {
						errorMessage = String(errorBody.message).slice(0, 200);
					}
				} catch {
					// If JSON parsing fails, use status text only
					errorMessage = `HTTP ${response.status}: ${response.statusText}`;
				}
				throw new Error(`Embedding API error: ${errorMessage}`);
			}

			const data = await response.json();

			if (!data.data || !data.data[0] || !data.data[0].embedding) {
				throw new Error('Invalid embedding response');
			}

			return data.data[0].embedding;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error('Embedding request timed out');
			}
			logger.error('Embedding error:', error instanceof Error ? error : undefined);
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private static readonly CONCURRENCY_LIMIT = 5;

	/**
	 * Result of a batch embedding operation for a single item
	 */
	public static readonly BatchResultStatus = {
		SUCCESS: 'success',
		FAILED: 'failed',
	} as const;

	/**
	 * Batch embed multiple texts with controlled concurrency
	 * Uses parallel processing with a concurrency limit to balance speed and rate limiting
	 * Uses Promise.allSettled to handle individual failures gracefully
	 *
	 * @param texts - Array of texts to embed
	 * @param isQuery - Whether to use query prefix (for search) or document prefix
	 * @returns Object containing embeddings array and failure count for monitoring
	 */
	async batchEmbed(
		texts: string[],
		isQuery = false
	): Promise<{ embeddings: (number[] | null)[]; failureCount: number }> {
		const embeddings: (number[] | null)[] = new Array(texts.length).fill(null);
		let failureCount = 0;

		// Process in batches with concurrency limit
		for (let i = 0; i < texts.length; i += Embedder.CONCURRENCY_LIMIT) {
			const batch = texts.slice(i, i + Embedder.CONCURRENCY_LIMIT);
			const batchPromises = batch.map((text) =>
				isQuery ? this.embedQuery(text) : this.embedDocument(text)
			);

			const batchResults = await Promise.allSettled(batchPromises);

			for (let j = 0; j < batchResults.length; j++) {
				const result = batchResults[j];
				if (result.status === 'fulfilled') {
					embeddings[i + j] = result.value;
				} else {
					logger.error(
						`Embedding failed for text ${i + j}:`,
						result.reason instanceof Error ? result.reason : undefined
					);
					embeddings[i + j] = null;
					failureCount++;
				}
			}
		}

		// Log summary if there were failures
		if (failureCount > 0) {
			logger.warn(`Batch embedding completed with ${failureCount}/${texts.length} failures`);
		}

		return { embeddings, failureCount };
	}

	isReady(): boolean {
		return this.initialized && !!this.apiKey;
	}
}
