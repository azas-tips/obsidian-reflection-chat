# Reflection Chat

AIコーチングと対話しながら、あなたのパーソナルコンテキストグラフを構築するObsidianプラグイン。

## 特徴

- **AIコーチング対話**: OpenRouter経由で様々なLLM（Claude, GPT-4o, Gemini等）と対話
- **文脈を理解**: 過去の振り返りやエンティティ（人物・プロジェクト・書籍等）を自動的に参照
- **セマンティック検索**: OpenRouter Embedding APIによる意味ベースの関連ノート検索
- **自動要約・構造化**: セッション終了時に要約、タグ、感情、次のアクションを自動抽出
- **ゴール設定**: 会話からゴール（目標）を自動検出し、進捗を追跡
- **エンティティ管理**: 人物・プロジェクト・書籍などの関係性を自動的にリンク
- **レポート生成**: 週次・月次の振り返りレポートを自動生成

## インストール

### BRATを使用（推奨）

1. [BRAT](https://github.com/TfTHacker/obsidian42-brat) プラグインをインストール
2. BRATの設定で「Add Beta plugin」をクリック
3. このリポジトリのURLを入力: `azas-tips/obsidian-reflection-chat`

### 手動インストール

1. [Releases](https://github.com/azas-tips/obsidian-reflection-chat/releases)から最新版をダウンロード
2. `main.js`、`manifest.json`、`styles.css`を`<vault>/.obsidian/plugins/reflection-chat/`にコピー
3. Obsidianを再起動し、設定でプラグインを有効化

## セットアップ

1. [OpenRouter](https://openrouter.ai/)でAPIキーを取得
2. プラグイン設定でAPIキーを入力
3. 「テスト接続」で接続を確認

## 使い方

### 基本的な流れ

1. リボンアイコンまたはコマンドパレットからチャットを開く
2. 今日あったことや考えていることを話す
3. AIコーチが質問を通じて思考を深める手助けをする
4. セッション終了時に「保存して終了」で自動要約・構造化

### 文脈の活用

プラグインは以下の文脈を自動的に参照します：

- **直近の振り返り**: 設定した日数分の過去セッション
- **セマンティック検索**: 話題に関連する過去のノート
- **エンティティ**: 言及された人物・プロジェクト・書籍
- **アクティブなゴール**: 進行中の目標

### セッション要約

セッション終了時に以下の情報が自動抽出されます：

- **要約**: 3-5文の概要
- **タグ・カテゴリ**: 話題の分類
- **感情**: セッション中の気分の流れ
- **次のアクション**: 具体的なTODO（優先度付き）
- **未解決の質問**: 今後考えるべきこと
- **エンティティ**: 言及された人物・プロジェクト等
- **価値観**: 表明された判断基準や優先事項
- **ゴール**: 検出された目標

### ゴール（目標）機能

会話中に言及されたゴールは自動的に検出され、ノートとして保存されます。

**ゴールタイプ:**
- 達成目標 (achievement): 資格取得、昇進など
- 習慣形成 (habit): 毎日運動、読書習慣など
- プロジェクト (project): 新規事業、創作活動など
- 学習目標 (learning): プログラミング習得、語学学習など

**ゴールノートの内容:**
- おすすめのアクション（LLMからの提案）
- 次のアクション（ユーザーが言及したステップ）
- 進捗の追跡（セッションごとに自動追記）
- 関連セッションへのリンク

### レポート機能

チャットでコマンドを入力してレポートを生成できます：

| コマンド | 説明 |
|---------|------|
| `/report weekly` | 今週の週次レポート |
| `/report weekly last` | 先週の週次レポート |
| `/report monthly` | 今月の月次レポート |
| `/report monthly last` | 先月の月次レポート |

レポートには以下が含まれます：
- セッション数とカテゴリ分布
- 全体的な気分の傾向
- トピックハイライト
- 未解決の質問
- 保留中のアクション
- 得られた気づき

### エンティティノート

セッション中に言及された固有名詞は自動的にエンティティノートとして作成されます：

```
entities/
├── 田中部長.md
├── Xプロジェクト.md
├── 7つの習慣.md
└── TOEIC900点.md  (ゴール)
```

## 設定

| 設定項目 | 説明 | デフォルト |
|---------|------|-----------|
| OpenRouter API Key | APIキー | - |
| 対話モデル | チャットに使用するモデル | Claude Sonnet 4.5 |
| 要約モデル | 要約生成に使用するモデル | Claude Haiku 4.5 |
| 埋め込みモデル | セマンティック検索に使用 | Qwen3 Embedding 8B |
| セッション保存先 | セッションノートの保存フォルダ | journal |
| エンティティ保存先 | エンティティ・ゴールの保存フォルダ | entities |
| 直近参照日数 | 文脈として参照する日数 | 7 |
| 類似検索件数 | セマンティック検索の結果数 | 5 |
| システムプロンプト | AIの振る舞いをカスタマイズ | (言語デフォルト) |
| 言語 | UIの表示言語（日本語/English） | 日本語 |
| 自動インデックス | ノート保存時に自動でインデックス更新 | ON |

## 対応モデル

OpenRouterを通じて様々なモデルが利用可能です：

**チャット/要約モデル:**
- Anthropic: Claude Opus 4.5, Claude Sonnet 4.5, Claude Haiku 4.5
- OpenAI: GPT-5.2, GPT-5.2 Pro, GPT-5.1, GPT-4.1, o3, o3 Pro, o4-mini
- Google: Gemini 3 Pro/Flash, Gemini 2.5 Pro/Flash
- xAI: Grok 4, Grok 4.1 Fast, Grok 3
- DeepSeek: DeepSeek V3.2, DeepSeek R1
- Qwen: Qwen3 Max, Qwen3 Coder, QwQ 32B
- その他多数

**埋め込みモデル:**
- Qwen3 Embedding 8B（推奨）
- Qwen3 Embedding 0.6B（軽量）
- OpenAI Text Embedding 3 Small/Large

## 技術仕様

### データ保存

ベクトルデータはVault内のプラグインフォルダに保存されます：

```
.obsidian/plugins/reflection-chat/vectors/
├── journal_2024-01-01.json
├── journal_2024-01-02.json
└── ...
```

各ノートごとに個別ファイルで保存されるため、長期運用でも効率的です。

### プライバシー

- ベクトルデータはローカル（Vault内）に保存
- OpenRouter APIへの送信：対話内容、埋め込み用テキスト、関連コンテキスト

## 開発

```bash
# 依存関係のインストール
npm install

# 開発モード（ウォッチ）
npm run dev

# ビルド
npm run build

# Lint
npm run lint
npm run lint:fix

# フォーマット
npm run format
```

## ライセンス

MIT License

## 謝辞

- [Obsidian](https://obsidian.md/) - 素晴らしいナレッジベースアプリ
- [OpenRouter](https://openrouter.ai/) - 統一されたLLM API
