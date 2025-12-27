import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { ChatView, VIEW_TYPE_CHAT } from './ui/ChatView';
import { SettingsTab } from './ui/SettingsTab';
import { PluginSettings, DEFAULT_SETTINGS } from './types';
import { OpenRouterClient } from './infrastructure/OpenRouterClient';
import { ChatEngine } from './core/ChatEngine';
import { SessionManager } from './core/SessionManager';
import { Embedder } from './infrastructure/Embedder';
import { VectorStore } from './infrastructure/VectorStore';
import { NoteIndexer } from './infrastructure/NoteIndexer';
import { ContextRetriever } from './core/ContextRetriever';

export default class ReflectionChatPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	openRouterClient!: OpenRouterClient;
	chatEngine!: ChatEngine;
	sessionManager!: SessionManager;
	embedder!: Embedder;
	vectorStore!: VectorStore;
	noteIndexer!: NoteIndexer;
	contextRetriever!: ContextRetriever;

	async onload() {
		await this.loadSettings();

		// Initialize components
		await this.initializeComponents();

		// Register the chat view
		this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

		// Add ribbon icon
		this.addRibbonIcon('message-circle', 'Open Reflection Chat', () => {
			this.activateView();
		});

		// Add command to open chat
		this.addCommand({
			id: 'open-chat',
			name: 'Open Chat',
			callback: () => {
				this.activateView();
			},
		});

		// Add command to reindex notes
		this.addCommand({
			id: 'reindex-notes',
			name: 'Reindex Notes',
			callback: async () => {
				await this.reindexNotes();
			},
		});

		// Add settings tab
		this.addSettingTab(new SettingsTab(this.app, this));

		// Initialize embedding and indexing in background
		this.initializeEmbedding();
	}

	onunload() {
		// Cleanup note indexer (event listeners and pending timeouts)
		if (this.noteIndexer) {
			this.noteIndexer.destroy();
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
			this.settings.systemPrompt
		);

		// Initialize Session Manager
		this.sessionManager = new SessionManager(
			this.app,
			this.settings.journalFolder,
			this.settings.entitiesFolder
		);

		// Initialize Embedder with plugin path for caching
		this.embedder = new Embedder(pluginPath);

		// Initialize Vector Store
		this.vectorStore = new VectorStore(pluginPath);

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
		try {
			// Initialize vector store
			await this.vectorStore.initialize();

			// Initialize embedder (loads model)
			await this.embedder.initialize();

			// Initialize note indexer (registers file watchers)
			await this.noteIndexer.initialize();

			// Auto-index if enabled
			if (this.settings.autoIndex) {
				const stats = await this.vectorStore.getStats();
				if (stats.count === 0) {
					// First run, index all notes
					await this.reindexNotes();
				}
			}
		} catch (error) {
			console.error('Failed to initialize embedding:', error);
		}
	}

	async reindexNotes(): Promise<void> {
		new Notice('Indexing notes...');

		try {
			const result = await this.noteIndexer.indexAll();
			new Notice(`Indexed ${result.indexed} notes (${result.errors} errors)`);
		} catch (error) {
			console.error('Reindex error:', error);
			new Notice('Failed to index notes');
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);

		// Update components with new settings
		if (this.openRouterClient) {
			this.openRouterClient.setApiKey(this.settings.openRouterApiKey);
		}
		if (this.chatEngine) {
			this.chatEngine.updateSettings(
				this.settings.chatModel,
				this.settings.summaryModel,
				this.settings.systemPrompt
			);
		}
		if (this.sessionManager) {
			this.sessionManager.updateSettings(
				this.settings.journalFolder,
				this.settings.entitiesFolder
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
