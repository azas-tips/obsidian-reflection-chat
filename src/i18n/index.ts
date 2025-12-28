import { ja } from './ja';
import { en } from './en';
import { logger } from '../utils/logger';

export type Language = 'ja' | 'en';

export interface Translations {
	// UI - Chat View
	ui: {
		viewTitle: string;
		newChat: string;
		settings: string;
		send: string;
		sending: string;
		saveAndEnd: string;
		clear: string;
		inputPlaceholder: string;
		emptyStateTitle: string;
		emptyStateDescription: string;
		suggestions: {
			work: string;
			thoughts: string;
			decisions: string;
		};
		relatedNotes: string;
		userLabel: string;
		botLabel: string;
	};

	// Commands
	commands: {
		openChat: string;
		reindexNotes: string;
		ribbonTooltip: string;
	};

	// UI - Settings
	settings: {
		title: string;
		api: {
			heading: string;
			apiKey: string;
			apiKeyDesc: string;
			testConnection: string;
			chatModel: string;
			chatModelDesc: string;
			summaryModel: string;
			summaryModelDesc: string;
			embeddingModel: string;
			embeddingModelDesc: string;
			embeddingModelOptions: {
				qwen8b: string;
				qwen06b: string;
				openai3small: string;
				openai3large: string;
			};
		};
		folders: {
			heading: string;
			journal: string;
			journalDesc: string;
			journalPlaceholder: string;
			entities: string;
			entitiesDesc: string;
			entitiesPlaceholder: string;
		};
		context: {
			heading: string;
			windowDays: string;
			windowDaysDesc: string;
			semanticResults: string;
			semanticResultsDesc: string;
		};
		prompts: {
			heading: string;
			systemPrompt: string;
			systemPromptDesc: string;
			systemPromptPlaceholder: string;
			resetDefault: string;
		};
		other: {
			heading: string;
			language: string;
			languageDesc: string;
			autoIndex: string;
			autoIndexDesc: string;
			reindex: string;
			reindexDesc: string;
			reindexButton: string;
		};
	};

	// Notices
	notices: {
		noMessages: string;
		apiKeyRequired: string;
		saving: string;
		saved: string;
		saveFailed: string;
		apiKeyNotSet: string;
		embeddingLoading: string;
		indexing: string;
		indexComplete: string;
		indexFailed: string;
		connectionSuccess: string;
		connectionFailed: string;
		reindexing: string;
		reindexComplete: string;
		invalidFolderPath: string;
		contentTruncated: string;
		folderConflict: string;
		indexQueueFull: string;
	};

	// Dialogs
	dialogs: {
		clearConfirm: string;
	};

	// Errors
	errors: {
		invalidApiKey: string;
		rateLimited: string;
		serverError: string;
		serviceUnavailable: string;
		networkError: string;
		embeddingLoadFailed: string;
		embeddingGenerateFailed: string;
		folderCreateFailed: string;
		fileWriteFailed: string;
		indexOperationFailed: string;
		parseError: string;
		timeout: string;
		unknown: string;
		noApiKey: string;
		noResponseBody: string;
		notInitialized: string;
		summaryFallback: string;
		truncationMarker: string;
	};

	// Note Templates
	notes: {
		sessionTitle: string;
		summary: string;
		tags: string;
		decisions: string;
		insights: string;
		entities: string;
		values: string;
		conversationLog: string;
		overview: string;
		relationships: string;
		memo: string;
		firstMention: string;
		relatedSessions: string;
		relationshipPlaceholder: string;
	};

	// Context
	context: {
		referenceInfo: string;
		recentReflections: string;
		relatedTopics: string;
		relatedEntities: string;
	};

	// Report
	report: {
		weekly: string;
		monthly: string;
		sessionOverview: string;
		sessionCount: string;
		mainCategories: string;
		moodOverview: string;
		topicHighlights: string;
		sessionDetails: string;
		category: string;
		openQuestions: string;
		pendingActions: string;
		insights: string;
		generated: string;
		savedTo: string;
		alreadyExists: string;
		regenerate: string;
		cancel: string;
		noSessions: string;
		invalidCommand: string;
	};

	// Embedding
	embedding: {
		queryPrefix: string;
		documentPrefix: string;
	};

	// Prompts
	prompts: {
		system: string;
		summary: string;
	};
}

const translations: Record<Language, Translations> = {
	ja,
	en,
};

const DEFAULT_LANGUAGE: Language = 'ja';
const SUPPORTED_LANGUAGES: Language[] = ['ja', 'en'];

let currentLanguage: Language = DEFAULT_LANGUAGE;

export function setLanguage(lang: Language): void {
	// Validate and fallback to default if invalid
	if (SUPPORTED_LANGUAGES.includes(lang)) {
		currentLanguage = lang;
	} else {
		logger.warn(`Unsupported language: ${lang}, falling back to ${DEFAULT_LANGUAGE}`);
		currentLanguage = DEFAULT_LANGUAGE;
	}
}

export function getLanguage(): Language {
	return currentLanguage;
}

export function getTranslations(): Translations {
	// Fallback to default language if current is somehow invalid
	return translations[currentLanguage] || translations[DEFAULT_LANGUAGE];
}

/**
 * Get translations for all supported languages
 * Useful for pattern matching content that may be in any language
 */
export function getAllTranslations(): Translations[] {
	return SUPPORTED_LANGUAGES.map((lang) => translations[lang]);
}
