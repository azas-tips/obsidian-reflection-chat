/**
 * Utility functions for sanitizing user input and file paths
 */

/**
 * Generate a unique ID that is collision-resistant
 * Uses crypto.randomUUID if available (modern browsers, Electron),
 * falls back to a timestamp + crypto random bytes combination
 */
export function generateId(): string {
	// Use crypto.randomUUID if available (most modern environments)
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	// Fallback: timestamp + crypto random bytes for better collision resistance
	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		const timestamp = Date.now().toString(36);
		const randomBytes = new Uint8Array(8);
		crypto.getRandomValues(randomBytes);
		const randomPart = Array.from(randomBytes)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
		return `${timestamp}-${randomPart}`;
	}

	// Last resort fallback (should rarely be needed)
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 10);
	const counter = ((globalThis as { __idCounter?: number }).__idCounter =
		((globalThis as { __idCounter?: number }).__idCounter || 0) + 1);
	return `${timestamp}-${random}-${counter.toString(36)}`;
}

/**
 * Sanitize a file name by removing or replacing dangerous characters
 * Prevents path traversal attacks and invalid file names
 */
export function sanitizeFileName(name: string): string {
	return (
		name
			// Remove path traversal sequences
			.replace(/\.\./g, '')
			// Remove forward and back slashes
			.replace(/[/\\]/g, '_')
			// Remove other invalid file name characters
			.replace(/[<>:"|?*]/g, '_')
			// Remove leading/trailing spaces and dots
			.trim()
			.replace(/^\.+|\.+$/g, '') ||
		// Ensure non-empty
		'unnamed'
	);
}

/**
 * Escape special regex characters in a string
 * Use when creating RegExp from user input or translations
 */
export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate and normalize a folder path
 * Returns null if path is invalid, otherwise returns normalized path
 * Prevents path traversal and ensures safe folder paths within vault
 */
export function validateFolderPath(path: string): string | null {
	if (!path || typeof path !== 'string') {
		return null;
	}

	// Trim whitespace
	let normalized = path.trim();

	// Check for empty path after trim
	if (!normalized) {
		return null;
	}

	// Check for absolute paths (Unix and Windows)
	if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
		return null;
	}

	// Check for path traversal attempts
	if (normalized.includes('..')) {
		return null;
	}

	// Check for dangerous characters
	if (/[<>:"|?*\\]/.test(normalized)) {
		return null;
	}

	// Normalize path separators and remove duplicate slashes
	normalized = normalized.replace(/\/+/g, '/');

	// Remove trailing slash
	normalized = normalized.replace(/\/$/, '');

	// Remove leading slash if somehow present
	normalized = normalized.replace(/^\//, '');

	// Limit path length
	const MAX_PATH_LENGTH = 200;
	if (normalized.length > MAX_PATH_LENGTH) {
		return null;
	}

	return normalized;
}
