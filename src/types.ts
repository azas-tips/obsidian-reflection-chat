import type { App } from 'obsidian';
import { logger } from './utils/logger';

/**
 * Extended App interface with internal settings API
 *
 * @warning INTERNAL API - This uses undocumented Obsidian internal APIs
 * that may break in future Obsidian versions without notice.
 * Always use with runtime validation (see openPluginSettings).
 * @see https://github.com/obsidianmd/obsidian-api/issues for API changes
 */
export interface ExtendedApp extends App {
	setting?: {
		open(): void;
		openTabById(id: string): void;
	};
}

/**
 * Safely open plugin settings tab with runtime validation
 * Falls back gracefully if internal API is unavailable
 *
 * @param app - Obsidian App instance
 * @param pluginId - Plugin ID to open settings for
 * @returns true if settings were opened, false if fallback was used
 */
export function openPluginSettings(app: App, pluginId: string): boolean {
	const extendedApp = app as ExtendedApp;

	// Validate internal API exists before using
	if (
		extendedApp.setting &&
		typeof extendedApp.setting.open === 'function' &&
		typeof extendedApp.setting.openTabById === 'function'
	) {
		extendedApp.setting.open();
		extendedApp.setting.openTabById(pluginId);
		return true;
	}

	// Fallback: log warning if internal API unavailable
	logger.warn('Obsidian internal settings API unavailable. Please open settings manually.');
	return false;
}

// Message
export interface Message {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	timestamp: number;
}

// Conversation Session
export interface Session {
	id: string;
	startedAt: number;
	messages: Message[];
	context: ConversationContext;
}

// Context Information
export interface ConversationContext {
	recentNotes: NoteSummary[];
	semanticMatches: SearchResult[];
	linkedEntities: Entity[];
}

// Note Metadata
export interface NoteSummary {
	path: string;
	title: string;
	date: string;
	summary: string;
	tags: string[];
	category: string;
	type: 'session' | 'entity';
}

// Vector Search Result
export interface SearchResult {
	id: string;
	score: number;
	metadata: NoteSummary;
}

// Entity (Person, Project, Book, etc.)
export interface Entity {
	name: string;
	type: EntityType;
	description: string;
	path: string;
}

export type EntityType = 'person' | 'project' | 'company' | 'book' | 'other';

// Session Summary
export interface SessionSummary {
	summary: string;
	tags: string[];
	category: SessionCategory;
	decisions: string[];
	insights: string[];
	entities: ExtractedEntity[];
	relations: EntityRelation[];
	values: ValueMention[];
}

// Session Category
export type SessionCategory =
	| 'career'
	| 'relationship'
	| 'wellness'
	| 'creative'
	| 'financial'
	| 'reading'
	| 'idea'
	| 'project'
	| 'life';

// Entity Relation
export interface EntityRelation {
	from: string;
	to: string;
	type: string;
	description?: string;
}

// Extracted Entity
export interface ExtractedEntity {
	name: string;
	type: EntityType;
	description: string;
	context: string;
}

// Value Mention
export interface ValueMention {
	value: string;
	context: string;
	sentiment: 'positive' | 'negative' | 'conflicted';
}

// Value Profile
export interface ValueProfile {
	name: string;
	frequency: number;
	firstMentioned: string;
	lastMentioned: string;
	relatedDecisions: string[];
	tensions: string[];
}

// Plugin Settings
export interface PluginSettings {
	// API
	openRouterApiKey: string;
	chatModel: string;
	summaryModel: string;
	embeddingModel: string;

	// Folders
	journalFolder: string;
	entitiesFolder: string;

	// Context
	contextWindowDays: number;
	maxSemanticResults: number;

	// Prompt
	systemPrompt: string;

	// Other
	language: 'ja' | 'en';
	autoIndex: boolean;
}

// Default Settings
// Note: systemPrompt is empty by default, meaning "use language default from translations"
export const DEFAULT_SETTINGS: PluginSettings = {
	openRouterApiKey: '',
	chatModel: 'anthropic/claude-sonnet-4.5',
	summaryModel: 'anthropic/claude-haiku-4.5',
	embeddingModel: 'qwen/qwen3-embedding-8b',
	journalFolder: 'journal',
	entitiesFolder: 'entities',
	contextWindowDays: 7,
	maxSemanticResults: 5,
	systemPrompt: '',
	language: 'ja',
	autoIndex: true,
};

// OpenRouter Model
export interface OpenRouterModel {
	id: string;
	name: string;
	context_length: number;
	pricing: {
		prompt: string;
		completion: string;
	};
}

// Chat Completion Message (OpenAI format)
export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

// Model Info for session recording
export interface ModelInfo {
	chatModel: string;
	summaryModel: string;
	embeddingModel: string;
}

// Streaming Chunk
export interface StreamChunk {
	choices: {
		delta: {
			content?: string;
		};
		finish_reason?: string;
	}[];
}
