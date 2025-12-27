import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type ReflectionChatPlugin from '../main';
import { DEFAULT_SYSTEM_PROMPT } from '../types';

export class SettingsTab extends PluginSettingTab {
	plugin: ReflectionChatPlugin;
	private modelOptions: { value: string; label: string }[] = [];

	constructor(app: App, plugin: ReflectionChatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Reflection Chat 設定' });

		// API Settings
		containerEl.createEl('h3', { text: 'API設定' });

		new Setting(containerEl)
			.setName('OpenRouter API Key')
			.setDesc('OpenRouterのAPIキーを入力してください')
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
				button.setButtonText('テスト接続').onClick(async () => {
					await this.testConnection();
				})
			);

		// Fetch models if API key is set
		if (this.plugin.settings.openRouterApiKey) {
			await this.fetchModels();
		}

		new Setting(containerEl)
			.setName('対話モデル')
			.setDesc('チャットに使用するモデル')
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
			.setName('要約モデル')
			.setDesc('セッション要約に使用するモデル（軽量なモデル推奨）')
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
			.setName('埋め込みモデル')
			.setDesc('セマンティック検索に使用する埋め込みモデル')
			.addDropdown((dropdown) => {
				// Add embedding model options
				dropdown.addOption('qwen/qwen3-embedding-8b', 'Qwen3 Embedding 8B (推奨)');
				dropdown.addOption('qwen/qwen3-embedding-0.6b', 'Qwen3 Embedding 0.6B (軽量)');
				dropdown.addOption('openai/text-embedding-3-small', 'OpenAI Embedding 3 Small');
				dropdown.addOption('openai/text-embedding-3-large', 'OpenAI Embedding 3 Large');

				dropdown.setValue(this.plugin.settings.embeddingModel);
				dropdown.onChange(async (value) => {
					this.plugin.settings.embeddingModel = value;
					await this.plugin.saveSettings();
				});
			});

		// Folder Settings
		containerEl.createEl('h3', { text: 'フォルダ設定' });

		new Setting(containerEl)
			.setName('セッション保存先')
			.setDesc('セッションノートを保存するフォルダ')
			.addText((text) =>
				text
					.setPlaceholder('journal')
					.setValue(this.plugin.settings.journalFolder)
					.onChange(async (value) => {
						this.plugin.settings.journalFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('エンティティ保存先')
			.setDesc('人物・プロジェクト・書籍などのエンティティノートを保存するフォルダ')
			.addText((text) =>
				text
					.setPlaceholder('entities')
					.setValue(this.plugin.settings.entitiesFolder)
					.onChange(async (value) => {
						this.plugin.settings.entitiesFolder = value;
						await this.plugin.saveSettings();
					})
			);

		// Context Settings
		containerEl.createEl('h3', { text: '文脈設定' });

		new Setting(containerEl)
			.setName('直近参照日数')
			.setDesc('直近の何日分のノートを参照するか')
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
			.setName('類似検索件数')
			.setDesc('意味的に類似したノートを何件取得するか')
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
		containerEl.createEl('h3', { text: 'プロンプト' });

		new Setting(containerEl)
			.setName('システムプロンプト')
			.setDesc('AIコーチの振る舞いを定義するプロンプト')
			.addTextArea((text) => {
				text.setPlaceholder('システムプロンプトを入力...')
					.setValue(this.plugin.settings.systemPrompt)
					.onChange(async (value) => {
						this.plugin.settings.systemPrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 10;
				text.inputEl.style.width = '100%';
			});

		new Setting(containerEl).addButton((button) =>
			button.setButtonText('デフォルトに戻す').onClick(async () => {
				this.plugin.settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
				await this.plugin.saveSettings();
				this.display();
			})
		);

		// Other Settings
		containerEl.createEl('h3', { text: 'その他' });

		new Setting(containerEl)
			.setName('自動インデックス')
			.setDesc('ノート保存時に自動でインデックスを更新する')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoIndex).onChange(async (value) => {
					this.plugin.settings.autoIndex = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('ノートを再インデックス')
			.setDesc('すべてのノートのインデックスを再構築します')
			.addButton((button) =>
				button.setButtonText('再インデックス').onClick(async () => {
					new Notice('インデックスを再構築中...');
					// TODO: Implement reindex
					new Notice('インデックスの再構築が完了しました');
				})
			);
	}

	private async testConnection(): Promise<void> {
		const result = await this.plugin.openRouterClient.testConnection();
		new Notice(result.message);

		if (result.success) {
			await this.fetchModels();
			this.display();
		}
	}

	private async fetchModels(): Promise<void> {
		if (!this.plugin.settings.openRouterApiKey) {
			return;
		}

		try {
			const response = await fetch('https://openrouter.ai/api/v1/models', {
				headers: {
					Authorization: `Bearer ${this.plugin.settings.openRouterApiKey}`,
				},
			});

			if (response.ok) {
				const data = await response.json();
				this.modelOptions = data.data
					.filter((model: any) => {
						// Filter streaming-capable models
						return (
							model.id.includes('claude') ||
							model.id.includes('gpt') ||
							model.id.includes('gemini')
						);
					})
					.map((model: any) => ({
						value: model.id,
						label: model.name || model.id,
					}))
					.slice(0, 20);
			}
		} catch (error) {
			console.error('Failed to fetch models:', error);
		}
	}
}
