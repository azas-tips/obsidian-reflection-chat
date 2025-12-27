import { getTranslations } from '../i18n';

// API error response body structure
interface ApiErrorBody {
	error?: {
		message?: string;
		code?: string;
	};
}

// Custom error types for better error handling

export class ReflectionChatError extends Error {
	constructor(
		message: string,
		public readonly code: string
	) {
		super(message);
		this.name = 'ReflectionChatError';
	}
}

export class ApiError extends ReflectionChatError {
	constructor(
		message: string,
		public readonly statusCode?: number,
		public readonly originalError?: Error
	) {
		super(message, 'API_ERROR');
		this.name = 'ApiError';
	}

	static fromResponse(status: number, body?: ApiErrorBody): ApiError {
		const t = getTranslations();
		let message = `API request failed with status ${status}`;

		if (body?.error?.message) {
			message = body.error.message;
		} else if (status === 401) {
			message = t.errors.invalidApiKey;
		} else if (status === 429) {
			message = t.errors.rateLimited;
		} else if (status === 500) {
			message = t.errors.serverError;
		} else if (status === 503) {
			message = t.errors.serviceUnavailable;
		}

		return new ApiError(message, status);
	}

	static networkError(error: Error): ApiError {
		const t = getTranslations();
		return new ApiError(t.errors.networkError, undefined, error);
	}
}

export class EmbeddingError extends ReflectionChatError {
	constructor(
		message: string,
		public readonly originalError?: Error
	) {
		super(message, 'EMBEDDING_ERROR');
		this.name = 'EmbeddingError';
	}

	static modelLoadError(error: Error): EmbeddingError {
		const t = getTranslations();
		return new EmbeddingError(t.errors.embeddingLoadFailed, error);
	}

	static embeddingGenerationError(error: Error): EmbeddingError {
		const t = getTranslations();
		return new EmbeddingError(t.errors.embeddingGenerateFailed, error);
	}
}

export class StorageError extends ReflectionChatError {
	constructor(
		message: string,
		public readonly originalError?: Error
	) {
		super(message, 'STORAGE_ERROR');
		this.name = 'StorageError';
	}

	static folderCreateError(folderPath: string, error: Error): StorageError {
		const t = getTranslations();
		return new StorageError(`${t.errors.folderCreateFailed} (${folderPath})`, error);
	}

	static fileWriteError(filePath: string, error: Error): StorageError {
		const t = getTranslations();
		return new StorageError(`${t.errors.fileWriteFailed} (${filePath})`, error);
	}

	static indexError(error: Error): StorageError {
		const t = getTranslations();
		return new StorageError(t.errors.indexOperationFailed, error);
	}
}

// User-friendly error messages
export function getErrorMessage(error: unknown): string {
	const t = getTranslations();

	if (error instanceof ReflectionChatError) {
		return error.message;
	}

	if (error instanceof Error) {
		// Check for common error patterns
		if (error.message.includes('fetch')) {
			return t.errors.networkError;
		}
		if (error.message.includes('JSON')) {
			return t.errors.parseError;
		}
		if (error.message.includes('timeout')) {
			return t.errors.timeout;
		}
		return error.message;
	}

	return t.errors.unknown;
}

// Retry utility
export async function withRetry<T>(
	fn: () => Promise<T>,
	options: {
		maxRetries?: number;
		delayMs?: number;
		shouldRetry?: (error: unknown) => boolean;
	} = {}
): Promise<T> {
	const { maxRetries = 3, delayMs = 1000, shouldRetry = () => true } = options;

	// Ensure maxRetries is at least 0
	const safeMaxRetries = Math.max(0, maxRetries);
	let lastError: unknown = new Error('Retry function failed without executing');

	for (let attempt = 0; attempt <= safeMaxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;

			if (attempt === safeMaxRetries || !shouldRetry(error)) {
				throw error;
			}

			// Exponential backoff
			await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
		}
	}

	throw lastError;
}
