import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type ReflectionChatPlugin from '../main';
import { getTranslations, setLanguage, type Language } from '../i18n';
import { validateFolderPath } from '../utils/sanitize';
import { logger } from '../utils/logger';

export class SettingsTab extends PluginSettingTab {
	plugin: ReflectionChatPlugin;
	private modelOptions: { value: string; label: string }[] = [];
	private embeddingModelOptions: { value: string; label: string }[] = [];
	private isFetchingModels = false; // Prevent concurrent fetches

	constructor(app: App, plugin: ReflectionChatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();

		const t = getTranslations();

		containerEl.createEl('h2', { text: t.settings.title });

		// API Settings
		containerEl.createEl('h3', { text: t.settings.api.heading });

		new Setting(containerEl)
			.setName(t.settings.api.apiKey)
			.setDesc(t.settings.api.apiKeyDesc)
			.addText((text) => {
				text.setPlaceholder('sk-or-...')
					.setValue(this.plugin.settings.openRouterApiKey)
					.onChange(async (value) => {
						this.plugin.settings.openRouterApiKey = value;
						await this.plugin.saveSettings();
					});
				// Mask the API key input
				text.inputEl.type = 'password';
				text.inputEl.autocomplete = 'off';
			})
			.addButton((button) =>
				button.setButtonText(t.settings.api.testConnection).onClick(async () => {
					await this.testConnection();
				})
			);

		// Fetch models if API key is set
		if (this.plugin.settings.openRouterApiKey) {
			await this.fetchModels();
		}

		new Setting(containerEl)
			.setName(t.settings.api.chatModel)
			.setDesc(t.settings.api.chatModelDesc)
			.addDropdown((dropdown) => {
				// Add default options
				dropdown.addOption('anthropic/claude-sonnet-4.5', 'Claude Sonnet 4.5');
				dropdown.addOption('anthropic/claude-haiku-4.5', 'Claude Haiku 4.5');
				dropdown.addOption('openai/gpt-4o', 'GPT-4o');
				dropdown.addOption('openai/gpt-4o-mini', 'GPT-4o Mini');

				// Add fetched models
				for (const model of this.modelOptions) {
					if (!dropdown.selectEl.querySelector(`option[value="${model.value}"]`)) {
						dropdown.addOption(model.value, model.label);
					}
				}

				dropdown.setValue(this.plugin.settings.chatModel);
				dropdown.onChange(async (value) => {
					this.plugin.settings.chatModel = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t.settings.api.summaryModel)
			.setDesc(t.settings.api.summaryModelDesc)
			.addDropdown((dropdown) => {
				// Add default options (lightweight models first)
				dropdown.addOption('anthropic/claude-haiku-4.5', 'Claude Haiku 4.5');
				dropdown.addOption('openai/gpt-4o-mini', 'GPT-4o Mini');
				dropdown.addOption('anthropic/claude-sonnet-4.5', 'Claude Sonnet 4.5');
				dropdown.addOption('openai/gpt-4o', 'GPT-4o');

				// Add fetched models
				for (const model of this.modelOptions) {
					if (!dropdown.selectEl.querySelector(`option[value="${model.value}"]`)) {
						dropdown.addOption(model.value, model.label);
					}
				}

				dropdown.setValue(this.plugin.settings.summaryModel);
				dropdown.onChange(async (value) => {
					this.plugin.settings.summaryModel = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(t.settings.api.embeddingModel)
			.setDesc(t.settings.api.embeddingModelDesc)
			.addDropdown((dropdown) => {
				// Add default embedding model options
				dropdown.addOption(
					'qwen/qwen3-embedding-8b',
					t.settings.api.embeddingModelOptions.qwen8b
				);
				dropdown.addOption(
					'qwen/qwen3-embedding-0.6b',
					t.settings.api.embeddingModelOptions.qwen06b
				);
				dropdown.addOption(
					'openai/text-embedding-3-small',
					t.settings.api.embeddingModelOptions.openai3small
				);
				dropdown.addOption(
					'openai/text-embedding-3-large',
					t.settings.api.embeddingModelOptions.openai3large
				);

				// Add fetched embedding models
				for (const model of this.embeddingModelOptions) {
					if (!dropdown.selectEl.querySelector(`option[value="${model.value}"]`)) {
						dropdown.addOption(model.value, model.label);
					}
				}

				dropdown.setValue(this.plugin.settings.embeddingModel);
				dropdown.onChange(async (value) => {
					this.plugin.settings.embeddingModel = value;
					await this.plugin.saveSettings();
				});
			});

		// Folder Settings
		containerEl.createEl('h3', { text: t.settings.folders.heading });

		new Setting(containerEl)
			.setName(t.settings.folders.journal)
			.setDesc(t.settings.folders.journalDesc)
			.addText((text) => {
				text.setPlaceholder(t.settings.folders.journalPlaceholder)
					.setValue(this.plugin.settings.journalFolder)
					.onChange(async (value) => {
						const validated = validateFolderPath(value);
						if (validated === null) {
							// Invalid path or empty - show error and reset to last valid value
							if (value.trim() !== '') {
								new Notice(t.notices.invalidFolderPath);
							}
							text.setValue(this.plugin.settings.journalFolder);
							return;
						}
						// Check for folder conflict
						if (validated === this.plugin.settings.entitiesFolder) {
							new Notice(t.notices.folderConflict);
							text.setValue(this.plugin.settings.journalFolder);
							return;
						}
						this.plugin.settings.journalFolder = validated;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName(t.settings.folders.entities)
			.setDesc(t.settings.folders.entitiesDesc)
			.addText((text) => {
				text.setPlaceholder(t.settings.folders.entitiesPlaceholder)
					.setValue(this.plugin.settings.entitiesFolder)
					.onChange(async (value) => {
						const validated = validateFolderPath(value);
						if (validated === null) {
							// Invalid path or empty - show error and reset to last valid value
							if (value.trim() !== '') {
								new Notice(t.notices.invalidFolderPath);
							}
							text.setValue(this.plugin.settings.entitiesFolder);
							return;
						}
						// Check for folder conflict
						if (validated === this.plugin.settings.journalFolder) {
							new Notice(t.notices.folderConflict);
							text.setValue(this.plugin.settings.entitiesFolder);
							return;
						}
						this.plugin.settings.entitiesFolder = validated;
						await this.plugin.saveSettings();
					});
			});

		// Context Settings
		containerEl.createEl('h3', { text: t.settings.context.heading });

		new Setting(containerEl)
			.setName(t.settings.context.windowDays)
			.setDesc(t.settings.context.windowDaysDesc)
			.addSlider((slider) =>
				slider
					.setLimits(1, 30, 1)
					.setValue(this.plugin.settings.contextWindowDays)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.contextWindowDays = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t.settings.context.semanticResults)
			.setDesc(t.settings.context.semanticResultsDesc)
			.addSlider((slider) =>
				slider
					.setLimits(1, 20, 1)
					.setValue(this.plugin.settings.maxSemanticResults)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxSemanticResults = value;
						await this.plugin.saveSettings();
					})
			);

		// Prompt Settings
		containerEl.createEl('h3', { text: t.settings.prompts.heading });

		new Setting(containerEl)
			.setName(t.settings.prompts.systemPrompt)
			.setDesc(t.settings.prompts.systemPromptDesc)
			.addTextArea((text) => {
				// Show translated default if empty
				const displayValue = this.plugin.settings.systemPrompt || t.prompts.system;
				text.setPlaceholder(t.settings.prompts.systemPromptPlaceholder)
					.setValue(displayValue)
					.onChange(async (value) => {
						// If user clears the field or sets it back to default, store empty
						const isDefault = value === t.prompts.system;
						this.plugin.settings.systemPrompt = isDefault ? '' : value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 10;
				text.inputEl.style.width = '100%';
			});

		new Setting(containerEl).addButton((button) =>
			button.setButtonText(t.settings.prompts.resetDefault).onClick(async () => {
				// Reset to empty (meaning use language default)
				this.plugin.settings.systemPrompt = '';
				await this.plugin.saveSettings();
				this.display();
			})
		);

		// Other Settings
		containerEl.createEl('h3', { text: t.settings.other.heading });

		new Setting(containerEl)
			.setName(t.settings.other.language)
			.setDesc(t.settings.other.languageDesc)
			.addDropdown((dropdown) => {
				dropdown.addOption('ja', '日本語');
				dropdown.addOption('en', 'English');
				dropdown.setValue(this.plugin.settings.language);
				dropdown.onChange(async (value) => {
					this.plugin.settings.language = value as Language;
					setLanguage(value as Language);
					await this.plugin.saveSettings();
					// Refresh the settings page
					this.display();
				});
			});

		new Setting(containerEl)
			.setName(t.settings.other.autoIndex)
			.setDesc(t.settings.other.autoIndexDesc)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoIndex).onChange(async (value) => {
					this.plugin.settings.autoIndex = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(t.settings.other.reindex)
			.setDesc(t.settings.other.reindexDesc)
			.addButton((button) =>
				button.setButtonText(t.settings.other.reindexButton).onClick(async () => {
					await this.plugin.reindexNotes();
				})
			);
	}

	private async testConnection(): Promise<void> {
		if (!this.plugin.openRouterClient) {
			const t = getTranslations();
			new Notice(t.errors.notInitialized);
			return;
		}

		const result = await this.plugin.openRouterClient.testConnection();
		new Notice(result.message);

		if (result.success) {
			await this.fetchModels();
			this.display();
		}
	}

	private static readonly FETCH_TIMEOUT_MS = 30000; // 30 second timeout for model fetch

	private async fetchModels(): Promise<void> {
		if (!this.plugin.openRouterClient?.isConfigured()) {
			return;
		}

		// Prevent concurrent fetches
		if (this.isFetchingModels) {
			return;
		}

		this.isFetchingModels = true;

		// Set timeout to reset flag if fetch hangs
		// Use flag to prevent race condition between timeout and normal completion
		let timeoutFired = false;
		const timeoutId = setTimeout(() => {
			timeoutFired = true;
			logger.warn('Model fetch timed out, resetting state');
			this.isFetchingModels = false;
		}, SettingsTab.FETCH_TIMEOUT_MS);

		try {
			// Use OpenRouterClient to avoid duplicating API key handling
			const models = await this.plugin.openRouterClient.fetchModels();

			// Chat/Summary models
			this.modelOptions = models
				.filter((model) => {
					// Filter streaming-capable models
					return (
						model.id.includes('claude') ||
						model.id.includes('gpt') ||
						model.id.includes('gemini')
					);
				})
				.map((model) => ({
					value: model.id,
					label: model.name || model.id,
				}))
				.slice(0, 20);

			// Embedding models
			this.embeddingModelOptions = models
				.filter((model) => model.id.includes('embedding'))
				.map((model) => ({
					value: model.id,
					label: model.name || model.id,
				}));
		} catch (error) {
			logger.error('Failed to fetch models:', error instanceof Error ? error : undefined);
		} finally {
			clearTimeout(timeoutId);
			// Only reset flag if timeout hasn't already handled it
			if (!timeoutFired) {
				this.isFetchingModels = false;
			}
		}
	}
}
