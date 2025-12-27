// Dynamic import to avoid path resolution issues at bundle load time
let transformersModule: any = null;

async function getTransformers() {
	if (!transformersModule) {
		transformersModule = await import('@xenova/transformers');
	}
	return transformersModule;
}

export interface EmbedderOptions {
	pluginPath?: string;
}

export class Embedder {
	private extractor: any = null;
	private modelId = 'sirasagi62/ruri-v3-30m-onnx';
	private isLoading = false;
	private loadPromise: Promise<void> | null = null;

	constructor(_pluginPath?: string, _options?: EmbedderOptions) {
		// v2 uses browser cache automatically
	}

	async initialize(): Promise<void> {
		if (this.extractor) return;
		if (this.loadPromise) return this.loadPromise;

		this.loadPromise = this.loadModel();
		await this.loadPromise;
	}

	private async loadModel(): Promise<void> {
		if (this.isLoading) return;
		this.isLoading = true;

		try {
			const { pipeline, env } = await getTransformers();

			// Configure transformers.js v2
			env.allowLocalModels = false;
			env.allowRemoteModels = true;

			console.log(`Loading embedding model: ${this.modelId}`);

			this.extractor = await pipeline('feature-extraction', this.modelId, {
				quantized: false, // ruri-v3 uses fp32
			});

			console.log('Embedding model loaded successfully');
		} catch (error) {
			console.error('Failed to load embedding model:', error);
			throw error;
		} finally {
			this.isLoading = false;
		}
	}

	async embedQuery(text: string): Promise<number[]> {
		await this.initialize();

		// ruri-v3 uses クエリ prefix for queries
		const prefixedText = `クエリ: ${text}`;
		return this.embed(prefixedText);
	}

	async embedDocument(text: string): Promise<number[]> {
		await this.initialize();

		// ruri-v3 uses 文章 prefix for documents
		const prefixedText = `文章: ${text}`;
		return this.embed(prefixedText);
	}

	private async embed(text: string): Promise<number[]> {
		if (!this.extractor) {
			throw new Error('Embedder not initialized');
		}

		try {
			// Truncate text if too long (max 8192 tokens, roughly 4x characters for Japanese)
			const maxChars = 8000;
			const truncatedText = text.length > maxChars ? text.slice(0, maxChars) : text;

			const output = await this.extractor(truncatedText, {
				pooling: 'mean',
				normalize: true,
			});

			// Convert to regular array
			return Array.from(output.data);
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
		return this.extractor !== null;
	}
}
