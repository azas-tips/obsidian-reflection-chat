/**
 * Embedder using OpenRouter's embedding API
 * Avoids Transformers.js compatibility issues with Obsidian's CommonJS environment
 */
export class Embedder {
	private apiKey: string;
	private model = 'qwen/qwen3-embedding-0.6b'; // Multilingual, lightweight
	private initialized = false;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	setApiKey(apiKey: string): void {
		this.apiKey = apiKey;
	}

	async initialize(): Promise<void> {
		if (!this.apiKey) {
			throw new Error('OpenRouter API key not set');
		}
		this.initialized = true;
		console.log(`Embedder initialized with model: ${this.model}`);
	}

	async embedQuery(text: string): Promise<number[]> {
		// Add query prefix for better retrieval
		const prefixedText = `クエリ: ${text}`;
		return this.embed(prefixedText);
	}

	async embedDocument(text: string): Promise<number[]> {
		// Add document prefix
		const prefixedText = `文章: ${text}`;
		return this.embed(prefixedText);
	}

	private async embed(text: string): Promise<number[]> {
		if (!this.apiKey) {
			throw new Error('OpenRouter API key not set');
		}

		try {
			// Truncate text if too long
			const maxChars = 8000;
			const truncatedText = text.length > maxChars ? text.slice(0, maxChars) : text;

			const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': 'https://github.com/azas-tips/obsidian-reflection-chat',
					'X-Title': 'Reflection Chat',
				},
				body: JSON.stringify({
					model: this.model,
					input: truncatedText,
				}),
			});

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`Embedding API error: ${response.status} ${error}`);
			}

			const data = await response.json();

			if (!data.data || !data.data[0] || !data.data[0].embedding) {
				throw new Error('Invalid embedding response');
			}

			return data.data[0].embedding;
		} catch (error) {
			console.error('Embedding error:', error);
			throw error;
		}
	}

	async batchEmbed(texts: string[], isQuery = false): Promise<number[][]> {
		const results: number[][] = [];
		for (const text of texts) {
			const embedding = isQuery ? await this.embedQuery(text) : await this.embedDocument(text);
			results.push(embedding);
		}
		return results;
	}

	isReady(): boolean {
		return this.initialized && !!this.apiKey;
	}
}
