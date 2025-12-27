import type { ChatMessage, OpenRouterModel, StreamChunk } from '../types';
import { ApiError, withRetry } from '../utils/errors';
import { getTranslations } from '../i18n';
import { logger } from '../utils/logger';

export interface OpenRouterOptions {
	model: string;
	temperature?: number;
	maxTokens?: number;
}

export class OpenRouterClient {
	private apiKey: string;
	private baseUrl = 'https://openrouter.ai/api/v1';
	private timeout = 60000; // 60 seconds
	private streamReadTimeout = 30000; // 30 seconds between chunks
	private static readonly MAX_RESPONSE_LENGTH = 500000; // 500KB max response

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
			'HTTP-Referer': 'https://github.com/anthropics/obsidian-reflection-chat',
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
			const t = getTranslations();
			if (error instanceof Error && error.name === 'AbortError') {
				throw new ApiError(t.errors.timeout, 408);
			}
			throw ApiError.networkError(error as Error);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	async complete(messages: ChatMessage[], options: OpenRouterOptions): Promise<string> {
		const t = getTranslations();
		if (!this.isConfigured()) {
			throw new ApiError(t.errors.noApiKey, 401);
		}

		// Validate messages array to prevent API errors
		if (!messages || messages.length === 0) {
			throw new ApiError('Messages array cannot be empty', 400);
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

				// Validate response structure
				if (!data || !Array.isArray(data.choices) || data.choices.length === 0) {
					throw new ApiError('Invalid API response: missing choices array', 500);
				}

				const content = data.choices[0]?.message?.content || '';

				// Validate response length to prevent memory issues
				if (content.length > OpenRouterClient.MAX_RESPONSE_LENGTH) {
					logger.warn('API response exceeded maximum length, truncating');
					const t = getTranslations();
					return (
						content.slice(0, OpenRouterClient.MAX_RESPONSE_LENGTH) +
						t.errors.truncationMarker
					);
				}

				return content;
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
		const t = getTranslations();
		if (!this.isConfigured()) {
			throw new ApiError(t.errors.noApiKey, 401);
		}

		// Validate messages array to prevent API errors
		if (!messages || messages.length === 0) {
			throw new ApiError('Messages array cannot be empty', 400);
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
			throw new ApiError(t.errors.noResponseBody, 500);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let fullContent = '';
		let buffer = '';

		/**
		 * Read with timeout - throws if no data received within streamReadTimeout
		 * Uses settled flag to prevent double resolution and ensure cleanup
		 */
		const readWithTimeout = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
			return new Promise((resolve, reject) => {
				let settled = false;
				const timeoutId = setTimeout(() => {
					if (!settled) {
						settled = true;
						reject(new ApiError(t.errors.timeout, 408));
					}
				}, this.streamReadTimeout);

				reader
					.read()
					.then((result) => {
						clearTimeout(timeoutId);
						if (!settled) {
							settled = true;
							resolve(result);
						}
					})
					.catch((error) => {
						clearTimeout(timeoutId);
						if (!settled) {
							settled = true;
							reject(error);
						}
					});
			});
		};

		try {
			while (true) {
				const { done, value } = await readWithTimeout();
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
							// Enforce response length limit to prevent memory issues
							if (
								fullContent.length + content.length >
								OpenRouterClient.MAX_RESPONSE_LENGTH
							) {
								logger.warn(
									'Streaming response exceeded maximum length, truncating'
								);
								break;
							}
							fullContent += content;
							onChunk(content);
						}
					} catch {
						// Log skipped chunks at debug level for diagnosis
						logger.debug(
							`Skipped invalid JSON chunk: ${data.slice(0, 100)}${data.length > 100 ? '...' : ''}`
						);
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

			// Validate response structure
			if (!data || !Array.isArray(data.data)) {
				logger.warn('Invalid models API response structure');
				return [];
			}

			// Filter and validate each model
			return data.data.filter(
				(model: unknown): model is OpenRouterModel =>
					typeof model === 'object' &&
					model !== null &&
					typeof (model as Record<string, unknown>).id === 'string'
			);
		} catch (error) {
			logger.error('Failed to fetch models:', error instanceof Error ? error : undefined);
			return [];
		}
	}

	async testConnection(): Promise<{ success: boolean; message: string }> {
		const t = getTranslations();
		if (!this.isConfigured()) {
			return { success: false, message: t.notices.apiKeyNotSet };
		}

		try {
			const response = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
				method: 'GET',
				headers: this.getHeaders(),
			});

			if (response.ok) {
				return { success: true, message: t.notices.connectionSuccess };
			}

			if (response.status === 401) {
				return { success: false, message: t.errors.invalidApiKey };
			}

			return { success: false, message: `${t.notices.connectionFailed}${response.status}` };
		} catch (error) {
			if (error instanceof ApiError) {
				return { success: false, message: error.message };
			}
			return { success: false, message: t.errors.networkError };
		}
	}
}
