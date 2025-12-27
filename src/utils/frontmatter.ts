// Shared frontmatter parsing utility

export interface ParsedNote {
	frontmatter: Record<string, any>;
	body: string;
}

/**
 * Parse frontmatter from markdown content
 * Supports simple YAML frontmatter with string, array values
 */
export function parseFrontmatter(content: string): ParsedNote {
	const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
	const match = content.match(frontmatterRegex);

	if (!match) {
		return { frontmatter: {}, body: content };
	}

	const frontmatterStr = match[1];
	const body = content.slice(match[0].length);

	// Simple YAML parsing
	const frontmatter: Record<string, any> = {};
	const lines = frontmatterStr.split('\n');

	for (const line of lines) {
		const colonIndex = line.indexOf(':');
		if (colonIndex === -1) continue;

		const key = line.slice(0, colonIndex).trim();
		let value = line.slice(colonIndex + 1).trim();

		// Handle arrays (inline format: [item1, item2])
		if (value.startsWith('[') && value.endsWith(']')) {
			value = value.slice(1, -1);
			frontmatter[key] = value
				.split(',')
				.map((v) => v.trim().replace(/^["']|["']$/g, ''))
				.filter((v) => v.length > 0);
		} else {
			// Handle quoted strings
			frontmatter[key] = value.replace(/^["']|["']$/g, '');
		}
	}

	return { frontmatter, body };
}
