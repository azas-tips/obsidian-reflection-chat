import { ItemView, WorkspaceLeaf, setIcon, Notice } from 'obsidian';
import type ReflectionChatPlugin from '../main';
import type { Message, ConversationContext } from '../types';
import { openPluginSettings } from '../types';
import { getErrorMessage } from '../utils/errors';
import { getTranslations } from '../i18n';
import { logger } from '../utils/logger';
import { generateId } from '../utils/sanitize';

export const VIEW_TYPE_CHAT = 'reflection-chat-view';

interface ChatViewState extends Record<string, unknown> {
	messages: Message[];
}

export class ChatView extends ItemView {
	private static readonly MAX_MESSAGE_HISTORY = 100;
	private static readonly MAX_TEXTAREA_HEIGHT = 120;
	private static readonly MAX_MESSAGE_LENGTH = 50000; // 50KB per message
	private static readonly MAX_STREAMING_LENGTH = 100000; // 100KB for streaming content

	private plugin: ReflectionChatPlugin;
	private messagesContainer: HTMLElement | null = null;
	private inputEl: HTMLTextAreaElement | null = null;
	private sendBtn: HTMLButtonElement | null = null;
	private relatedPanel: HTMLElement | null = null;
	private statusBar: HTMLElement | null = null;

	// Event handler references for cleanup
	private inputResizeHandler: (() => void) | null = null;
	private inputKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
	private sendClickHandler: (() => void) | null = null;

	// Button references for cleanup
	private newChatBtn: HTMLButtonElement | null = null;
	private settingsBtn: HTMLButtonElement | null = null;
	private saveBtn: HTMLButtonElement | null = null;
	private clearBtn: HTMLButtonElement | null = null;

	// Button handler references for cleanup
	private newChatHandler: (() => void) | null = null;
	private settingsHandler: (() => void) | null = null;
	private saveHandler: (() => void) | null = null;
	private clearHandler: (() => void) | null = null;

	// Dynamic button cleanup tracking (for suggestion buttons and related items)
	private dynamicClickHandlers: Array<{ element: HTMLElement; handler: () => void }> = [];

	private messages: Message[] = [];
	private isLoading = false;
	private isClosed = false; // Prevents operations after view is closed
	private uiHealthy = true; // Tracks if UI is in a valid state after recovery failures
	private streamingContent = '';
	private currentStreamingAbortController: AbortController | null = null; // For canceling ongoing streams
	private streamingTruncated = false; // Track if streaming was truncated
	private currentStreamingElement: HTMLElement | null = null; // Cache for streaming element

	constructor(leaf: WorkspaceLeaf, plugin: ReflectionChatPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	/**
	 * Add a message and enforce limits to prevent memory leaks
	 * @returns true if message was truncated
	 */
	private addMessage(message: Message): boolean {
		let wasTruncated = false;
		// Truncate message content if too long
		if (message.content.length > ChatView.MAX_MESSAGE_LENGTH) {
			message = {
				...message,
				content: message.content.slice(0, ChatView.MAX_MESSAGE_LENGTH) + '... (truncated)',
			};
			logger.warn('Message content truncated due to size limit');
			wasTruncated = true;
		}
		this.messages.push(message);
		// Remove oldest messages if limit exceeded
		if (this.messages.length > ChatView.MAX_MESSAGE_HISTORY) {
			this.messages = this.messages.slice(-ChatView.MAX_MESSAGE_HISTORY);
		}
		return wasTruncated;
	}

	getViewType(): string {
		return VIEW_TYPE_CHAT;
	}

	getDisplayText(): string {
		const t = getTranslations();
		return t.ui.viewTitle;
	}

	getIcon(): string {
		return 'message-circle';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('reflection-chat-container');

		const t = getTranslations();

		// Header
		const header = container.createDiv({ cls: 'reflection-chat-header' });
		const titleWrapper = header.createDiv();
		titleWrapper.createEl('h4', { text: t.ui.viewTitle });

		const headerActions = header.createDiv({ cls: 'reflection-chat-header-actions' });

		this.newChatBtn = headerActions.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': t.ui.newChat },
		});
		setIcon(this.newChatBtn, 'plus');
		this.newChatHandler = () => this.startNewChat();
		this.newChatBtn.addEventListener('click', this.newChatHandler);

