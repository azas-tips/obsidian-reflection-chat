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
	linkedGoals: Goal[];
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
	mood?: MoodState;
	nextActions?: NextAction[];
	openQuestions?: string[];
	timeframe?: Timeframe;
	goals?: ExtractedGoal[];
}

/**
 * Goal Type
 * - achievement: One-time accomplishments (certification, promotion)
 * - habit: Recurring behaviors to build (daily exercise, reading)
 * - project: Deliverables to complete (new business, creative work)
 * - learning: Skills or knowledge to acquire (programming, language)
 */
export type GoalType = 'achievement' | 'habit' | 'project' | 'learning';

/**
 * Goal Status
 * - active: Currently being pursued
 * - completed: Successfully achieved
 * - archived: Paused or abandoned
 */
export type GoalStatus = 'active' | 'completed' | 'archived';

/**
 * Extracted Goal (from conversation)
 * Represents a goal extracted by LLM from a coaching session
 */
export interface ExtractedGoal {
	/** Goal name/title */
	name: string;
	/** Detailed description of what the goal entails */
	description: string;
	/** Category of goal */
	type: GoalType;
	/** Importance level */
	priority: 'high' | 'medium' | 'low';
	/** Expected time horizon to achieve */
	timeframe: 'short-term' | 'medium-term' | 'long-term';
	/** Current progress state */
	status: GoalStatus;
	/** Context from conversation where goal was mentioned */
	context: string;
	/** Actions recommended by LLM to achieve the goal */
	suggestedActions: string[];
	/** Concrete next steps mentioned by the user */
	nextActions: string[];
}

/**
 * Goal (stored in notes)
 * Represents a goal persisted in the vault as a note file
 */
export interface Goal {
	/** Goal name/title (also used as filename) */
	name: string;
	/** Detailed description of what the goal entails */
	description: string;
	/** Category of goal */
	type: GoalType;
	/** Importance level */
	priority: 'high' | 'medium' | 'low';
	/** Expected time horizon to achieve */
	timeframe: 'short-term' | 'medium-term' | 'long-term';
	/** Current progress state */
	status: GoalStatus;
	/** Path to the goal note file in vault */
	path: string;
	/** Creation date in YYYY-MM-DD format */
	createdAt: string;
	/** Target completion date in YYYY-MM-DD format (optional) */
	dueDate?: string;
}

// Mood State
export interface MoodState {
	state: 'positive' | 'neutral' | 'negative' | 'mixed';
	description?: string;
}

// Next Action
export interface NextAction {
	action: string;
	priority: 'high' | 'medium' | 'low';
	suggested: boolean; // true = LLM suggested, false = user mentioned
}

// Timeframe
export interface Timeframe {
	horizon: 'immediate' | 'short-term' | 'long-term';
	deadline?: string;
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

// Coach Character Types
/**
 * Coach speaking tone
 * - formal: Polite, professional language
 * - casual: Relaxed, friendly language
 * - friendly: Warm, approachable language
 */
export type CoachTone = 'formal' | 'casual' | 'friendly';

/**
 * Coach strictness level
 * - gentle: Supportive, nurturing approach
 * - balanced: Mix of support and challenge
 * - strict: Direct, demanding approach
 */
export type CoachStrictness = 'gentle' | 'balanced' | 'strict';

/**
 * Coach Character definition
 */
export interface CoachCharacter {
	/** Unique identifier */
	id: string;
	/** Display name (localized) */
	name: string;
	/** Speaking tone */
	tone: CoachTone;
	/** Strictness level */
	strictness: CoachStrictness;
	/** Additional personality prompt */
	personalityPrompt: string;
	/** Whether this is a preset (true) or custom (false) character */
	isPreset: boolean;
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

	// Coach Character
	selectedCharacterId: string;
	customCharacters: CoachCharacter[];

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
	selectedCharacterId: 'carl',
	customCharacters: [],
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
