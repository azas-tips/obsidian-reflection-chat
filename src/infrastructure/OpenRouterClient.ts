import type { ChatMessage, OpenRouterModel, StreamChunk } from '../types';
import { ApiError, withRetry } from '../utils/errors';

export interface OpenRouterOptions {
	model: string;
	temperature?: number;
	maxTokens?: number;
}

export class OpenRouterClient {
	private apiKey: string;
	private baseUrl = 'https://openrouter.ai/api/v1';
	private timeout = 60000; // 60 seconds

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	setApiKey(apiKey: string): void {
		this.apiKey = apiKey;
	}

	isConfigured(): boolean {
		return this.apiKey.length > 0;
	}

	private getHeaders(): Record<string, string> {
		return {
			Authorization: `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://github.com/haruki/obsidian-reflection-chat',
			'X-Title': 'Reflection Chat',
		};
	}

	private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal,
			});
			return response;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw new ApiError('リクエストがタイムアウトしました。', 408);
			}
			throw ApiError.networkError(error as Error);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	async complete(messages: ChatMessage[], options: OpenRouterOptions): Promise<string> {
		if (!this.isConfigured()) {
			throw new ApiError('APIキーが設定されていません。', 401);
		}

		return withRetry(
			async () => {
				const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
					method: 'POST',
					headers: this.getHeaders(),
					body: JSON.stringify({
						model: options.model,
						messages,
						temperature: options.temperature ?? 0.7,
						max_tokens: options.maxTokens ?? 2048,
						stream: false,
					}),
				});

				if (!response.ok) {
					const errorBody = await response.json().catch(() => ({}));
					throw ApiError.fromResponse(response.status, errorBody);
				}

				const data = await response.json();
				return data.choices[0]?.message?.content || '';
			},
			{
				maxRetries: 2,
				delayMs: 1000,
				shouldRetry: (error) => {
					if (error instanceof ApiError) {
						// Retry on server errors and rate limits
						return error.statusCode === 429 || (error.statusCode ?? 0) >= 500;
					}
					return false;
				},
			}
		);
	}

	async stream(
		messages: ChatMessage[],
		options: OpenRouterOptions,
		onChunk: (chunk: string) => void
	): Promise<string> {
		if (!this.isConfigured()) {
			throw new ApiError('APIキーが設定されていません。', 401);
		}

		const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: this.getHeaders(),
			body: JSON.stringify({
				model: options.model,
				messages,
				temperature: options.temperature ?? 0.7,
				max_tokens: options.maxTokens ?? 2048,
				stream: true,
			}),
		});

		if (!response.ok) {
			const errorBody = await response.json().catch(() => ({}));
			throw ApiError.fromResponse(response.status, errorBody);
		}

		if (!response.body) {
			throw new ApiError('レスポンスボディがありません。', 500);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let fullContent = '';
		let buffer = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				// Process complete lines
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					const trimmedLine = line.trim();
					if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;

					const data = trimmedLine.slice(5).trim();
					if (data === '[DONE]') continue;

					try {
						const chunk: StreamChunk = JSON.parse(data);
						const content = chunk.choices[0]?.delta?.content;
						if (content) {
							fullContent += content;
							onChunk(content);
						}
					} catch {
						// Skip invalid JSON
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		return fullContent;
	}

	async fetchModels(): Promise<OpenRouterModel[]> {
		if (!this.isConfigured()) {
			return [];
		}

		try {
			const response = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
				method: 'GET',
				headers: this.getHeaders(),
			});

			if (!response.ok) {
				throw ApiError.fromResponse(response.status);
			}

			const data = await response.json();
			return data.data as OpenRouterModel[];
		} catch (error) {
			console.error('Failed to fetch models:', error);
			return [];
		}
	}

	async testConnection(): Promise<{ success: boolean; message: string }> {
		if (!this.isConfigured()) {
			return { success: false, message: 'APIキーを入力してください。' };
		}

		try {
			const response = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
				method: 'GET',
				headers: this.getHeaders(),
			});

			if (response.ok) {
				return { success: true, message: '接続成功！' };
			}

			if (response.status === 401) {
				return { success: false, message: 'APIキーが無効です。' };
			}

			return { success: false, message: `接続失敗: ${response.status}` };
		} catch (error) {
			if (error instanceof ApiError) {
				return { success: false, message: error.message };
			}
			return { success: false, message: 'ネットワークエラーが発生しました。' };
		}
	}
}
