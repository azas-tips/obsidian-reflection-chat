import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { ChatView, VIEW_TYPE_CHAT } from './ui/ChatView';
import { SettingsTab } from './ui/SettingsTab';
import { PluginSettings, DEFAULT_SETTINGS } from './types';
import { OpenRouterClient } from './infrastructure/OpenRouterClient';
import { ChatEngine } from './core/ChatEngine';
import { SessionManager } from './core/SessionManager';
import { ReportGenerator } from './core/ReportGenerator';
import { Embedder } from './infrastructure/Embedder';
import { VectorStore } from './infrastructure/VectorStore';
import { NoteIndexer } from './infrastructure/NoteIndexer';
import { ContextRetriever } from './core/ContextRetriever';
import { setLanguage, getTranslations } from './i18n';
import { getCharacterById, buildCharacterPrompt } from './core/CoachCharacter';
import { logger } from './utils/logger';

export default class ReflectionChatPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	openRouterClient: OpenRouterClient | null = null;
	chatEngine: ChatEngine | null = null;
	sessionManager: SessionManager | null = null;
	reportGenerator: ReportGenerator | null = null;
	embedder: Embedder | null = null;
	vectorStore: VectorStore | null = null;
	noteIndexer: NoteIndexer | null = null;
	contextRetriever: ContextRetriever | null = null;

	async onload() {
		await this.loadSettings();

		// Set language from settings
		setLanguage(this.settings.language);

		const t = getTranslations();

		// Initialize components
		await this.initializeComponents();

		// Register the chat view
		this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

		// Add ribbon icon
		this.addRibbonIcon('message-circle', t.commands.ribbonTooltip, () => {
			this.activateView();
		});

		// Add command to open chat
		this.addCommand({
			id: 'open-chat',
			name: t.commands.openChat,
			callback: () => {
				this.activateView();
			},
		});

		// Add command to reindex notes
		this.addCommand({
			id: 'reindex-notes',
			name: t.commands.reindexNotes,
			callback: async () => {
				await this.reindexNotes();
			},
		});

		// Add settings tab
		this.addSettingTab(new SettingsTab(this.app, this));

		// Initialize embedding and indexing in background
		// Use void to explicitly ignore the promise (errors are handled inside)
		void this.initializeEmbedding();
	}

	async onunload() {
		// Cleanup note indexer (event listeners and pending timeouts)
		if (this.noteIndexer) {
			this.noteIndexer.destroy();
		}

		// Flush any pending vector store changes
		if (this.vectorStore) {
			await this.vectorStore.flush();
		}

		// Detach all leaves of our view type
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT);
	}

	private async initializeComponents(): Promise<void> {
		// Get plugin folder path for vector storage
		const pluginPath = this.manifest.dir || '.obsidian/plugins/reflection-chat';

		// Initialize OpenRouter client
		this.openRouterClient = new OpenRouterClient(this.settings.openRouterApiKey);

		// Initialize Chat Engine
		this.chatEngine = new ChatEngine(
			this.openRouterClient,
			this.settings.chatModel,
			this.settings.summaryModel,
			this.settings.systemPrompt,
			this.getCharacterPrompt()
		);

		// Initialize Session Manager
		this.sessionManager = new SessionManager(
			this.app,
			this.settings.journalFolder,
			this.settings.entitiesFolder
		);

		// Initialize Report Generator
		this.reportGenerator = new ReportGenerator(
			this.app,
			this.settings.journalFolder,
			this.openRouterClient,
			this.settings.summaryModel
		);

		// Initialize Embedder with OpenRouter API key and model
		this.embedder = new Embedder(this.settings.openRouterApiKey, this.settings.embeddingModel);

		// Initialize Vector Store
		this.vectorStore = new VectorStore(this.app, pluginPath);

		// Initialize Note Indexer
		this.noteIndexer = new NoteIndexer(
			this.app,
			this.embedder,
			this.vectorStore,
			this.settings.journalFolder,
			this.settings.entitiesFolder
		);

		// Initialize Context Retriever
		this.contextRetriever = new ContextRetriever(
			this.app,
			this.embedder,
			this.vectorStore,
			this.settings.journalFolder,
			this.settings.entitiesFolder,
			this.settings.contextWindowDays,
			this.settings.maxSemanticResults
		);
	}

	private async initializeEmbedding(): Promise<void> {
		const t = getTranslations();

		if (!this.vectorStore || !this.embedder || !this.noteIndexer) {
			logger.error('Components not initialized');
			return;
		}

		try {
			// Initialize vector store
			await this.vectorStore.initialize();

			// Initialize embedder (loads model)
			await this.embedder.initialize();

			// Initialize note indexer (registers file watchers)
			await this.noteIndexer.initialize();

			// Update chat views to reflect embedding ready state
			this.updateChatViewStatus();

			// Auto-index if enabled
			if (this.settings.autoIndex) {
				const stats = await this.vectorStore.getStats();
				if (stats.count === 0) {
					// First run, index all notes
					await this.reindexNotes();
				}
			}
		} catch (error) {
			logger.error(
				'Failed to initialize embedding:',
				error instanceof Error ? error : undefined
			);
			// Notify user of initialization failure
			new Notice(t.errors.embeddingLoadFailed);
			// Update chat views to reflect error state
			this.updateChatViewStatus();
		}
	}

	/**
	 * Update the status bar of all open ChatView instances.
	 * Called after embedding initialization completes or fails.
	 */
	private updateChatViewStatus(): void {
		const chatViews = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
		for (const leaf of chatViews) {
			try {
				const view = leaf.view;
				if (view && 'updateStatus' in view && typeof view.updateStatus === 'function') {
					view.updateStatus();
				}
			} catch (error) {
				logger.error(
					'Failed to update ChatView status:',
					error instanceof Error ? error : undefined
				);
			}
		}
	}

	async reindexNotes(): Promise<void> {
		const t = getTranslations();

		if (!this.noteIndexer) {
			new Notice(t.notices.indexFailed);
			return;
		}

		new Notice(t.notices.indexing);

		try {
			const result = await this.noteIndexer.indexAll();
			new Notice(`${t.notices.indexComplete} (${result.indexed} / ${result.errors} errors)`);
		} catch (error) {
			logger.error('Reindex error:', error instanceof Error ? error : undefined);
			new Notice(t.notices.indexFailed);
		}
	}

	async loadSettings() {
		const loaded = await this.loadData();
		this.settings = this.validateSettings(Object.assign({}, DEFAULT_SETTINGS, loaded));
	}

	/**
	 * Validate and sanitize loaded settings, falling back to defaults for invalid values
	 */
	private validateSettings(settings: PluginSettings): PluginSettings {
		return {
			openRouterApiKey:
				typeof settings.openRouterApiKey === 'string' ? settings.openRouterApiKey : '',
			chatModel:
				typeof settings.chatModel === 'string'
					? settings.chatModel
					: DEFAULT_SETTINGS.chatModel,
			summaryModel:
				typeof settings.summaryModel === 'string'
					? settings.summaryModel
					: DEFAULT_SETTINGS.summaryModel,
			embeddingModel:
				typeof settings.embeddingModel === 'string'
					? settings.embeddingModel
					: DEFAULT_SETTINGS.embeddingModel,
			journalFolder:
				typeof settings.journalFolder === 'string'
					? settings.journalFolder
					: DEFAULT_SETTINGS.journalFolder,
			entitiesFolder:
				typeof settings.entitiesFolder === 'string'
					? settings.entitiesFolder
					: DEFAULT_SETTINGS.entitiesFolder,
			contextWindowDays:
				typeof settings.contextWindowDays === 'number' && settings.contextWindowDays > 0
					? settings.contextWindowDays
					: DEFAULT_SETTINGS.contextWindowDays,
			maxSemanticResults:
				typeof settings.maxSemanticResults === 'number' && settings.maxSemanticResults > 0
					? settings.maxSemanticResults
					: DEFAULT_SETTINGS.maxSemanticResults,
			systemPrompt:
				typeof settings.systemPrompt === 'string'
					? settings.systemPrompt
					: DEFAULT_SETTINGS.systemPrompt,
			language:
				settings.language === 'ja' || settings.language === 'en'
					? settings.language
					: DEFAULT_SETTINGS.language,
			autoIndex:
				typeof settings.autoIndex === 'boolean'
					? settings.autoIndex
					: DEFAULT_SETTINGS.autoIndex,
			selectedCharacterId:
				typeof settings.selectedCharacterId === 'string'
					? settings.selectedCharacterId
					: DEFAULT_SETTINGS.selectedCharacterId,
			customCharacters: Array.isArray(settings.customCharacters)
				? settings.customCharacters
				: DEFAULT_SETTINGS.customCharacters,
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);

		// Update language
		setLanguage(this.settings.language);

		// Refresh chat views to update translations
		const chatViews = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
		for (const leaf of chatViews) {
			try {
				const view = leaf.view;
				// Type-safe check: verify view is a ChatView with refreshUI method
				if (view && 'refreshUI' in view && typeof view.refreshUI === 'function') {
					view.refreshUI();
				}
			} catch (error) {
				// Log but don't fail settings save if view refresh fails
				logger.error(
					'Failed to refresh ChatView:',
					error instanceof Error ? error : undefined
				);
			}
		}

		// Update components with new settings
		if (this.openRouterClient) {
			this.openRouterClient.setApiKey(this.settings.openRouterApiKey);
		}
		if (this.embedder) {
			this.embedder.setApiKey(this.settings.openRouterApiKey);
			this.embedder.setModel(this.settings.embeddingModel);
		}
		if (this.chatEngine) {
			this.chatEngine.updateSettings(
				this.settings.chatModel,
				this.settings.summaryModel,
				this.settings.systemPrompt,
				this.getCharacterPrompt()
			);
		}
		if (this.sessionManager) {
			this.sessionManager.updateSettings(
				this.settings.journalFolder,
				this.settings.entitiesFolder
			);
		}
		if (this.reportGenerator) {
			this.reportGenerator.updateSettings(
				this.settings.journalFolder,
				this.settings.summaryModel
			);
		}
		if (this.noteIndexer) {
			this.noteIndexer.updateSettings(
				this.settings.journalFolder,
				this.settings.entitiesFolder
			);
		}
		if (this.contextRetriever) {
			this.contextRetriever.updateSettings(
				this.settings.journalFolder,
				this.settings.entitiesFolder,
				this.settings.contextWindowDays,
				this.settings.maxSemanticResults
			);
		}
	}

	/**
	 * Get the character prompt for the selected coach character
	 */
	private getCharacterPrompt(): string {
		const character = getCharacterById(
			this.settings.selectedCharacterId,
			this.settings.customCharacters
		);
		if (character) {
			return buildCharacterPrompt(character);
		}
		return '';
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_CHAT);

		if (leaves.length > 0) {
			// View already exists, reveal it
			leaf = leaves[0];
		} else {
			// Create new leaf in right sidebar
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_CHAT,
					active: true,
				});
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}
}
