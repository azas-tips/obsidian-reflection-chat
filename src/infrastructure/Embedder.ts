import { pipeline, env } from '@huggingface/transformers';

export interface EmbedderOptions {
	pluginPath?: string;
	useWebGPU?: boolean;
}

export class Embedder {
	private extractor: any = null;
	private modelId = 'sirasagi62/ruri-v3-30m-onnx';
	private isLoading = false;
	private loadPromise: Promise<void> | null = null;
	private cachePath: string;
	private useWebGPU: boolean;
	private device: 'webgpu' | 'cpu' = 'cpu';

	constructor(pluginPath?: string, options?: EmbedderOptions) {
		// Set cache directory based on plugin path or use default
		this.cachePath = pluginPath ? `${pluginPath}/.cache/transformers` : './.cache/transformers';
		this.useWebGPU = options?.useWebGPU ?? true; // Enable by default, will fallback if unavailable
	}

	async initialize(): Promise<void> {
		if (this.extractor) return;
		if (this.loadPromise) return this.loadPromise;

		// Configure transformers.js for local caching
		env.cacheDir = this.cachePath;
		env.allowLocalModels = true;

		this.loadPromise = this.loadModel();
		await this.loadPromise;
	}

	private async checkWebGPUSupport(): Promise<boolean> {
		if (!this.useWebGPU) return false;

		try {
			if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
				const gpu = (navigator as any).gpu;
				if (gpu) {
					const adapter = await gpu.requestAdapter();
					return adapter !== null;
				}
			}
		} catch {
			// WebGPU not available
		}
		return false;
	}

	private async loadModel(): Promise<void> {
		if (this.isLoading) return;
		this.isLoading = true;

		try {
			// Check WebGPU availability
			const webgpuAvailable = await this.checkWebGPUSupport();
			this.device = webgpuAvailable ? 'webgpu' : 'cpu';

			console.log(`Loading embedding model: ${this.modelId} (device: ${this.device})`);

			const pipelineOptions: any = {};
			if (webgpuAvailable) {
				pipelineOptions.device = 'webgpu';
			}

			this.extractor = await pipeline('feature-extraction', this.modelId, pipelineOptions);
			console.log('Embedding model loaded successfully');
		} catch (error) {
			// If WebGPU fails, try falling back to CPU
			if (this.device === 'webgpu') {
				console.warn('WebGPU failed, falling back to CPU');
				this.device = 'cpu';
				try {
					this.extractor = await pipeline('feature-extraction', this.modelId);
					console.log('Embedding model loaded successfully (CPU fallback)');
					return;
				} catch (fallbackError) {
					console.error('Failed to load embedding model (fallback):', fallbackError);
					throw fallbackError;
				}
			}
			console.error('Failed to load embedding model:', error);
			throw error;
		} finally {
			this.isLoading = false;
		}
	}

	getDevice(): string {
		return this.device;
	}

	async embedQuery(text: string): Promise<number[]> {
		await this.initialize();

		// Add query prefix for better retrieval
		const prefixedText = `クエリ: ${text}`;
		return this.embed(prefixedText);
	}

	async embedDocument(text: string): Promise<number[]> {
		await this.initialize();

		// Add document prefix
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
			const embedding = isQuery
				? await this.embedQuery(text)
				: await this.embedDocument(text);
			results.push(embedding);
		}
		return results;
	}

	isReady(): boolean {
		return this.extractor !== null;
	}
}
