# Reflection Chat

AIコーチングと対話しながら、あなたのパーソナルコンテキストグラフを構築するObsidianプラグイン。

## 特徴

- **AIコーチング対話**: OpenRouter経由で様々なLLM（Claude, GPT-4o等）と対話
- **文脈を理解**: 過去の振り返りやエンティティ（人物・プロジェクト・書籍等）を自動的に参照
- **ローカル埋め込み**: ruri-v3モデルによるプライベートなセマンティック検索
- **自動要約・構造化**: セッション終了時に要約、タグ、エンティティを自動抽出
- **ナレッジグラフ構築**: 人物・プロジェクト・書籍などの関係性を自動的にリンク

## インストール

### BRATを使用（推奨）

1. [BRAT](https://github.com/TfTHacker/obsidian42-brat) プラグインをインストール
2. BRATの設定で「Add Beta plugin」をクリック
3. このリポジトリのURLを入力: `https://github.com/haruki/obsidian-reflection-chat`

### 手動インストール

1. [Releases](https://github.com/haruki/obsidian-reflection-chat/releases)から最新版をダウンロード
2. `main.js`、`manifest.json`、`styles.css`を`<vault>/.obsidian/plugins/reflection-chat/`にコピー
3. Obsidianを再起動し、設定でプラグインを有効化

## セットアップ

1. [OpenRouter](https://openrouter.ai/)でAPIキーを取得
2. プラグイン設定でAPIキーを入力
3. 「テスト接続」で接続を確認

## 使い方

### 基本的な流れ

1. リボンアイコン（💬）またはコマンドパレットからチャットを開く
2. 今日あったことや考えていることを話す
3. AIコーチが質問を通じて思考を深める手助けをする
4. セッション終了時に「保存して終了」で自動要約・構造化

### 文脈の活用

プラグインは以下の文脈を自動的に参照します：

- **直近の振り返り**: 設定した日数分の過去セッション
- **セマンティック検索**: 話題に関連する過去のノート
- **エンティティ**: 言及された人物・プロジェクト・書籍

### エンティティノート

セッション中に言及された固有名詞は自動的にエンティティノートとして作成されます：

```
entities/
├── 田中部長.md
├── Xプロジェクト.md
└── 7つの習慣.md
```

## 設定

| 設定項目 | 説明 | デフォルト |
|---------|------|-----------|
| OpenRouter API Key | APIキー | - |
| 対話モデル | チャットに使用するモデル | Claude Sonnet 4.5 |
| 要約モデル | 要約生成に使用するモデル | Claude Haiku 4.5 |
| セッション保存先 | セッションノートの保存フォルダ | journal |
| エンティティ保存先 | エンティティノートの保存フォルダ | entities |
| 直近参照日数 | 文脈として参照する日数 | 7 |
| 類似検索件数 | セマンティック検索の結果数 | 5 |
| 自動インデックス | ノート保存時に自動でインデックス更新 | ON |

## 技術仕様

### 依存関係

- **LLM**: OpenRouter API
- **埋め込み**: ruri-v3-30m-onnx (Transformers.js)
- **ベクトルDB**: Vectra (ローカルファイルベース)

### プライバシー

- 埋め込み生成はローカルで実行
- ベクトルデータはローカルに保存
- LLM APIへの送信は対話内容と関連コンテキストのみ

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
- [Transformers.js](https://huggingface.co/docs/transformers.js) - ブラウザでのML推論
- [Vectra](https://github.com/Stevenic/vectra) - ローカルベクトルDB
