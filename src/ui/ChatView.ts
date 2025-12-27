import { ItemView, WorkspaceLeaf, setIcon, Notice } from 'obsidian';
import type ReflectionChatPlugin from '../main';
import type { Message, ConversationContext, ExtendedApp } from '../types';
import { getErrorMessage } from '../utils/errors';

export const VIEW_TYPE_CHAT = 'reflection-chat-view';

interface ChatViewState extends Record<string, unknown> {
	messages: Message[];
}

export class ChatView extends ItemView {
	private plugin: ReflectionChatPlugin;
	private messagesContainer: HTMLElement | null = null;
	private inputEl: HTMLTextAreaElement | null = null;
	private sendBtn: HTMLButtonElement | null = null;
	private relatedPanel: HTMLElement | null = null;
	private statusBar: HTMLElement | null = null;

	private messages: Message[] = [];
	private isLoading = false;
	private streamingContent = '';

	constructor(leaf: WorkspaceLeaf, plugin: ReflectionChatPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_CHAT;
	}

	getDisplayText(): string {
		return 'Reflection Chat';
	}

	getIcon(): string {
		return 'message-circle';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('reflection-chat-container');

		// Header
		const header = container.createDiv({ cls: 'reflection-chat-header' });
		const titleWrapper = header.createDiv();
		titleWrapper.createEl('h4', { text: 'Reflection Chat' });

		const headerActions = header.createDiv({ cls: 'reflection-chat-header-actions' });

		const newChatBtn = headerActions.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': '新しいチャット' },
		});
		setIcon(newChatBtn, 'plus');
		newChatBtn.addEventListener('click', () => this.startNewChat());

		const settingsBtn = headerActions.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': '設定' },
		});
		setIcon(settingsBtn, 'settings');
		settingsBtn.addEventListener('click', () => {
			(this.app as ExtendedApp).setting.open();
			(this.app as ExtendedApp).setting.openTabById('reflection-chat');
		});

		// Status bar
		this.statusBar = container.createDiv({ cls: 'reflection-chat-status' });
		this.updateStatus();

		// Messages area
		this.messagesContainer = container.createDiv({ cls: 'reflection-chat-messages' });
		this.renderEmptyState();

		// Related notes panel (hidden initially)
		this.relatedPanel = container.createDiv({ cls: 'reflection-chat-related' });
		this.relatedPanel.style.display = 'none';

		// Input area
		const inputArea = container.createDiv({ cls: 'reflection-chat-input-area' });
		const inputWrapper = inputArea.createDiv({ cls: 'reflection-chat-input-wrapper' });

		this.inputEl = inputWrapper.createEl('textarea', {
			cls: 'reflection-chat-input',
			attr: {
				placeholder: '今日はどんな一日だった？',
				rows: '1',
			},
		});

		this.sendBtn = inputWrapper.createEl('button', {
			cls: 'reflection-chat-send-btn',
			text: '送信',
		});

		// Auto-resize textarea
		this.inputEl.addEventListener('input', () => {
			if (this.inputEl) {
				this.inputEl.style.height = 'auto';
				this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 120) + 'px';
			}
		});

		// Send on Enter (without Shift)
		this.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		this.sendBtn.addEventListener('click', () => this.sendMessage());

		// Action buttons
		const actions = inputArea.createDiv({ cls: 'reflection-chat-actions' });

		const saveBtn = actions.createEl('button', { cls: 'reflection-chat-action-btn' });
		setIcon(saveBtn.createSpan(), 'save');
		saveBtn.createSpan({ text: '保存して終了' });
		saveBtn.addEventListener('click', () => this.saveSession());

		const clearBtn = actions.createEl('button', { cls: 'reflection-chat-action-btn' });
		setIcon(clearBtn.createSpan(), 'trash-2');
		clearBtn.createSpan({ text: 'クリア' });
		clearBtn.addEventListener('click', () => this.clearChat());
	}

	async onClose(): Promise<void> {
		// Cleanup
	}

	getState(): ChatViewState {
		return {
			messages: this.messages,
		};
	}

	async setState(state: ChatViewState, result: any): Promise<void> {
		if (state.messages && Array.isArray(state.messages)) {
			this.messages = state.messages;
			this.renderMessages();
		}
		await super.setState(state, result);
	}

	private updateStatus(): void {
		if (!this.statusBar) return;
		this.statusBar.empty();

		const isConfigured = this.plugin.openRouterClient?.isConfigured();
		const isEmbeddingReady = this.plugin.embedder?.isReady();

		if (!isConfigured) {
			this.statusBar.addClass('warning');
			setIcon(this.statusBar.createSpan(), 'alert-triangle');
			this.statusBar.createSpan({ text: 'APIキーを設定してください' });
		} else if (!isEmbeddingReady) {
			this.statusBar.removeClass('warning');
			setIcon(this.statusBar.createSpan(), 'loader');
			this.statusBar.createSpan({ text: '埋め込みモデルを読み込み中...' });
		} else {
			this.statusBar.style.display = 'none';
		}
	}

	private startNewChat(): void {
		if (this.messages.length > 0) {
			// Ask for confirmation
			if (!confirm('現在のチャットをクリアして新しいチャットを開始しますか？')) {
				return;
			}
		}
		this.clearChat();
	}

	private clearChat(): void {
		this.messages = [];
		this.streamingContent = '';
		this.renderMessages();

		if (this.relatedPanel) {
			this.relatedPanel.style.display = 'none';
		}
	}

	private renderEmptyState(): void {
		if (!this.messagesContainer) return;
		this.messagesContainer.empty();

		const empty = this.messagesContainer.createDiv({ cls: 'reflection-chat-empty' });
		empty.createDiv({ cls: 'reflection-chat-empty-icon', text: '💬' });
		empty.createDiv({ cls: 'reflection-chat-empty-title', text: '今日の振り返りを始めよう' });
		empty.createDiv({
			cls: 'reflection-chat-empty-description',
			text: '何か気になっていることや、今日あったことを話してみてください。',
		});

		// Quick start suggestions
		const suggestions = empty.createDiv({ cls: 'reflection-chat-suggestions' });
		const suggestionTexts = [
			'今日の仕事で感じたこと',
			'最近考えていること',
			'悩んでいる決断について',
		];

		for (const text of suggestionTexts) {
			const btn = suggestions.createEl('button', {
				cls: 'reflection-chat-suggestion-btn',
				text,
			});
			btn.addEventListener('click', () => {
				if (this.inputEl) {
					this.inputEl.value = text;
					this.inputEl.focus();
				}
			});
		}
	}

	private renderMessages(): void {
		if (!this.messagesContainer) return;
		this.messagesContainer.empty();

		if (this.messages.length === 0) {
			this.renderEmptyState();
			return;
		}

		for (const message of this.messages) {
			this.renderMessage(message);
		}

		// Auto scroll to bottom
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	private renderMessage(message: Message): void {
		if (!this.messagesContainer) return;

		const messageEl = this.messagesContainer.createDiv({
			cls: `reflection-chat-message ${message.role}`,
		});

		const icon = messageEl.createDiv({ cls: 'reflection-chat-message-icon' });
		icon.textContent = message.role === 'user' ? '👤' : '🤖';

		const content = messageEl.createDiv({ cls: 'reflection-chat-message-content' });
		content.textContent = message.content;
	}

	private renderStreamingMessage(content: string): void {
		if (!this.messagesContainer) return;

		let streamingEl = this.messagesContainer.querySelector(
			'.reflection-chat-message.streaming'
		);

		if (!streamingEl) {
			streamingEl = this.messagesContainer.createDiv({
				cls: 'reflection-chat-message assistant streaming',
			});

			const icon = (streamingEl as HTMLElement).createDiv({
				cls: 'reflection-chat-message-icon',
			});
			icon.textContent = '🤖';

			(streamingEl as HTMLElement).createDiv({ cls: 'reflection-chat-message-content' });
		}

		const contentEl = streamingEl.querySelector('.reflection-chat-message-content');
		if (contentEl) {
			contentEl.textContent = content;

			if (!contentEl.querySelector('.reflection-chat-cursor')) {
				contentEl.createSpan({ cls: 'reflection-chat-cursor' });
			}
		}

		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	private finalizeStreamingMessage(): void {
		const streamingEl = this.messagesContainer?.querySelector(
			'.reflection-chat-message.streaming'
		);
		if (streamingEl) {
			streamingEl.removeClass('streaming');
			const cursor = streamingEl.querySelector('.reflection-chat-cursor');
			cursor?.remove();
		}
	}

	private renderError(errorMessage: string): void {
		if (!this.messagesContainer) return;

		// Remove any streaming message
		this.messagesContainer.querySelector('.reflection-chat-message.streaming')?.remove();

		const errorEl = this.messagesContainer.createDiv({
			cls: 'reflection-chat-message assistant error',
		});

		const icon = errorEl.createDiv({ cls: 'reflection-chat-message-icon' });
		icon.textContent = '⚠️';

		const content = errorEl.createDiv({ cls: 'reflection-chat-message-content' });
		content.textContent = errorMessage;

		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	private async sendMessage(): Promise<void> {
		if (!this.inputEl || this.isLoading) return;

		const content = this.inputEl.value.trim();
		if (!content) return;

		// Check if API is configured
		if (!this.plugin.openRouterClient?.isConfigured()) {
			new Notice('APIキーを設定してください');
			(this.app as ExtendedApp).setting.open();
			(this.app as ExtendedApp).setting.openTabById('reflection-chat');
			return;
		}

		// Clear input
		this.inputEl.value = '';
		this.inputEl.style.height = 'auto';

		// Add user message
		const userMessage: Message = {
			id: this.generateId(),
			role: 'user',
			content,
			timestamp: Date.now(),
		};
		this.messages.push(userMessage);
		this.renderMessages();

		// Set loading state
		this.isLoading = true;
		this.updateSendButton();

		try {
			// Get context
			const context = await this.getContext(content);

			// Show related notes if any
			this.showRelatedNotes(context);

			// Stream response
			this.streamingContent = '';
			await this.streamResponse(content, context);

			// Add assistant message
			const assistantMessage: Message = {
				id: this.generateId(),
				role: 'assistant',
				content: this.streamingContent,
				timestamp: Date.now(),
			};
			this.messages.push(assistantMessage);
			this.finalizeStreamingMessage();
		} catch (error) {
			console.error('Error sending message:', error);
			const errorMsg = getErrorMessage(error);
			this.renderError(errorMsg);
		} finally {
			this.isLoading = false;
			this.updateSendButton();
		}
	}

	private async getContext(message: string): Promise<ConversationContext> {
		if (this.plugin.embedder?.isReady()) {
			try {
				return await this.plugin.contextRetriever.retrieve(message, this.messages);
			} catch (error) {
				console.error('Context retrieval error:', error);
			}
		}

		return {
			recentNotes: [],
			semanticMatches: [],
			linkedEntities: [],
		};
	}

	private async streamResponse(userMessage: string, context: ConversationContext): Promise<void> {
		await this.plugin.chatEngine.chatStream(this.messages, context, (chunk: string) => {
			this.streamingContent += chunk;
			this.renderStreamingMessage(this.streamingContent);
		});
	}

	private showRelatedNotes(context: ConversationContext): void {
		if (!this.relatedPanel) return;

		const hasRelated =
			context.recentNotes.length > 0 ||
			context.semanticMatches.length > 0 ||
			context.linkedEntities.length > 0;

		if (!hasRelated) {
			this.relatedPanel.style.display = 'none';
			return;
		}

		this.relatedPanel.empty();
		this.relatedPanel.style.display = 'block';

		const header = this.relatedPanel.createDiv({ cls: 'reflection-chat-related-header' });
		setIcon(header.createSpan(), 'link');
		header.createSpan({ text: '関連する過去' });

		const items = this.relatedPanel.createDiv({ cls: 'reflection-chat-related-items' });

		for (const match of context.semanticMatches.slice(0, 3)) {
			const item = items.createDiv({ cls: 'reflection-chat-related-item' });
			setIcon(item.createSpan(), 'file-text');
			item.createSpan({ text: match.metadata.title });
			item.addEventListener('click', () => {
				this.app.workspace.openLinkText(match.metadata.path, '', true);
			});
		}

		for (const entity of context.linkedEntities.slice(0, 3)) {
			const item = items.createDiv({ cls: 'reflection-chat-related-item' });
			setIcon(item.createSpan(), 'user');
			item.createSpan({ text: entity.name });
			item.addEventListener('click', () => {
				this.app.workspace.openLinkText(entity.path, '', true);
			});
		}
	}

	private async saveSession(): Promise<void> {
		if (this.messages.length === 0) {
			new Notice('保存するメッセージがありません');
			return;
		}

		if (!this.plugin.openRouterClient?.isConfigured()) {
			new Notice('要約生成にはAPIキーが必要です');
			return;
		}

		this.isLoading = true;
		this.updateSendButton();
		new Notice('セッションを保存中...');

		try {
			const summary = await this.plugin.chatEngine.generateSummary(this.messages);

			if (!this.plugin.sessionManager.getSession()) {
				this.plugin.sessionManager.startSession();
			}

			for (const msg of this.messages) {
				this.plugin.sessionManager.addMessage(msg);
			}

			const modelInfo = {
				chatModel: this.plugin.settings.chatModel,
				summaryModel: this.plugin.settings.summaryModel,
				embeddingModel: this.plugin.settings.embeddingModel,
			};
			const file = await this.plugin.sessionManager.saveSession(summary, modelInfo);

			if (file) {
				new Notice('セッションを保存しました');
				await this.app.workspace.openLinkText(file.path, '', true);
			}

			this.clearChat();
		} catch (error) {
			console.error('Save error:', error);
			new Notice('保存に失敗しました: ' + getErrorMessage(error));
		} finally {
			this.isLoading = false;
			this.updateSendButton();
		}
	}

	private updateSendButton(): void {
		if (this.sendBtn) {
			this.sendBtn.disabled = this.isLoading;
			this.sendBtn.textContent = this.isLoading ? '...' : '送信';
		}
		if (this.inputEl) {
			this.inputEl.disabled = this.isLoading;
		}
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}
