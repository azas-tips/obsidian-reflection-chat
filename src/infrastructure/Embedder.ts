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
		if (this.apiKey !== apiKey) {
			this.apiKey = apiKey;
			// Reset initialized flag to require re-validation
			this.initialized = false;
		}
	}

	setModel(model: string): void {
		if (this.model !== model) {
			this.model = model;
			// Model change doesn't require re-initialization
			// as the new model will be used on next embed call
		}
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

		// Capture API key at start to ensure consistent use throughout the method
		// This prevents issues if setApiKey() is called during an embed operation
		const apiKey = this.apiKey;
		if (!apiKey) {
			throw new Error('OpenRouter API key not set');
		}

		// Ensure embedder is initialized (may have been reset by setApiKey)
		if (!this.initialized) {
			await this.initialize();
		}

		// Re-check API key after async initialize() in case it changed
		if (this.apiKey !== apiKey) {
			throw new Error('API key changed during embed operation, please retry');
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), Embedder.EMBEDDING_TIMEOUT_MS);

		try {
			// Truncate text if too long (using safe truncation to avoid splitting multi-byte chars)
			let truncatedText = text;
			if (text.length > Embedder.MAX_EMBEDDING_CHARS) {
				truncatedText = this.safeTruncate(text, Embedder.MAX_EMBEDDING_CHARS);
				logger.warn(
					`Text truncated for embedding: ${text.length} → ${truncatedText.length} chars`
				);
			}

			const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
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
					// Only extract safe error fields - redact BEFORE truncating to avoid partial key leak
					if (errorBody.error?.message) {
						const redacted = this.redactSecrets(String(errorBody.error.message));
						errorMessage = redacted.slice(0, 200);
					} else if (errorBody.message) {
						const redacted = this.redactSecrets(String(errorBody.message));
						errorMessage = redacted.slice(0, 200);
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

	/**
	 * Safely truncate a string without splitting multi-byte characters
	 * Ensures we don't cut in the middle of a surrogate pair
	 */
	private safeTruncate(text: string, maxLength: number): string {
		if (maxLength <= 0) return '';
		if (text.length <= maxLength) return text;

		// Check if we're cutting in the middle of a surrogate pair
		let end = maxLength;
		const charCode = text.charCodeAt(end - 1);

		// If the last character is a high surrogate (0xD800-0xDBFF), include the low surrogate too
		if (charCode >= 0xd800 && charCode <= 0xdbff && end < text.length) {
			// The high surrogate needs its low surrogate pair, so we cut before it
			end--;
		}

		return text.slice(0, end);
	}

	/**
	 * Redact potential secrets from error messages
	 * Removes patterns that look like API keys, tokens, or credentials
	 */
	private redactSecrets(message: string): string {
		// Redact common API key patterns (sk-xxx, key-xxx, etc.)
		const apiKeyPattern = /\b(sk-|key-|api[_-]?key[_-]?)[a-zA-Z0-9_-]{10,}\b/gi;
		let redacted = message.replace(apiKeyPattern, '[REDACTED]');
		// Redact Bearer tokens
		redacted = redacted.replace(/Bearer\s+[a-zA-Z0-9_.-]+/gi, 'Bearer [REDACTED]');
		// Redact long alphanumeric strings that look like secrets (32+ chars)
		redacted = redacted.replace(/\b[a-zA-Z0-9_-]{32,}\b/g, '[REDACTED]');
		return redacted;
	}
}
