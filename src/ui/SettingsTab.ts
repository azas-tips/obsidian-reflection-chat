import { App, PluginSettingTab, Setting, Notice, Modal } from 'obsidian';
import type ReflectionChatPlugin from '../main';
import { getTranslations, setLanguage, type Language } from '../i18n';
import { validateFolderPath } from '../utils/sanitize';
import { logger } from '../utils/logger';
import type { CoachCharacter, CoachTone, CoachStrictness } from '../types';
import { getPresetCharacters, generateCustomCharacterId } from '../core/CoachCharacter';

export class SettingsTab extends PluginSettingTab {
	plugin: ReflectionChatPlugin;
	private modelOptions: { value: string; label: string }[] = [];
	private embeddingModelOptions: { value: string; label: string }[] = [];
	private isFetchingModels = false; // Prevent concurrent fetches

	private static readonly VALID_LANGUAGES: readonly Language[] = ['ja', 'en'] as const;

	constructor(app: App, plugin: ReflectionChatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Safely save settings with error handling
	 */
	private async safeSettingsSave(): Promise<void> {
		try {
			await this.plugin.saveSettings();
		} catch (error) {
			logger.error('Failed to save settings:', error instanceof Error ? error : undefined);
			new Notice(getTranslations().notices.saveFailed);
		}
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

		// Fetch models if API key is set (errors handled internally)
		if (this.plugin.settings.openRouterApiKey) {
			try {
				await this.fetchModels();
			} catch {
				// fetchModels already logs errors, but catch here to prevent display() from failing
				logger.warn('Model fetch failed during display, continuing with defaults');
			}
		}

		new Setting(containerEl)
			.setName(t.settings.api.chatModel)
			.setDesc(t.settings.api.chatModelDesc)
			.addDropdown((dropdown) => {
				// Add models fetched from OpenRouter
				if (this.modelOptions.length > 0) {
					for (const model of this.modelOptions) {
						dropdown.addOption(model.value, model.label);
					}
				} else {
					// Fallback: show current setting if no models fetched
					dropdown.addOption(
						this.plugin.settings.chatModel,
						this.plugin.settings.chatModel
					);
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
				// Add models fetched from OpenRouter
				if (this.modelOptions.length > 0) {
					for (const model of this.modelOptions) {
						dropdown.addOption(model.value, model.label);
					}
				} else {
					// Fallback: show current setting if no models fetched
					dropdown.addOption(
						this.plugin.settings.summaryModel,
						this.plugin.settings.summaryModel
					);
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
				// Add default embedding model options and track them
				const defaultEmbeddingModels = [
					'qwen/qwen3-embedding-8b',
					'qwen/qwen3-embedding-0.6b',
					'openai/text-embedding-3-small',
					'openai/text-embedding-3-large',
				];
				const addedModels = new Set<string>(defaultEmbeddingModels);

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

				// Add fetched embedding models (use Set instead of DOM query to avoid CSS selector injection)
				for (const model of this.embeddingModelOptions) {
					if (!addedModels.has(model.value)) {
						dropdown.addOption(model.value, model.label);
						addedModels.add(model.value);
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

		// Coach Character Settings
		containerEl.createEl('h3', { text: t.coach.settings.heading });

		// Get all characters (presets + custom)
		const presets = getPresetCharacters();
		const allCharacters = [...presets, ...this.plugin.settings.customCharacters];

		new Setting(containerEl)
			.setName(t.coach.settings.character)
			.setDesc(t.coach.settings.characterDesc)
			.addDropdown((dropdown) => {
				for (const char of allCharacters) {
					const label = char.isPreset
						? `${char.name} (${t.coach.tones[char.tone]}, ${t.coach.strictness[char.strictness]})`
						: `✨ ${char.name}`;
					dropdown.addOption(char.id, label);
				}
				dropdown.setValue(this.plugin.settings.selectedCharacterId);
				dropdown.onChange(async (value) => {
					this.plugin.settings.selectedCharacterId = value;
					await this.plugin.saveSettings();
				});
			});

		// Create custom character button
		new Setting(containerEl).addButton((button) =>
			button.setButtonText(t.coach.settings.createCustom).onClick(() => {
				new CustomCharacterModal(this.app, this.plugin, null, async () => {
					await this.display();
				}).open();
			})
		);

		// List custom characters with edit/delete buttons
		for (const customChar of this.plugin.settings.customCharacters) {
			new Setting(containerEl)
				.setName(`✨ ${customChar.name}`)
				.setDesc(
					`${t.coach.tones[customChar.tone]} / ${t.coach.strictness[customChar.strictness]}`
				)
				.addButton((button) =>
					button.setButtonText(t.coach.settings.editCustom).onClick(() => {
						new CustomCharacterModal(
							this.app,
							this.plugin,
							customChar,
							async () => {
								await this.display();
							}
						).open();
					})
				)
				.addButton((button) =>
					button
						.setButtonText(t.coach.settings.deleteCustom)
						.setWarning()
						.onClick(async () => {
							// Remove from custom characters
							this.plugin.settings.customCharacters =
								this.plugin.settings.customCharacters.filter(
									(c) => c.id !== customChar.id
								);
							// If this was the selected character, reset to default
							if (this.plugin.settings.selectedCharacterId === customChar.id) {
								this.plugin.settings.selectedCharacterId = 'carl';
							}
							await this.plugin.saveSettings();
							await this.display();
						})
				);
		}

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
					// Validate language value before casting
					const isValidLanguage = SettingsTab.VALID_LANGUAGES.includes(value as Language);
					const language: Language = isValidLanguage ? (value as Language) : 'ja';
					this.plugin.settings.language = language;
					setLanguage(language);
					await this.safeSettingsSave();
					// Refresh the settings page
					try {
						await this.display();
					} catch (error) {
						logger.error(
							'Failed to refresh display:',
							error instanceof Error ? error : undefined
						);
					}
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
					// Filter major LLM providers
					const id = model.id.toLowerCase();
					return (
						id.includes('claude') ||
						id.includes('gpt') ||
						id.includes('gemini') ||
						id.includes('grok') ||
						id.includes('deepseek') ||
						id.includes('qwen') ||
						id.includes('glm')
					);
				})
				.sort((a, b) => {
					// Sort by provider (first part of model ID)
					const providerA = a.id.split('/')[0] || '';
					const providerB = b.id.split('/')[0] || '';
					return providerA.localeCompare(providerB);
				})
				.map((model) => ({
					value: model.id,
					label: model.name || model.id,
				}));

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

/**
 * Modal for creating/editing custom coach characters
 */
class CustomCharacterModal extends Modal {
	private plugin: ReflectionChatPlugin;
	private character: CoachCharacter | null;
	private onSave: () => Promise<void>;

	private nameValue: string;
	private toneValue: CoachTone;
	private strictnessValue: CoachStrictness;
	private personalityValue: string;

	constructor(
		app: App,
		plugin: ReflectionChatPlugin,
		character: CoachCharacter | null,
		onSave: () => Promise<void>
	) {
		super(app);
		this.plugin = plugin;
		this.character = character;
		this.onSave = onSave;

		// Initialize values
		this.nameValue = character?.name || '';
		this.toneValue = character?.tone || 'friendly';
		this.strictnessValue = character?.strictness || 'balanced';
		this.personalityValue = character?.personalityPrompt || '';
	}

	onOpen(): void {
		const { contentEl } = this;
		const t = getTranslations();

		contentEl.createEl('h2', {
			text: this.character ? t.coach.settings.editCustom : t.coach.settings.createCustom,
		});

		// Name
		new Setting(contentEl).setName(t.coach.settings.name).addText((text) => {
			text.setValue(this.nameValue).onChange((value) => {
				this.nameValue = value;
			});
		});

		// Tone
		new Setting(contentEl).setName(t.coach.settings.tone).addDropdown((dropdown) => {
			dropdown.addOption('formal', t.coach.tones.formal);
			dropdown.addOption('casual', t.coach.tones.casual);
			dropdown.addOption('friendly', t.coach.tones.friendly);
			dropdown.setValue(this.toneValue);
			dropdown.onChange((value) => {
				this.toneValue = value as CoachTone;
			});
		});

		// Strictness
		new Setting(contentEl).setName(t.coach.settings.strictness).addDropdown((dropdown) => {
			dropdown.addOption('gentle', t.coach.strictness.gentle);
			dropdown.addOption('balanced', t.coach.strictness.balanced);
			dropdown.addOption('strict', t.coach.strictness.strict);
			dropdown.setValue(this.strictnessValue);
			dropdown.onChange((value) => {
				this.strictnessValue = value as CoachStrictness;
			});
		});

		// Personality Prompt
		new Setting(contentEl)
			.setName(t.coach.settings.personalityPrompt)
			.addTextArea((text) => {
				text.setPlaceholder(t.coach.settings.personalityPromptPlaceholder)
					.setValue(this.personalityValue)
					.onChange((value) => {
						this.personalityValue = value;
					});
				text.inputEl.rows = 5;
				text.inputEl.style.width = '100%';
			});

		// Buttons
		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText(t.coach.settings.save)
					.setCta()
					.onClick(async () => {
						if (!this.nameValue.trim()) {
							return;
						}

						const newCharacter: CoachCharacter = {
							id: this.character?.id || generateCustomCharacterId(),
							name: this.nameValue.trim(),
							tone: this.toneValue,
							strictness: this.strictnessValue,
							personalityPrompt: this.personalityValue,
							isPreset: false,
						};

						if (this.character) {
							// Update existing
							const index = this.plugin.settings.customCharacters.findIndex(
								(c) => c.id === this.character!.id
							);
							if (index >= 0) {
								this.plugin.settings.customCharacters[index] = newCharacter;
							}
						} else {
							// Add new
							this.plugin.settings.customCharacters.push(newCharacter);
							// Auto-select the new character
							this.plugin.settings.selectedCharacterId = newCharacter.id;
						}

						await this.plugin.saveSettings();
						await this.onSave();
						this.close();
					})
			)
			.addButton((button) =>
				button.setButtonText(t.coach.settings.cancel).onClick(() => {
					this.close();
				})
			);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
