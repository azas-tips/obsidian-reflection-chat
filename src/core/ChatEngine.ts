import type {
	Message,
	ConversationContext,
	SessionSummary,
	ChatMessage,
	SessionCategory,
	EntityType,
	GoalType,
	GoalStatus,
} from '../types';
import { OpenRouterClient } from '../infrastructure/OpenRouterClient';
import { getTranslations } from '../i18n';
import { logger } from '../utils/logger';

export class ChatEngine {
	private client: OpenRouterClient;
	private chatModel: string;
	private summaryModel: string;
	private systemPrompt: string;
	private characterPrompt: string;

	constructor(
		client: OpenRouterClient,
		chatModel: string,
		summaryModel: string,
		systemPrompt: string,
		characterPrompt: string = ''
	) {
		this.client = client;
		this.chatModel = chatModel;
		this.summaryModel = summaryModel;
		this.systemPrompt = systemPrompt;
		this.characterPrompt = characterPrompt;
	}

	/**
	 * Update engine settings dynamically
	 * @param chatModel - Model ID for chat completions
	 * @param summaryModel - Model ID for generating summaries
	 * @param systemPrompt - Custom system prompt (empty means use default)
	 * @param characterPrompt - Character-specific prompt to append
	 */
	updateSettings(
		chatModel: string,
		summaryModel: string,
		systemPrompt: string,
		characterPrompt: string = ''
	): void {
		this.chatModel = chatModel;
		this.summaryModel = summaryModel;
		this.systemPrompt = systemPrompt;
		this.characterPrompt = characterPrompt;
	}

	/**
	 * Stream a chat response based on message history and context
	 * @param messages - Conversation history
	 * @param context - Retrieved context (recent notes, semantic matches, entities)
	 * @param onChunk - Callback invoked for each streamed text chunk
	 * @returns Full response text when streaming completes
	 */
	async chatStream(
		messages: Message[],
		context: ConversationContext,
		onChunk: (chunk: string) => void
	): Promise<string> {
		const systemMessage = this.buildSystemPrompt(context);
		const chatMessages = this.formatMessages(messages);

		const allMessages: ChatMessage[] = [
			{ role: 'system', content: systemMessage },
			...chatMessages,
		];

		return await this.client.stream(allMessages, { model: this.chatModel }, onChunk);
	}

	/**
	 * Generate a structured summary of the conversation
	 * @param messages - Full conversation to summarize
	 * @returns Parsed summary with tags, category, entities, insights, etc.
	 * @throws Error if API call fails or response parsing fails
	 */
	async generateSummary(messages: Message[]): Promise<SessionSummary> {
		const t = getTranslations();

		// Return fallback summary for empty messages to avoid wasting API calls
		if (!messages || messages.length === 0) {
			return {
				summary: t.errors.summaryFallback,
				tags: [],
				category: 'life',
				decisions: [],
				insights: [],
				entities: [],
				relations: [],
				values: [],
			};
		}

		const conversationText = messages
			.map((m) => `${m.role === 'user' ? t.ui.userLabel : t.ui.botLabel}: ${m.content}`)
			.join('\n\n');

		const prompt = `${t.prompts.summary}\n\n## Conversation Log\n${conversationText}`;

		const response = await this.client.complete(
			[
				{
					role: 'user',
					content: prompt,
				},
			],
			{ model: this.summaryModel, temperature: 0.3 }
		);

		// Parse JSON response
		try {
			// Extract JSON from response (handle markdown code blocks)
			let jsonStr = response;
			const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (jsonMatch) {
				jsonStr = jsonMatch[1];
			}

			const parsed = JSON.parse(jsonStr.trim());

			// Validate and sanitize parsed data
			return this.validateSummaryResponse(parsed);
		} catch (error) {
			logger.error(
				'Failed to parse summary response:',
				error instanceof Error ? error : undefined
			);
			// Return minimal summary on parse error
			const fallbackSummary = messages
				.slice(0, 3)
				.map((m) => m.content)
				.filter((content) => content && content.trim())
				.join(' ')
				.slice(0, 200)
				.trim();

			const t = getTranslations();
			return {
				summary: fallbackSummary || t.errors.summaryFallback,
				tags: [],
				category: 'life',
				decisions: [],
				insights: [],
				entities: [],
				relations: [],
				values: [],
			};
		}
	}

