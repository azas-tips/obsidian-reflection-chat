// Shared frontmatter parsing utility

export interface ParsedNote {
	frontmatter: Record<string, unknown>;
	body: string;
}

/**
 * Type guard to check if a value is a non-empty string
 */
export function isString(value: unknown): value is string {
	return typeof value === 'string';
}

/**
 * Type guard to check if a value is a string array
 */
export function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Safely get a string value from frontmatter with optional default
 */
export function getFrontmatterString(
	frontmatter: Record<string, unknown>,
	key: string,
	defaultValue = ''
): string {
	const value = frontmatter[key];
	return isString(value) ? value : defaultValue;
}

/**
 * Safely get a string array from frontmatter with optional default
 */
export function getFrontmatterStringArray(
	frontmatter: Record<string, unknown>,
	key: string,
	defaultValue: string[] = []
): string[] {
	const value = frontmatter[key];
	return isStringArray(value) ? value : defaultValue;
}

// Maximum number of items in an inline array to prevent DoS
const MAX_INLINE_ARRAY_ITEMS = 100;
// Maximum characters to parse in an inline array to prevent performance issues
const MAX_INLINE_ARRAY_LENGTH = 10000;

/**
 * Parse an inline array value, handling quoted strings with commas
 * e.g., [item1, "item, with comma", item3]
 * Handles edge cases like unclosed quotes gracefully
 * Limits array size and input length to prevent DoS from malformed content
 */
function parseInlineArray(value: string): string[] {
	// Limit input size to prevent performance issues with very long strings
	if (value.length > MAX_INLINE_ARRAY_LENGTH) {
		return [];
	}

	const items: string[] = [];
	let current = '';
	let inQuotes = false;
	let quoteChar = '';

	for (let i = 0; i < value.length; i++) {
		const char = value[i];

		if (!inQuotes && (char === '"' || char === "'")) {
			inQuotes = true;
			quoteChar = char;
		} else if (inQuotes && char === quoteChar) {
			// Check for escaped quote
			if (i > 0 && value[i - 1] === '\\') {
				current = current.slice(0, -1) + char; // Replace escape with quote
			} else {
				inQuotes = false;
				quoteChar = '';
			}
		} else if (!inQuotes && char === ',') {
			const trimmed = current.trim();
			if (trimmed) {
				items.push(trimmed);
				// Enforce size limit to prevent DoS
				if (items.length >= MAX_INLINE_ARRAY_ITEMS) {
					return items;
				}
			}
			current = '';
		} else {
			current += char;
		}
	}

	// Handle last item, including unclosed quotes gracefully
	// If we're still in quotes at the end, treat remaining content as the last item
	if (items.length < MAX_INLINE_ARRAY_ITEMS) {
		const trimmed = current.trim();
		if (trimmed) {
			// Remove any unmatched quote at the start if we ended mid-quote
			if (inQuotes && trimmed.startsWith(quoteChar)) {
				items.push(trimmed.slice(1));
			} else {
				items.push(trimmed);
			}
		}
	}

	return items;
}

/**
 * Remove surrounding quotes and handle escaped quotes
 */
function unquoteString(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		// Remove quotes and unescape internal quotes
		return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
	}
	return trimmed;
}

/**
 * Parse frontmatter from markdown content
 * Supports simple YAML frontmatter with string, array values
 * Handles quoted strings, escaped quotes, and commas in array values
 */
export function parseFrontmatter(content: string): ParsedNote {
	const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
	const match = content.match(frontmatterRegex);

	if (!match) {
		return { frontmatter: {}, body: content };
	}

	const frontmatterStr = match[1];
	const body = content.slice(match[0].length);

	// Simple YAML parsing with improved edge case handling
	const frontmatter: Record<string, unknown> = {};
	const lines = frontmatterStr.split('\n');

	for (const line of lines) {
		// Skip empty lines and comments
		const trimmedLine = line.trim();
		if (!trimmedLine || trimmedLine.startsWith('#')) continue;

		const colonIndex = line.indexOf(':');
		if (colonIndex === -1) continue;

		const key = line.slice(0, colonIndex).trim();
		if (!key) continue; // Skip if no key

		const rawValue = line.slice(colonIndex + 1).trim();

		// Handle arrays (inline format: [item1, item2])
		if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
			const arrayContent = rawValue.slice(1, -1);
			frontmatter[key] = parseInlineArray(arrayContent)
				.map(unquoteString)
				.filter((v) => v.length > 0);
		} else {
			// Handle quoted strings with proper unquoting
			frontmatter[key] = unquoteString(rawValue);
		}
	}

	return { frontmatter, body };
}
