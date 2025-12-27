// Simple logger with levels

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

class Logger {
	private prefix = '[ReflectionChat]';
	private level: LogLevel = 'info';

	setLevel(level: LogLevel): void {
		this.level = level;
	}

	private shouldLog(level: LogLevel): boolean {
		return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
	}

	debug(message: string, ...args: unknown[]): void {
		if (this.shouldLog('debug')) {
			console.debug(`${this.prefix} ${message}`, ...args);
		}
	}

	info(message: string, ...args: unknown[]): void {
		if (this.shouldLog('info')) {
			console.info(`${this.prefix} ${message}`, ...args);
		}
	}

	warn(message: string, ...args: unknown[]): void {
		if (this.shouldLog('warn')) {
			console.warn(`${this.prefix} ${message}`, ...args);
		}
	}

	error(message: string, error?: Error, ...args: unknown[]): void {
		if (this.shouldLog('error')) {
			console.error(`${this.prefix} ${message}`, error, ...args);
		}
	}
}

export const logger = new Logger();