	private buildSystemPrompt(context: ConversationContext): string {
		const t = getTranslations();
		// Use translated default if systemPrompt is empty
		let prompt = this.systemPrompt || t.prompts.system;

		// Add context information
		if (context.recentNotes.length > 0 || context.semanticMatches.length > 0) {
			prompt += `\n\n## ${t.context.referenceInfo}\n`;

			// Recent notes
			if (context.recentNotes.length > 0) {
				prompt += `\n### ${t.context.recentReflections}\n`;
				for (const note of context.recentNotes.slice(0, 3)) {
					prompt += `- ${note.date}: ${note.summary}\n`;
				}
			}

			// Semantic matches
			if (context.semanticMatches.length > 0) {
				prompt += `\n### ${t.context.relatedTopics}\n`;
				for (const match of context.semanticMatches.slice(0, 3)) {
					prompt += `- ${match.metadata.date}: ${match.metadata.summary}\n`;
				}
			}
		}

		// Add entity information
		if (context.linkedEntities.length > 0) {
			prompt += `\n\n## ${t.context.relatedEntities}\n`;
			for (const entity of context.linkedEntities) {
				prompt += `- [[${entity.name}]] (${entity.type}): ${entity.description}\n`;
			}
		}

		// Add goal information
		if (context.linkedGoals.length > 0) {
			prompt += `\n\n## ${t.context.relatedGoals}\n`;
			for (const goal of context.linkedGoals) {
				const typeLabel = t.goal.types[goal.type] || goal.type;
				const priorityLabel = t.goal.priority[goal.priority] || goal.priority;
				prompt += `- [[${goal.name}]] (${typeLabel}, ${priorityLabel}): ${goal.description}\n`;
			}
		}

		// Add character-specific prompt
		if (this.characterPrompt) {
			prompt += `\n\n${this.characterPrompt}`;
		}

		return prompt;
	}

	private formatMessages(messages: Message[]): ChatMessage[] {
		return messages.map((m) => ({
			role: m.role,
			content: m.content,
		}));
	}

	private static readonly VALID_CATEGORIES: readonly SessionCategory[] = [
		'career',
		'relationship',
		'wellness',
		'creative',
		'financial',
		'reading',
		'idea',
		'project',
		'life',
	] as const;

	private static readonly VALID_ENTITY_TYPES: readonly EntityType[] = [
		'person',
		'project',
		'company',
		'book',
		'other',
	] as const;

	private static readonly VALID_SENTIMENTS = ['positive', 'negative', 'conflicted'] as const;

	private static readonly VALID_MOOD_STATES = [
		'positive',
		'neutral',
		'negative',
		'mixed',
	] as const;

	private static readonly VALID_PRIORITIES = ['high', 'medium', 'low'] as const;

	private static readonly VALID_HORIZONS = ['immediate', 'short-term', 'long-term'] as const;

	private static readonly VALID_GOAL_TYPES: readonly GoalType[] = [
		'achievement',
		'habit',
		'project',
		'learning',
	] as const;

	private static readonly VALID_GOAL_STATUSES: readonly GoalStatus[] = [
		'active',
		'completed',
		'archived',
	] as const;

	private static readonly VALID_GOAL_TIMEFRAMES: readonly (
		| 'short-term'
		| 'medium-term'
		| 'long-term'
	)[] = ['short-term', 'medium-term', 'long-term'] as const;

