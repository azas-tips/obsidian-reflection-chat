import type { Message, ConversationContext, SessionSummary, ChatMessage } from '../types';
import { SUMMARY_PROMPT } from '../types';
import { OpenRouterClient } from '../infrastructure/OpenRouterClient';

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

	updateSettings(chatModel: string, summaryModel: string, systemPrompt: string): void {
		this.chatModel = chatModel;
		this.summaryModel = summaryModel;
		this.systemPrompt = systemPrompt;
	}

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

	async generateSummary(messages: Message[]): Promise<SessionSummary> {
		const conversationText = messages
			.map((m) => `${m.role === 'user' ? '自分' : 'Bot'}: ${m.content}`)
			.join('\n\n');

		const prompt = `${SUMMARY_PROMPT}\n\n## 会話ログ\n${conversationText}`;

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
			return {
				summary: parsed.summary || '',
				tags: parsed.tags || [],
				category: parsed.category || 'life',
				decisions: parsed.decisions || [],
				insights: parsed.insights || [],
				entities: parsed.entities || [],
				relations: parsed.relations || [],
				values: parsed.values || [],
			};
		} catch (error) {
			console.error('Failed to parse summary response:', error);
			// Return minimal summary on parse error
			return {
				summary: messages
					.slice(0, 3)
					.map((m) => m.content)
					.join(' ')
					.slice(0, 200),
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
		let prompt = this.systemPrompt;

		// Add context information
		if (context.recentNotes.length > 0 || context.semanticMatches.length > 0) {
			prompt += '\n\n## 参考情報（過去の振り返り）\n';

			// Recent notes
			if (context.recentNotes.length > 0) {
				prompt += '\n### 直近の振り返り\n';
				for (const note of context.recentNotes.slice(0, 3)) {
					prompt += `- ${note.date}: ${note.summary}\n`;
				}
			}

			// Semantic matches
			if (context.semanticMatches.length > 0) {
				prompt += '\n### 関連する過去の話題\n';
				for (const match of context.semanticMatches.slice(0, 3)) {
					prompt += `- ${match.metadata.date}: ${match.metadata.summary}\n`;
				}
			}
		}

		// Add entity information
		if (context.linkedEntities.length > 0) {
			prompt += '\n\n## 関連する人物・プロジェクト\n';
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
}
