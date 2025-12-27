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

	static fromResponse(status: number, body?: any): ApiError {
		let message = `API request failed with status ${status}`;

		if (body?.error?.message) {
			message = body.error.message;
		} else if (status === 401) {
			message = 'APIキーが無効です。設定を確認してください。';
		} else if (status === 429) {
			message = 'APIのレート制限に達しました。しばらく待ってから再試行してください。';
		} else if (status === 500) {
			message = 'APIサーバーでエラーが発生しました。しばらく待ってから再試行してください。';
		} else if (status === 503) {
			message = 'APIサービスが一時的に利用できません。';
		}

		return new ApiError(message, status);
	}

	static networkError(error: Error): ApiError {
		return new ApiError(
			'ネットワークエラーが発生しました。インターネット接続を確認してください。',
			undefined,
			error
		);
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
		return new EmbeddingError(
			'埋め込みモデルの読み込みに失敗しました。再起動してください。',
			error
		);
	}

	static embeddingGenerationError(error: Error): EmbeddingError {
		return new EmbeddingError('テキストの埋め込み生成に失敗しました。', error);
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
		return new StorageError(`フォルダ "${folderPath}" の作成に失敗しました。`, error);
	}

	static fileWriteError(filePath: string, error: Error): StorageError {
		return new StorageError(`ファイル "${filePath}" の保存に失敗しました。`, error);
	}

	static indexError(error: Error): StorageError {
		return new StorageError('ベクトルインデックスの操作に失敗しました。', error);
	}
}

// User-friendly error messages
export function getErrorMessage(error: unknown): string {
	if (error instanceof ReflectionChatError) {
		return error.message;
	}

	if (error instanceof Error) {
		// Check for common error patterns
		if (error.message.includes('fetch')) {
			return 'ネットワークエラーが発生しました。';
		}
		if (error.message.includes('JSON')) {
			return 'データの解析に失敗しました。';
		}
		if (error.message.includes('timeout')) {
			return 'リクエストがタイムアウトしました。';
		}
		return error.message;
	}

	return '予期しないエラーが発生しました。';
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

	let lastError: unknown;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;

			if (attempt === maxRetries || !shouldRetry(error)) {
				throw error;
			}

			// Exponential backoff
			await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
		}
	}

	throw lastError;
}