	// Limits to prevent DoS from malicious/buggy LLM responses
	private static readonly MAX_ENTITIES = 50;
	private static readonly MAX_RELATIONS = 50;
	private static readonly MAX_VALUES = 50;
	private static readonly MAX_TAGS = 20;
	private static readonly MAX_STRING_ITEMS = 20; // For decisions, insights
	private static readonly MAX_GOALS = 20;
	private static readonly MAX_ACTIONS = 10;

	// String length limits to prevent memory issues
	private static readonly MAX_GOAL_NAME_LENGTH = 200;
	private static readonly MAX_GOAL_DESCRIPTION_LENGTH = 1000;
	private static readonly MAX_GOAL_CONTEXT_LENGTH = 500;
	private static readonly MAX_ACTION_LENGTH = 500;

	/**
	 * Validate and sanitize parsed summary response to ensure type safety
	 */
	private validateSummaryResponse(parsed: unknown): SessionSummary {
		if (typeof parsed !== 'object' || parsed === null) {
			throw new Error('Invalid response: not an object');
		}

		const obj = parsed as Record<string, unknown>;

		// Validate and extract string
		const getString = (key: string, defaultVal: string): string => {
			return typeof obj[key] === 'string' ? (obj[key] as string) : defaultVal;
		};

		// Validate and extract string array with limit
		const getStringArray = (key: string, limit: number): string[] => {
			const arr = obj[key];
			if (!Array.isArray(arr)) return [];
			const filtered = arr.filter((item): item is string => typeof item === 'string');
			return filtered.slice(0, limit);
		};

		// Validate category against allowed values
		const category = getString('category', 'life');
		const validCategory: SessionCategory = ChatEngine.VALID_CATEGORIES.includes(
			category as SessionCategory
		)
			? (category as SessionCategory)
			: 'life';

		// Helper to validate entity type
		const validateEntityType = (type: unknown): EntityType => {
			if (
				typeof type === 'string' &&
				ChatEngine.VALID_ENTITY_TYPES.includes(type as EntityType)
			) {
				return type as EntityType;
			}
			return 'other';
		};

		// Validate entities array - validate before creating objects to avoid memory waste
		const entities: Array<{
			name: string;
			type: EntityType;
			description: string;
			context: string;
		}> = [];
		if (Array.isArray(obj.entities)) {
			for (const e of obj.entities) {
				if (entities.length >= ChatEngine.MAX_ENTITIES) break; // Enforce limit
				if (typeof e !== 'object' || e === null) continue;
				const record = e as Record<string, unknown>;
				const name = typeof record.name === 'string' ? record.name : '';
				if (!name) continue; // Skip early if no name
				entities.push({
					name,
					type: validateEntityType(record.type),
					description: typeof record.description === 'string' ? record.description : '',
					context: typeof record.context === 'string' ? record.context : '',
				});
			}
		}

		// Validate relations array - validate before creating objects
		const relations: Array<{
			from: string;
			to: string;
			type: string;
			description: string;
		}> = [];
		if (Array.isArray(obj.relations)) {
			for (const r of obj.relations) {
				if (relations.length >= ChatEngine.MAX_RELATIONS) break; // Enforce limit
				if (typeof r !== 'object' || r === null) continue;
				const record = r as Record<string, unknown>;
				const from = typeof record.from === 'string' ? record.from : '';
				const to = typeof record.to === 'string' ? record.to : '';
				if (!from || !to) continue; // Skip early if invalid
				relations.push({
					from,
					to,
					type: typeof record.type === 'string' ? record.type : '',
					description: typeof record.description === 'string' ? record.description : '',
				});
			}
		}

		// Helper to validate sentiment
		const validateSentiment = (sentiment: unknown): 'positive' | 'negative' | 'conflicted' => {
			if (
				typeof sentiment === 'string' &&
				(ChatEngine.VALID_SENTIMENTS as readonly string[]).includes(sentiment)
			) {
				return sentiment as 'positive' | 'negative' | 'conflicted';
			}
			return 'positive';
		};

		// Validate values array - validate before creating objects
		const values: Array<{
			value: string;
			context: string;
			sentiment: 'positive' | 'negative' | 'conflicted';
		}> = [];
		if (Array.isArray(obj.values)) {
			for (const v of obj.values) {
				if (values.length >= ChatEngine.MAX_VALUES) break; // Enforce limit
				if (typeof v !== 'object' || v === null) continue;
				const record = v as Record<string, unknown>;
				const value = typeof record.value === 'string' ? record.value : '';
				if (!value) continue; // Skip early if no value
				values.push({
					value,
					context: typeof record.context === 'string' ? record.context : '',
					sentiment: validateSentiment(record.sentiment),
				});
			}
		}

		// Get summary with validation
		const summary = getString('summary', '');
		if (!summary) {
			logger.warn('LLM response missing required "summary" field');
		}

		// Get tags with validation
		const tags = getStringArray('tags', ChatEngine.MAX_TAGS);
		if (tags.length === 0) {
			logger.warn('LLM response has empty "tags" array');
		}

		// Validate mood (optional)
		let mood:
			| { state: 'positive' | 'neutral' | 'negative' | 'mixed'; description?: string }
			| undefined;
		if (obj.mood && typeof obj.mood === 'object') {
			const moodObj = obj.mood as Record<string, unknown>;
			const moodState = moodObj.state;
			if (
				typeof moodState === 'string' &&
				(ChatEngine.VALID_MOOD_STATES as readonly string[]).includes(moodState)
			) {
				mood = {
					state: moodState as 'positive' | 'neutral' | 'negative' | 'mixed',
					description:
						typeof moodObj.description === 'string' ? moodObj.description : undefined,
				};
			}
		}

		// Helper to validate priority
		const validatePriority = (priority: unknown): 'high' | 'medium' | 'low' => {
			if (
				typeof priority === 'string' &&
				(ChatEngine.VALID_PRIORITIES as readonly string[]).includes(priority)
			) {
				return priority as 'high' | 'medium' | 'low';
			}
			return 'medium';
		};

		// Validate nextActions (optional)
		const nextActions: Array<{
			action: string;
			priority: 'high' | 'medium' | 'low';
			suggested: boolean;
		}> = [];
		if (Array.isArray(obj.nextActions)) {
			for (const a of obj.nextActions) {
				if (nextActions.length >= ChatEngine.MAX_ACTIONS) break;
				if (typeof a !== 'object' || a === null) continue;
				const record = a as Record<string, unknown>;
				const action = typeof record.action === 'string' ? record.action : '';
				if (!action) continue;
				nextActions.push({
					action,
					priority: validatePriority(record.priority),
					suggested: typeof record.suggested === 'boolean' ? record.suggested : false,
				});
			}
		}

		// Validate openQuestions (optional)
		const openQuestions = getStringArray('openQuestions', ChatEngine.MAX_STRING_ITEMS);

		// Validate timeframe (optional)
		let timeframe:
			| { horizon: 'immediate' | 'short-term' | 'long-term'; deadline?: string }
			| undefined;
		if (obj.timeframe && typeof obj.timeframe === 'object') {
			const tfObj = obj.timeframe as Record<string, unknown>;
			const horizon = tfObj.horizon;
			if (
				typeof horizon === 'string' &&
				(ChatEngine.VALID_HORIZONS as readonly string[]).includes(horizon)
			) {
				timeframe = {
					horizon: horizon as 'immediate' | 'short-term' | 'long-term',
					deadline: typeof tfObj.deadline === 'string' ? tfObj.deadline : undefined,
				};
			}
		}

		// Helper to validate goal type
		const validateGoalType = (type: unknown): GoalType => {
			if (
				typeof type === 'string' &&
				ChatEngine.VALID_GOAL_TYPES.includes(type as GoalType)
			) {
				return type as GoalType;
			}
			return 'achievement';
		};

		// Helper to validate goal status
		const validateGoalStatus = (status: unknown): GoalStatus => {
			if (
				typeof status === 'string' &&
				ChatEngine.VALID_GOAL_STATUSES.includes(status as GoalStatus)
			) {
				return status as GoalStatus;
			}
			return 'active';
		};

		// Helper to validate goal timeframe
		const validateGoalTimeframe = (tf: unknown): 'short-term' | 'medium-term' | 'long-term' => {
			if (
				typeof tf === 'string' &&
				(ChatEngine.VALID_GOAL_TIMEFRAMES as readonly string[]).includes(tf)
			) {
				return tf as 'short-term' | 'medium-term' | 'long-term';
			}
			return 'medium-term';
		};

		// Validate goals array (optional)
		const goals: Array<{
			name: string;
			description: string;
			type: GoalType;
			priority: 'high' | 'medium' | 'low';
			timeframe: 'short-term' | 'medium-term' | 'long-term';
			status: GoalStatus;
			context: string;
			suggestedActions: string[];
			nextActions: string[];
		}> = [];
		if (Array.isArray(obj.goals)) {
			for (const g of obj.goals) {
				if (goals.length >= ChatEngine.MAX_GOALS) break;
				if (typeof g !== 'object' || g === null) continue;
				const record = g as Record<string, unknown>;

				// Extract, trim, and truncate name
				const rawName = typeof record.name === 'string' ? record.name.trim() : '';
				const name = rawName.slice(0, ChatEngine.MAX_GOAL_NAME_LENGTH);
				if (!name) continue; // Skip if no name

				// Extract suggestedActions array with length limit
				const suggestedActions: string[] = [];
				if (Array.isArray(record.suggestedActions)) {
					for (const action of record.suggestedActions) {
						if (suggestedActions.length >= ChatEngine.MAX_ACTIONS) break;
						if (typeof action === 'string' && action.trim()) {
							const trimmedAction = action.trim();
							suggestedActions.push(
								trimmedAction.slice(0, ChatEngine.MAX_ACTION_LENGTH)
							);
						}
					}
				}

				// Extract nextActions array with length limit
				const goalNextActions: string[] = [];
				if (Array.isArray(record.nextActions)) {
					for (const action of record.nextActions) {
						if (goalNextActions.length >= ChatEngine.MAX_ACTIONS) break;
						if (typeof action === 'string' && action.trim()) {
							const trimmedAction = action.trim();
							goalNextActions.push(
								trimmedAction.slice(0, ChatEngine.MAX_ACTION_LENGTH)
							);
						}
					}
				}

				// Extract, trim, and truncate description and context
				const description =
					typeof record.description === 'string'
						? record.description.trim().slice(0, ChatEngine.MAX_GOAL_DESCRIPTION_LENGTH)
						: '';
				const context =
					typeof record.context === 'string'
						? record.context.trim().slice(0, ChatEngine.MAX_GOAL_CONTEXT_LENGTH)
						: '';

				goals.push({
					name,
					description,
					type: validateGoalType(record.type),
					priority: validatePriority(record.priority),
					timeframe: validateGoalTimeframe(record.timeframe),
					status: validateGoalStatus(record.status),
					context,
					suggestedActions,
					nextActions: goalNextActions,
				});
			}
		}

		return {
			summary,
			tags,
			category: validCategory,
			decisions: getStringArray('decisions', ChatEngine.MAX_STRING_ITEMS),
			insights: getStringArray('insights', ChatEngine.MAX_STRING_ITEMS),
			entities,
			relations,
			values,
			mood,
			nextActions: nextActions.length > 0 ? nextActions : undefined,
			openQuestions: openQuestions.length > 0 ? openQuestions : undefined,
			timeframe,
			goals: goals.length > 0 ? goals : undefined,
		};
	}
}
