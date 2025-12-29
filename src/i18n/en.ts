import type { Translations } from './index';

export const en: Translations = {
	ui: {
		viewTitle: 'Reflection Chat',
		newChat: 'New Chat',
		settings: 'Settings',
		send: 'Send',
		sending: '...',
		saveAndEnd: 'Save & End',
		clear: 'Clear',
		inputPlaceholder: 'How was your day?',
		emptyStateTitle: "Start today's reflection",
		emptyStateDescription: "Share what's on your mind or what happened today.",
		suggestions: {
			work: 'How I felt at work today',
			thoughts: "What I've been thinking about",
			decisions: 'A decision I am struggling with',
		},
		relatedNotes: 'Related notes',
		userLabel: 'Me',
		botLabel: 'Bot',
	},

	commands: {
		openChat: 'Open Chat',
		reindexNotes: 'Reindex Notes',
		ribbonTooltip: 'Open Reflection Chat',
	},

	settings: {
		title: 'Reflection Chat Settings',
		api: {
			heading: 'API Settings',
			apiKey: 'OpenRouter API Key',
			apiKeyDesc: 'Enter your OpenRouter API key',
			testConnection: 'Test Connection',
			chatModel: 'Chat Model',
			chatModelDesc: 'Model used for conversations',
			summaryModel: 'Summary Model',
			summaryModelDesc: 'Model used for session summaries (lightweight model recommended)',
			embeddingModel: 'Embedding Model',
			embeddingModelDesc: 'Embedding model used for semantic search',
			embeddingModelOptions: {
				qwen8b: 'Qwen3 Embedding 8B (Recommended)',
				qwen06b: 'Qwen3 Embedding 0.6B (Lightweight)',
				openai3small: 'OpenAI Text Embedding 3 Small',
				openai3large: 'OpenAI Text Embedding 3 Large',
			},
		},
		folders: {
			heading: 'Folder Settings',
			journal: 'Session Folder',
			journalDesc: 'Folder to save session notes',
			journalPlaceholder: 'journal',
			entities: 'Entities Folder',
			entitiesDesc: 'Folder to save entity notes (people, projects, books, etc.)',
			entitiesPlaceholder: 'entities',
		},
		context: {
			heading: 'Context Settings',
			windowDays: 'Recent Days',
			windowDaysDesc: 'How many days of notes to reference',
			semanticResults: 'Semantic Results',
			semanticResultsDesc: 'How many semantically similar notes to retrieve',
		},
		prompts: {
			heading: 'Prompts',
			systemPrompt: 'System Prompt',
			systemPromptDesc: 'Prompt that defines AI coach behavior',
			systemPromptPlaceholder: 'Enter system prompt...',
			resetDefault: 'Reset to Default',
		},
		other: {
			heading: 'Other',
			language: 'Language',
			languageDesc: 'Language for UI and note output',
			autoIndex: 'Auto Index',
			autoIndexDesc: 'Automatically update index when notes are saved',
			reindex: 'Reindex Notes',
			reindexDesc: 'Rebuild the index for all notes',
			reindexButton: 'Reindex',
		},
	},

	notices: {
		noMessages: 'No messages to save',
		apiKeyRequired: 'API key required for summary generation',
		saving: 'Saving session...',
		saved: 'Session saved',
		saveFailed: 'Failed to save: ',
		apiKeyNotSet: 'Please set your API key',
		embeddingLoading: 'Loading embedding model...',
		indexing: 'Indexing notes...',
		indexComplete: 'Indexing complete',
		indexFailed: 'Indexing failed',
		connectionSuccess: 'Connection successful!',
		connectionFailed: 'Connection failed: ',
		reindexing: 'Rebuilding index...',
		reindexComplete: 'Index rebuild complete',
		invalidFolderPath:
			'Invalid folder path. Use a relative path without special characters or "..".',
		contentTruncated: 'Response was truncated due to length limit',
		folderConflict: 'Journal and entities folders cannot be the same',
		indexQueueFull: 'Index queue full - some file updates were skipped',
	},

	dialogs: {
		clearConfirm: 'Clear current chat and start a new one?',
	},

	errors: {
		invalidApiKey: 'Invalid API key. Please check your settings.',
		rateLimited: 'Rate limited. Please wait and try again.',
		serverError: 'Server error occurred. Please wait and try again.',
		serviceUnavailable: 'API service is temporarily unavailable.',
		networkError: 'Network error. Please check your internet connection.',
		embeddingLoadFailed: 'Failed to load embedding model. Please restart.',
		embeddingGenerateFailed: 'Failed to generate text embeddings.',
		folderCreateFailed: 'Failed to create folder.',
		fileWriteFailed: 'Failed to save file.',
		indexOperationFailed: 'Vector index operation failed.',
		parseError: 'Failed to parse data.',
		timeout: 'Request timed out.',
		unknown: 'An unexpected error occurred.',
		noApiKey: 'API key is not set.',
		noResponseBody: 'No response body.',
		notInitialized: 'Plugin not initialized. Please restart.',
		summaryFallback: 'Session summary could not be generated.',
		truncationMarker: '... [response truncated]',
	},

	notes: {
		sessionTitle: 'Session',
		summary: 'Summary',
		tags: 'Tags',
		decisions: 'Pending Decisions',
		insights: 'Insights',
		entities: 'Mentioned Entities',
		values: 'Values & Criteria',
		conversationLog: 'Conversation Log',
		overview: 'Overview',
		relationships: 'Relationships',
		memo: 'Notes',
		firstMention: 'First mentioned',
		relatedSessions: 'Related Sessions',
		relationshipPlaceholder: '(Add relationships here)',
		goals: 'Related Goals',
		suggestedActions: 'Suggested Actions',
		nextActions: 'Next Actions',
		progress: 'Progress',
	},

	goal: {
		types: {
			achievement: 'Achievement',
			habit: 'Habit',
			project: 'Project',
			learning: 'Learning',
		},
		status: {
			active: 'Active',
			completed: 'Completed',
			archived: 'Archived',
		},
		timeframe: {
			shortTerm: 'Short-term (< 3 months)',
			mediumTerm: 'Medium-term (3-12 months)',
			longTerm: 'Long-term (1+ year)',
		},
		priority: {
			high: 'High',
			medium: 'Medium',
			low: 'Low',
		},
		created: 'Created',
		due: 'Due',
	},

	context: {
		referenceInfo: 'Reference Information (Past Reflections)',
		recentReflections: 'Recent Reflections',
		relatedTopics: 'Related Past Topics',
		relatedEntities: 'Related People & Projects',
		relatedGoals: 'Active Goals',
	},

	report: {
		weekly: 'Weekly Report',
		monthly: 'Monthly Report',
		sessionOverview: 'Session Overview',
		sessionCount: 'Sessions',
		mainCategories: 'Main Categories',
		moodOverview: 'Overall Mood',
		topicHighlights: 'Topic Highlights',
		sessionDetails: 'Session Details',
		category: 'Category',
		openQuestions: 'Open Questions',
		pendingActions: 'Pending Actions',
		insights: 'Insights & Learnings',
		generated: 'Report generated',
		savedTo: 'Saved to',
		alreadyExists: 'report already exists. Regenerate?',
		regenerate: 'Regenerate',
		cancel: 'Cancel',
		noSessions: 'No sessions found for this period',
		invalidCommand: 'Invalid command. Usage: /report weekly, /report monthly last',
		coachFeedback: 'Coach Feedback',
		highlights: 'Highlights',
		patterns: 'Patterns Noticed',
		advice: 'Advice for Next Week',
		questions: 'Questions to Consider',
		statisticsSummary: 'Statistics Summary',
		generatingFeedback: 'Generating coaching feedback...',
	},

	embedding: {
		queryPrefix: 'Query: ',
		documentPrefix: 'Document: ',
	},

	prompts: {
		system: `You are my personal coach and thinking partner.

## Core Principles
- Ask questions that deepen thinking rather than giving answers
- Reference past decision patterns and values, pointing out consistency or changes
- Support the process of finding answers myself
- Pay attention to proper nouns (people, projects, books) and understand context

## Dynamic Adaptation by Topic
Naturally incorporate appropriate expert perspectives based on the conversation:
- Career & Work → Career coach perspective
- Relationships & Communication → Relationship coach perspective
- Health & Habits → Wellness coach perspective
- Creativity & Learning → Creative coach perspective
- Money & Investments → Financial coach perspective
- Life Direction & Values → Life coach perspective
- Reading & Books → Reading partner perspective
- Ideas & Planning → Brainstorming partner perspective
- Project Review → Project coach perspective

Reflect expertise naturally through the angle of questions and direction of exploration, without explicitly declaring it.

## Conversation Style
- Focus on one question at a time (don't ask multiple questions simultaneously)
- Use "What?" and "What do you want?" instead of "Why?"
- Actively reference past context when available ("You mentioned before that...")
- Pay attention to relationships between entities ("Is that person your supervisor?")
- Respect silence (thinking time) and don't rush
- Keep responses to 3-5 sentences

## Example Questions
- "What bothers you most about that?"
- "What would the ideal situation look like?"
- "What did you choose in a similar situation before?"
- "What's your priority among those options?"
- "How do you think you'll feel about that choice in six months?"
- "Does this relate to what you decided about...?"
- "What specifically do you mean by that?" (during reading/learning)
- "Can you think of a time in your experience when this applied?" (during reading/learning)

## Prohibited
- Long lectures or generalizations
- Pushy advice
- Excessive praise or agreement
- Asking multiple questions at once
- Speculating about things not mentioned`,

		summary: `Analyze the following coaching session and structure it in JSON format.

## Output Format
{
  "summary": "3-5 sentence summary. What was discussed and how did you feel/think",
  "tags": ["tag1", "tag2"],
  "category": "career / relationship / wellness / creative / financial / reading / idea / project / life",
  "decisions": ["pending decisions if any"],
  "insights": ["insights or learnings if any"],
  "mood": {
    "state": "positive / neutral / negative / mixed",
    "description": "Emotional flow during conversation (optional)"
  },
  "nextActions": [
    {
      "action": "Specific action item",
      "priority": "high / medium / low",
      "suggested": false
    }
  ],
  "openQuestions": ["Unresolved questions"],
  "timeframe": {
    "horizon": "immediate / short-term / long-term",
    "deadline": "Mentioned deadline if any (optional)"
  },
  "entities": [
    {
      "name": "Entity name",
      "type": "person / project / company / book / other",
      "description": "Brief description inferred from conversation",
      "context": "Context in which it was mentioned"
    }
  ],
  "relations": [
    {
      "from": "Entity A",
      "to": "Entity B",
      "type": "Type of relationship",
      "description": "Details of relationship (optional)"
    }
  ],
  "values": [
    {
      "value": "Name of value/criteria",
      "context": "Context in which it was mentioned",
      "sentiment": "positive / negative / conflicted"
    }
  ],
  "goals": [
    {
      "name": "Goal name",
      "description": "Goal description",
      "type": "achievement / habit / project / learning",
      "priority": "high / medium / low",
      "timeframe": "short-term / medium-term / long-term",
      "status": "active / completed / archived",
      "context": "Context in which it was mentioned",
      "suggestedActions": ["LLM-suggested actions towards the goal"],
      "nextActions": ["User-mentioned concrete next steps"]
    }
  ]
}

## Value Extraction Guide
- Look for expressions like "I want to prioritize..." or "This is non-negotiable..."
- Extract decision criteria when comparing options
- Use "conflicted" when struggling with trade-offs
- Examples: "time freedom", "financial stability", "growth opportunity", "family time", "social recognition"

## Mood Classification Guide
- positive: Optimistic, hopeful, motivated, relieved
- negative: Anxious, down, frustrated, stressed
- neutral: Matter-of-fact, calm, not particularly emotional
- mixed: Fluctuating emotions, complex feelings
- Use description to note emotional shifts (e.g., "Started anxious but became more positive through talking")

## Next Actions Extraction Guide
- Extract specific action items the user mentioned
- Include actions suggested by the LLM during conversation (suggested: true)
- priority: Based on urgency and importance
  - high: Today to this week, involves important decisions
  - medium: This month, should be done
  - low: Someday, when there's time
- Examples: "Talk to supervisor", "Re-read the book", "Create estimate"

## Open Questions Extraction Guide
- Record questions that weren't resolved in the conversation
- Topics to explore in future sessions
- Examples: "What do I really want to do?", "When to change jobs?", "How to prioritize?"

## Timeframe Classification Guide
- horizon: Temporal scope of the topic
  - immediate: Today to this week (urgent issues)
  - short-term: This month to 3 months (near future)
  - long-term: 6+ months (career, life planning)
- deadline: Record specific deadlines if mentioned ("by next week", "end of March")

## Goal Extraction Guide
- Extract goals or objectives the user wants to achieve
- Look for expressions like "I want to...", "My goal is...", "I'm aiming for..."
- Type classification:
  - achievement: Achievement goals (certification, promotion, revenue targets)
  - habit: Habit formation (daily exercise, early rising, reading habit)
  - project: Project completion (new business, creative work)
  - learning: Learning goals (programming, language learning)
- Determine priority from user's mention frequency and enthusiasm
- suggestedActions: LLM's recommendations for achieving the goal
- nextActions: Concrete next steps mentioned by the user
- Set status appropriately if progress toward existing goal is mentioned

## Entity Extraction Guide
- Extract proper nouns (names of people, projects, companies, books, etc.)
- Don't extract common nouns ("boss", "colleague", "book")
- Type classification:
  - person: People (e.g., "John", "Dr. Smith")
  - project: Projects or tasks (e.g., "Project X", "new initiative")
  - company: Companies/organizations (e.g., "Company A", "XYZ Corp")
  - book: Books (e.g., "7 Habits", "Atomic Habits")
  - other: Others (e.g., places, events)
- Only include information that can be inferred from the conversation
- Combine multiple mentions of the same entity into one

## Relationship Extraction Guide
- Extract when relationships between entities are mentioned in conversation
- Example types:
  - Personal: supervisor, subordinate, colleague, mentor, family, friend
  - Organizational: belongs to, responsible for, member of
  - Book-related: author, recommender
  - Project-related: in charge of, involved in
- "Me/myself" can be a subject/object of relationships (e.g., John → me: supervisor)
- Don't infer relationships not explicitly mentioned

## Category Classification
Choose one based on the main theme:
- career: Work, career, job change, side business
- relationship: Relationships, communication, family
- wellness: Health, habits, mental health, lifestyle
- creative: Creation, learning, skills, expression
- financial: Money, investments, asset building
- reading: Reading, understanding book content
- idea: Ideas, inspiration, planning
- project: Project review, progress
- life: Life direction, values in general

## Notes
- Tags can be in any language
- Use empty arrays or null for items with no matches
- Don't fill in with speculation
- Only extract values that clearly appeared in conversation
- Only extract proper nouns for entities (not common nouns)
- Only extract explicitly mentioned relationships
- Mood should reflect overall conversation impression
- Distinguish user-initiated (suggested: false) vs LLM-suggested (suggested: true) actions
- Only include unresolved questions in openQuestions (not resolved ones)
- Only extract goals when clear objectives/targets are mentioned
- suggestedActions are LLM proposals, nextActions are from user statements`,

		coachingFeedback: `You are a dedicated personal coach. Analyze the following session data and provide weekly/monthly reflection feedback.

## Your Role
- Provide warm but candid feedback
- Identify and point out patterns and trends
- Suggest specific, actionable advice
- Ask thought-provoking questions

## Input Data
Period: {startDate} to {endDate}
Session count: {sessionCount}

### Category Distribution
{categoryBreakdown}

### Session Summaries
{sessionSummaries}

### Insights & Learnings
{insights}

### Open Questions
{openQuestions}

### Pending Actions
{pendingActions}

## Output Format (JSON)
{
  "highlights": "What was particularly impressive, achieved, or progressed during this period in 2-3 sentences (reference specific session content)",
  "patterns": [
    "Patterns or trends noticed (e.g., work topics dominate, fatigue visible late in week)"
  ],
  "advice": [
    "Specific advice for next week/month (actionable items)"
  ],
  "questions": [
    "Questions to dig deeper (prompts for introspection)"
  ]
}

## Notes
- Provide specific feedback based on session data
- Avoid generic or abstract advice
- Warm but not indulgent, coach-like tone
- Output in English`,
	},
};
