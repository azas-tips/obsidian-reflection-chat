import type {
	Message,
	ConversationContext,
	SessionSummary,
	ChatMessage,
	SessionCategory,
	EntityType,
} from '../types';
import { OpenRouterClient } from '../infrastructure/OpenRouterClient';
import { getTranslations } from '../i18n';
import { logger } from '../utils/logger';

export class ChatEngine {
	private client: OpenRouterClient;
	private chatModel: string;
	private summaryModel: string;
	private systemPrompt: string;

	constructor(
		client: OpenRouterClient,
		chatModel: string,
		summaryModel: string,
		systemPrompt: string
	) {
		this.client = client;
		this.chatModel = chatModel;
		this.summaryModel = summaryModel;
		this.systemPrompt = systemPrompt;
	}

	/**
	 * Update engine settings dynamically
	 * @param chatModel - Model ID for chat completions
	 * @param summaryModel - Model ID for generating summaries
	 * @param systemPrompt - Custom system prompt (empty means use default)
	 */
	updateSettings(chatModel: string, summaryModel: string, systemPrompt: string): void {
		this.chatModel = chatModel;
		this.summaryModel = summaryModel;
		this.systemPrompt = systemPrompt;
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

		// Validate and extract string array
		const getStringArray = (key: string): string[] => {
			const arr = obj[key];
			if (!Array.isArray(arr)) return [];
			return arr.filter((item): item is string => typeof item === 'string');
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

		return {
			summary: getString('summary', ''),
			tags: getStringArray('tags'),
			category: validCategory,
			decisions: getStringArray('decisions'),
			insights: getStringArray('insights'),
			entities,
			relations,
			values,
		};
	}
}