		this.settingsBtn = headerActions.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': t.ui.settings },
		});
		setIcon(this.settingsBtn, 'settings');
		this.settingsHandler = () => {
			openPluginSettings(this.app, 'reflection-chat');
		};
		this.settingsBtn.addEventListener('click', this.settingsHandler);

		// Status bar
		this.statusBar = container.createDiv({ cls: 'reflection-chat-status' });
		this.updateStatus();

		// Messages area
		this.messagesContainer = container.createDiv({ cls: 'reflection-chat-messages' });
		// Don't render empty state here - let renderMessages() decide what to render
		// This prevents duplicate rendering when refreshUI() calls both onOpen() and renderMessages()

		// Related notes panel (hidden initially)
		this.relatedPanel = container.createDiv({ cls: 'reflection-chat-related' });
		this.relatedPanel.style.display = 'none';

		// Input area
		const inputArea = container.createDiv({ cls: 'reflection-chat-input-area' });
		const inputWrapper = inputArea.createDiv({ cls: 'reflection-chat-input-wrapper' });

		this.inputEl = inputWrapper.createEl('textarea', {
			cls: 'reflection-chat-input',
			attr: {
				placeholder: t.ui.inputPlaceholder,
				rows: '1',
			},
		});

		this.sendBtn = inputWrapper.createEl('button', {
			cls: 'reflection-chat-send-btn',
			text: t.ui.send,
		});

		// Auto-resize textarea - store handler for cleanup
		this.inputResizeHandler = () => {
			if (this.inputEl) {
				this.inputEl.style.height = 'auto';
				this.inputEl.style.height =
					Math.min(this.inputEl.scrollHeight, ChatView.MAX_TEXTAREA_HEIGHT) + 'px';
			}
		};
		this.inputEl.addEventListener('input', this.inputResizeHandler);

		// Send on Enter (without Shift) - store handler for cleanup
		this.inputKeydownHandler = (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		};
		this.inputEl.addEventListener('keydown', this.inputKeydownHandler);

		// Send button click - store handler for cleanup
		this.sendClickHandler = () => this.sendMessage();
		this.sendBtn.addEventListener('click', this.sendClickHandler);

		// Action buttons
		const actions = inputArea.createDiv({ cls: 'reflection-chat-actions' });

		this.saveBtn = actions.createEl('button', { cls: 'reflection-chat-action-btn' });
		setIcon(this.saveBtn.createSpan(), 'save');
		this.saveBtn.createSpan({ text: t.ui.saveAndEnd });
		this.saveHandler = () => this.saveSession();
		this.saveBtn.addEventListener('click', this.saveHandler);

		this.clearBtn = actions.createEl('button', { cls: 'reflection-chat-action-btn' });
		setIcon(this.clearBtn.createSpan(), 'trash-2');
		this.clearBtn.createSpan({ text: t.ui.clear });
		this.clearHandler = () => this.clearChat();
		this.clearBtn.addEventListener('click', this.clearHandler);

		// Render initial state (empty state or existing messages)
		this.renderMessages();
	}

	async onClose(): Promise<void> {
		// Mark as closed first to prevent any further operations
		this.isClosed = true;

		// Abort any ongoing streaming
		if (this.currentStreamingAbortController) {
			this.currentStreamingAbortController.abort();
			this.currentStreamingAbortController = null;
		}

		// Remove event listeners before clearing element references
		this.cleanupEventListeners();

		// Clear element references to allow garbage collection
		this.messagesContainer = null;
		this.inputEl = null;
		this.sendBtn = null;
		this.relatedPanel = null;
		this.statusBar = null;
		this.currentStreamingElement = null;
		this.newChatBtn = null;
		this.settingsBtn = null;
		this.saveBtn = null;
		this.clearBtn = null;

		// Clear message history to free memory
		this.messages = [];

		// Reset state
		this.streamingContent = '';
		this.isLoading = false;
	}

	/**
	 * Clean up event listeners from input elements and buttons
	 * Called before re-rendering UI to prevent memory leaks
	 */
	private cleanupEventListeners(): void {
		// Cleanup input element listeners
		if (this.inputEl) {
			if (this.inputResizeHandler) {
				this.inputEl.removeEventListener('input', this.inputResizeHandler);
			}
			if (this.inputKeydownHandler) {
				this.inputEl.removeEventListener('keydown', this.inputKeydownHandler);
			}
		}
		if (this.sendBtn && this.sendClickHandler) {
			this.sendBtn.removeEventListener('click', this.sendClickHandler);
		}

		// Cleanup button listeners
		if (this.newChatBtn && this.newChatHandler) {
			this.newChatBtn.removeEventListener('click', this.newChatHandler);
		}
		if (this.settingsBtn && this.settingsHandler) {
			this.settingsBtn.removeEventListener('click', this.settingsHandler);
		}
		if (this.saveBtn && this.saveHandler) {
			this.saveBtn.removeEventListener('click', this.saveHandler);
		}
		if (this.clearBtn && this.clearHandler) {
			this.clearBtn.removeEventListener('click', this.clearHandler);
		}

		// Cleanup dynamic handlers (suggestion buttons, related items)
		for (const { element, handler } of this.dynamicClickHandlers) {
			element.removeEventListener('click', handler);
		}
		this.dynamicClickHandlers = [];

		// Clear handler references
		this.inputResizeHandler = null;
		this.inputKeydownHandler = null;
		this.sendClickHandler = null;
		this.newChatHandler = null;
		this.settingsHandler = null;
		this.saveHandler = null;
		this.clearHandler = null;
	}

	/**
	 * Refresh UI when language changes while preserving chat state
	 */
	refreshUI(): void {
		// Skip refresh if UI is in a failed state
		if (!this.uiHealthy) {
			logger.warn('Skipping UI refresh - UI is in failed state');
			return;
		}

		// Save current input value
		const currentInput = this.inputEl?.value || '';

		// Clean up old event listeners before re-rendering
		this.cleanupEventListeners();

		try {
			// Re-render the view structure with new translations
			this.onOpen();

			// Restore messages if any
			if (this.messages.length > 0) {
				this.renderMessages();
			}

			// Restore input value
			if (this.inputEl && currentInput) {
				this.inputEl.value = currentInput;
			}
		} catch (error) {
			// If onOpen fails, try to recover by re-running it
			logger.error('Failed to refresh UI:', error instanceof Error ? error : undefined);
			try {
				this.onOpen();
			} catch {
				// Critical failure - mark UI as unhealthy to prevent further operations
				logger.error('Critical: Failed to recover UI after refresh error');
				this.uiHealthy = false;
			}
		}
	}

	getState(): ChatViewState {
		return {
			messages: this.messages,
		};
	}

	async setState(state: unknown, result: { history: boolean }): Promise<void> {
		// Type-safe state access - validateChatState handles all validation
		const rawObj = state as Record<string, unknown> | null;
		const originalCount = Array.isArray(rawObj?.messages) ? rawObj.messages.length : 0;

		const chatState = this.validateChatState(state);
		if (chatState?.messages) {
			// Warn if messages were filtered out during validation
			const filteredCount = originalCount - chatState.messages.length;
			if (filteredCount > 0) {
				logger.warn(
					`setState: ${filteredCount} of ${originalCount} messages were invalid and filtered out`
				);
			}

			this.messages = chatState.messages;
			// Only render if container is ready (onOpen has completed)
			if (this.messagesContainer) {
				this.renderMessages();
			}
		}
		await super.setState(state, result);
	}

	private updateStatus(): void {
		if (!this.statusBar) return;
		this.statusBar.empty();

		const t = getTranslations();
		const isConfigured = this.plugin.openRouterClient?.isConfigured();
		const isEmbeddingReady = this.plugin.embedder?.isReady();

		if (!isConfigured) {
			this.statusBar.addClass('warning');
			setIcon(this.statusBar.createSpan(), 'alert-triangle');
			this.statusBar.createSpan({ text: t.notices.apiKeyNotSet });
		} else if (!isEmbeddingReady) {
			this.statusBar.removeClass('warning');
			setIcon(this.statusBar.createSpan(), 'loader');
			this.statusBar.createSpan({ text: t.notices.embeddingLoading });
		} else {
			this.statusBar.style.display = 'none';
		}
	}

	private startNewChat(): void {
		const t = getTranslations();
		if (this.messages.length > 0) {
			// Ask for confirmation
			if (!confirm(t.dialogs.clearConfirm)) {
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

		const t = getTranslations();

		const empty = this.messagesContainer.createDiv({ cls: 'reflection-chat-empty' });
		empty.createDiv({ cls: 'reflection-chat-empty-icon', text: '💬' });
		empty.createDiv({ cls: 'reflection-chat-empty-title', text: t.ui.emptyStateTitle });
		empty.createDiv({
			cls: 'reflection-chat-empty-description',
			text: t.ui.emptyStateDescription,
		});

		// Quick start suggestions
		const suggestions = empty.createDiv({ cls: 'reflection-chat-suggestions' });
		const suggestionTexts = [
			t.ui.suggestions.work,
			t.ui.suggestions.thoughts,
			t.ui.suggestions.decisions,
		];

		for (const text of suggestionTexts) {
			const btn = suggestions.createEl('button', {
				cls: 'reflection-chat-suggestion-btn',
				text,
			});
			const handler = () => {
				if (this.inputEl) {
					this.inputEl.value = text;
					this.inputEl.focus();
				}
			};
			btn.addEventListener('click', handler);
			this.dynamicClickHandlers.push({ element: btn, handler });
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
		// Capture references atomically at the start to prevent race conditions
		// If view closes during this method, cached references remain valid for this call
		const container = this.messagesContainer;
		if (this.isClosed || !container) return;

		// Use cached element to avoid repeated DOM queries
		let streamingEl = this.currentStreamingElement;
		if (!streamingEl) {
			// Final check before DOM creation
			if (this.isClosed) return;

			streamingEl = container.createDiv({
				cls: 'reflection-chat-message assistant streaming',
			});

			const icon = streamingEl.createDiv({
				cls: 'reflection-chat-message-icon',
			});
			icon.textContent = '🤖';

			streamingEl.createDiv({ cls: 'reflection-chat-message-content' });

			// Only cache if view is still open
			if (!this.isClosed) {
				this.currentStreamingElement = streamingEl;
			}
		}

		// Update content using local reference (safe even if view closes)
		const contentEl = streamingEl.querySelector('.reflection-chat-message-content');
		if (contentEl) {
			contentEl.textContent = content;

			if (
				!contentEl.querySelector('.reflection-chat-cursor') &&
				contentEl instanceof HTMLElement
			) {
				contentEl.createSpan({ cls: 'reflection-chat-cursor' });
			}
		}

		// Scroll only if view is still open
		if (!this.isClosed && container) {
			container.scrollTop = container.scrollHeight;
		}
	}

	private finalizeStreamingMessage(): void {
		// Use cached element if available, fallback to DOM query
		const streamingEl =
			this.currentStreamingElement ||
			this.messagesContainer?.querySelector('.reflection-chat-message.streaming');

		if (streamingEl) {
			streamingEl.removeClass('streaming');
			const cursor = streamingEl.querySelector('.reflection-chat-cursor');
			cursor?.remove();
		}

		// Clear cached reference
		this.currentStreamingElement = null;
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
		if (!this.inputEl || this.isLoading || !this.uiHealthy) return;

		const content = this.inputEl.value.trim();
		if (!content) return;

		const t = getTranslations();

		// Check if API is configured
		if (!this.plugin.openRouterClient?.isConfigured()) {
			new Notice(t.notices.apiKeyNotSet);
			openPluginSettings(this.app, 'reflection-chat');
			return;
		}

		// Cancel any ongoing streaming before starting new one
		// Create new controller first to prevent gap where controller is null
		const oldController = this.currentStreamingAbortController;
		this.currentStreamingAbortController = new AbortController();
		if (oldController) {
			oldController.abort();
		}

		// Clear input
		this.inputEl.value = '';
		this.inputEl.style.height = 'auto';

		// Add user message
		const userMessage: Message = {
			id: generateId(),
			role: 'user',
			content,
			timestamp: Date.now(),
		};
		this.addMessage(userMessage);
		this.renderMessages();

		// Set loading state
		this.isLoading = true;
		this.streamingTruncated = false;
		this.updateSendButton();

		try {
			// Get context
			const context = await this.getContext(content);

			// Show related notes if any
			this.showRelatedNotes(context);

			// Stream response (AbortController already created at method start)
			this.streamingContent = '';
			await this.streamResponse(content, context);

			// Notify user if content was truncated
			if (this.streamingTruncated) {
				new Notice(t.notices.contentTruncated);
			}

			// Add assistant message
			const assistantMessage: Message = {
				id: generateId(),
				role: 'assistant',
				content: this.streamingContent,
				timestamp: Date.now(),
			};
			this.addMessage(assistantMessage);
			this.finalizeStreamingMessage();
		} catch (error) {
			// Don't show error for aborted requests
			if (error instanceof Error && error.name === 'AbortError') {
				logger.info('Streaming aborted by user');
				// Remove partial streaming content on abort to avoid inconsistent state
				// (content visible in UI but not saved to history)
				this.messagesContainer
					?.querySelector('.reflection-chat-message.streaming')
					?.remove();
				this.currentStreamingElement = null;
				return;
			}
			logger.error('Error sending message:', error instanceof Error ? error : undefined);
			const errorMsg = getErrorMessage(error);
			this.renderError(errorMsg);
		} finally {
			this.currentStreamingAbortController = null;
			this.currentStreamingElement = null; // Clear cached element
			this.isLoading = false;
			this.updateSendButton();
		}
	}

	private async getContext(message: string): Promise<ConversationContext> {
		if (this.plugin.embedder?.isReady() && this.plugin.contextRetriever) {
			try {
				return await this.plugin.contextRetriever.retrieve(message, this.messages);
			} catch (error) {
				logger.error(
					'Context retrieval error:',
					error instanceof Error ? error : undefined
				);
			}
		}

		return {
			recentNotes: [],
			semanticMatches: [],
			linkedEntities: [],
		};
	}

	private async streamResponse(userMessage: string, context: ConversationContext): Promise<void> {
		if (!this.plugin.chatEngine) {
			throw new Error('Chat engine not initialized');
		}

		// Capture abort controller reference to avoid race conditions
		const abortController = this.currentStreamingAbortController;

		// Check if already aborted
		if (abortController?.signal.aborted) {
			throw new Error('Streaming aborted');
		}

		await this.plugin.chatEngine.chatStream(this.messages, context, (chunk: string) => {
			// Check if view is closed or aborted
			if (this.isClosed || abortController?.signal.aborted) {
				return; // Stop processing chunks
			}

			try {
				// Enforce streaming content limit to prevent memory issues
				if (this.streamingContent.length < ChatView.MAX_STREAMING_LENGTH) {
					this.streamingContent += chunk;
					this.renderStreamingMessage(this.streamingContent);
				} else if (!this.streamingTruncated) {
					// Mark as truncated only once
					this.streamingTruncated = true;
					this.streamingContent += '... (truncated)';
					this.renderStreamingMessage(this.streamingContent);
				}
			} catch (renderError) {
				// Abort stream on rendering errors to avoid wasting resources
				logger.error(
					'Error rendering streaming message, aborting stream:',
					renderError instanceof Error ? renderError : undefined
				);
				abortController?.abort();
			}
		});
	}

	private showRelatedNotes(context: ConversationContext): void {
		if (!this.relatedPanel) return;

		const t = getTranslations();
		const hasRelated =
			context.recentNotes.length > 0 ||
			context.semanticMatches.length > 0 ||
			context.linkedEntities.length > 0;

		// Always clean up old related item handlers before re-rendering or hiding
		this.cleanupRelatedItemHandlers();

		if (!hasRelated) {
			this.relatedPanel.style.display = 'none';
			return;
		}

		this.relatedPanel.empty();
		this.relatedPanel.style.display = 'block';

		const header = this.relatedPanel.createDiv({ cls: 'reflection-chat-related-header' });
		setIcon(header.createSpan(), 'link');
		header.createSpan({ text: t.ui.relatedNotes });

		const items = this.relatedPanel.createDiv({ cls: 'reflection-chat-related-items' });

		for (const match of context.semanticMatches.slice(0, 3)) {
			const item = items.createDiv({ cls: 'reflection-chat-related-item' });
			setIcon(item.createSpan(), 'file-text');
			item.createSpan({ text: match.metadata.title });
			const handler = () => {
				this.app.workspace.openLinkText(match.metadata.path, '', true);
			};
			item.addEventListener('click', handler);
			this.dynamicClickHandlers.push({ element: item, handler });
		}

		for (const entity of context.linkedEntities.slice(0, 3)) {
			// Skip entities without valid path
			if (!entity.path) {
				logger.warn(`Entity "${entity.name}" has no path, skipping`);
				continue;
			}
			const item = items.createDiv({ cls: 'reflection-chat-related-item' });
			setIcon(item.createSpan(), 'user');
			item.createSpan({ text: entity.name });
			const entityPath = entity.path; // Capture for closure
			const handler = () => {
				this.app.workspace.openLinkText(entityPath, '', true);
			};
			item.addEventListener('click', handler);
			this.dynamicClickHandlers.push({ element: item, handler });
		}
	}

	/**
	 * Clean up related item click handlers before re-rendering
	 * Removes handlers for elements that are children of relatedPanel
	 */
	private cleanupRelatedItemHandlers(): void {
		if (!this.relatedPanel) return;

		// Filter and remove handlers for elements inside relatedPanel
		const handlersToKeep: Array<{ element: HTMLElement; handler: () => void }> = [];
		for (const entry of this.dynamicClickHandlers) {
			if (this.relatedPanel.contains(entry.element)) {
				entry.element.removeEventListener('click', entry.handler);
			} else {
				handlersToKeep.push(entry);
			}
		}
		this.dynamicClickHandlers = handlersToKeep;
	}

	private async saveSession(): Promise<void> {
		const t = getTranslations();

		if (this.messages.length === 0) {
			new Notice(t.notices.noMessages);
			return;
		}

		if (!this.plugin.openRouterClient || !this.plugin.openRouterClient.isConfigured()) {
			new Notice(t.notices.apiKeyRequired);
			return;
		}

		if (!this.plugin.chatEngine || !this.plugin.sessionManager) {
			new Notice(t.errors.notInitialized);
			return;
		}

		this.isLoading = true;
		this.updateSendButton();
		new Notice(t.notices.saving);

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
				new Notice(t.notices.saved);
				await this.app.workspace.openLinkText(file.path, '', true);
			}

			this.clearChat();
		} catch (error) {
			logger.error('Save error:', error instanceof Error ? error : undefined);
			new Notice(`${t.notices.saveFailed}: ${getErrorMessage(error)}`);
		} finally {
			this.isLoading = false;
			this.updateSendButton();
		}
	}

	private updateSendButton(): void {
		const t = getTranslations();
		if (this.sendBtn) {
			this.sendBtn.disabled = this.isLoading;
			this.sendBtn.textContent = this.isLoading ? t.ui.sending : t.ui.send;
		}
		if (this.inputEl) {
			this.inputEl.disabled = this.isLoading;
		}
	}

	/**
	 * Type guard for validating ChatViewState from unknown state
	 * Validates and filters each message in the array
	 */
	private validateChatState(state: unknown): ChatViewState | null {
		if (typeof state !== 'object' || state === null) {
			return null;
		}
		const obj = state as Record<string, unknown>;
		if (!Array.isArray(obj.messages)) {
			return null;
		}

		// Validate each message in the array
		const validMessages = obj.messages.filter(
			(msg): msg is Message =>
				typeof msg === 'object' &&
				msg !== null &&
				typeof (msg as Record<string, unknown>).id === 'string' &&
				typeof (msg as Record<string, unknown>).content === 'string' &&
				((msg as Record<string, unknown>).role === 'user' ||
					(msg as Record<string, unknown>).role === 'assistant') &&
				typeof (msg as Record<string, unknown>).timestamp === 'number'
		);

		return { messages: validMessages };
	}
}
