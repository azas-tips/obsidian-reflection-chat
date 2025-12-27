import type { App } from 'obsidian';

// Extended App interface with internal settings API
export interface ExtendedApp extends App {
	setting: {
		open(): void;
		openTabById(id: string): void;
	};
}

// Message
export interface Message {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	timestamp: number;
}

// Conversation Session
export interface Session {
	id: string;
	startedAt: number;
	messages: Message[];
	context: ConversationContext;
}

// Context Information
export interface ConversationContext {
	recentNotes: NoteSummary[];
	semanticMatches: SearchResult[];
	linkedEntities: Entity[];
}

// Note Metadata
export interface NoteSummary {
	path: string;
	title: string;
	date: string;
	summary: string;
	tags: string[];
	category: string;
	type: 'session' | 'entity';
}

// Vector Search Result
export interface SearchResult {
	id: string;
	score: number;
	metadata: NoteSummary;
}

// Entity (Person, Project, Book, etc.)
export interface Entity {
	name: string;
	type: EntityType;
	description: string;
	path: string;
}

export type EntityType = 'person' | 'project' | 'company' | 'book' | 'other';

// Session Summary
export interface SessionSummary {
	summary: string;
	tags: string[];
	category: SessionCategory;
	decisions: string[];
	insights: string[];
	entities: ExtractedEntity[];
	relations: EntityRelation[];
	values: ValueMention[];
}

// Session Category
export type SessionCategory =
	| 'career'
	| 'relationship'
	| 'wellness'
	| 'creative'
	| 'financial'
	| 'reading'
	| 'idea'
	| 'project'
	| 'life';

// Entity Relation
export interface EntityRelation {
	from: string;
	to: string;
	type: string;
	description?: string;
}

// Extracted Entity
export interface ExtractedEntity {
	name: string;
	type: EntityType;
	description: string;
	context: string;
}

// Value Mention
export interface ValueMention {
	value: string;
	context: string;
	sentiment: 'positive' | 'negative' | 'conflicted';
}

// Value Profile
export interface ValueProfile {
	name: string;
	frequency: number;
	firstMentioned: string;
	lastMentioned: string;
	relatedDecisions: string[];
	tensions: string[];
}

// Plugin Settings
export interface PluginSettings {
	// API
	openRouterApiKey: string;
	chatModel: string;
	summaryModel: string;

	// Folders
	journalFolder: string;
	entitiesFolder: string;

	// Context
	contextWindowDays: number;
	maxSemanticResults: number;

	// Prompt
	systemPrompt: string;

	// Other
	autoIndex: boolean;
}

// Default System Prompt
export const DEFAULT_SYSTEM_PROMPT = `あなたは私専属のパーソナルコーチ兼思考パートナーです。

## 基本姿勢
- 答えを与えず、思考を深める質問をする
- 過去の意思決定パターンや価値観を参照し、一貫性や変化を指摘する
- 私自身が答えを見つけるプロセスを支援する
- 人物・プロジェクト・書籍などの固有名詞に注目し、文脈を把握する

## 話題に応じた動的適応
会話の内容に応じて、適切な専門家としての視点を自然に取り入れてください：
- キャリア・仕事 → キャリアコーチの視点
- 人間関係・コミュニケーション → 関係性コーチの視点
- 健康・習慣・生活 → ウェルネスコーチの視点
- 創作・表現・学習 → クリエイティブコーチの視点
- お金・投資・資産 → ファイナンシャルコーチの視点
- 人生の方向性・価値観 → ライフコーチの視点
- 読書・書籍の内容 → 読書パートナーの視点
- アイデア・企画 → ブレインストーミングパートナーの視点
- プロジェクト振り返り → プロジェクトコーチの視点

専門性は明示的に宣言せず、質問の角度や深掘りの方向性で自然に反映してください。

## 対話スタイル
- 1つの質問に集中する（複数の質問を同時にしない）
- 「なぜ？」より「何が？」「どうしたい？」を使う
- 過去の文脈があれば積極的に参照する（「前に〜と言っていたけど」）
- エンティティ間の関係性に注目する（「その人は〇〇の上司？」）
- 沈黙（考える時間）を尊重し、急かさない
- 1回の返答は3-5文程度

## 質問の例
- 「それについて、何が一番引っかかっている？」
- 「理想の状態はどんな感じ？」
- 「前に似た状況で何を選んだっけ？」
- 「その選択肢の中で、自分の優先順位は？」
- 「それを選んだ自分を、半年後どう思いそう？」
- 「今の話、前に決めた〇〇と関係ありそう？」
- 「それって、具体的にどういうこと？」（読書・学習時）
- 「自分の経験で、当てはまる場面ある？」（読書・学習時）

## 禁止事項
- 長い講釈や一般論
- 押し付けがましいアドバイス
- 過剰な褒め言葉や同調
- 複数の質問を一度に投げる
- 読んでいない・聞いていない内容を推測で語る`;

// Default Settings
export const DEFAULT_SETTINGS: PluginSettings = {
	openRouterApiKey: '',
	chatModel: 'anthropic/claude-sonnet-4.5',
	summaryModel: 'anthropic/claude-haiku-4.5',
	journalFolder: 'journal',
	entitiesFolder: 'entities',
	contextWindowDays: 7,
	maxSemanticResults: 5,
	systemPrompt: DEFAULT_SYSTEM_PROMPT,
	autoIndex: true,
};

// Summary Generation Prompt
export const SUMMARY_PROMPT = `以下のコーチングセッションを分析し、JSON形式で構造化してください。

## 出力形式
{
  "summary": "3-5文での要約。何について話し、どんな気持ち・考えだったか",
  "tags": ["タグ1", "タグ2"],
  "category": "career / relationship / wellness / creative / financial / reading / idea / project / life",
  "decisions": ["検討中の意思決定があれば記載"],
  "insights": ["気づきや学びがあれば記載"],
  "entities": [
    {
      "name": "エンティティ名",
      "type": "person / project / company / book / other",
      "description": "会話から推測される簡単な説明",
      "context": "どういう文脈で言及されたか"
    }
  ],
  "relations": [
    {
      "from": "エンティティA",
      "to": "エンティティB",
      "type": "関係の種類",
      "description": "関係の詳細（任意）"
    }
  ],
  "values": [
    {
      "value": "価値観・判断軸の名前",
      "context": "どういう文脈で言及されたか",
      "sentiment": "positive / negative / conflicted"
    }
  ]
}

## 価値観の抽出ガイド
- 「〜を大事にしたい」「〜は譲れない」などの表現に注目
- 選択肢を比較する際の判断軸を抽出
- トレードオフで悩んでいる場合は conflicted
- 例: "時間の自由", "経済的安定", "成長機会", "家族との時間", "社会的評価"

## エンティティの抽出ガイド
- 固有名詞（人物名、プロジェクト名、会社名、書籍名など）を抽出
- 一般名詞（「上司」「同僚」「本」など）は抽出しない
- typeの判定:
  - person: 人物（例: "田中部長", "山田さん"）
  - project: プロジェクトやタスク（例: "Xプロジェクト", "新規事業"）
  - company: 会社・組織（例: "A社", "〇〇株式会社"）
  - book: 書籍（例: "7つの習慣", "イシューからはじめよ"）
  - other: 上記以外（例: 場所、イベントなど）
- descriptionは会話から推測できる情報のみ記載
- 同一エンティティが複数回言及されても1つにまとめる

## 関係性（relations）の抽出ガイド
- エンティティ間の関係が会話で言及された場合に抽出
- typeの例:
  - 人物関係: 上司、部下、同僚、メンター、家族、友人
  - 組織関係: 所属、責任者、メンバー
  - 書籍関係: 著者、推薦者
  - プロジェクト関係: 担当、関与
- 「自分」も関係の主体/対象になりうる（例: 田中部長 → 自分 の上司）
- 明示的に言及されていない関係は推測しない

## category の判定
会話の主要テーマから1つ選択：
- career: 仕事、キャリア、転職、副業
- relationship: 人間関係、コミュニケーション、家族
- wellness: 健康、習慣、メンタル、生活
- creative: 創作、学習、スキル、表現
- financial: お金、投資、資産形成
- reading: 読書、書籍の内容理解
- idea: アイデア、ひらめき、企画
- project: プロジェクト振り返り、進捗
- life: 人生の方向性、価値観全般

## 注意
- tagsは日本語でOK
- 該当なしの項目は空配列
- 推測で埋めない
- valuesは会話で明確に表れたものだけ
- entitiesは固有名詞のみ抽出（一般名詞は含めない）
- relationsは明示的に言及された関係のみ`;

// OpenRouter Model
export interface OpenRouterModel {
	id: string;
	name: string;
	context_length: number;
	pricing: {
		prompt: string;
		completion: string;
	};
}

// Chat Completion Message (OpenAI format)
export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

// Streaming Chunk
export interface StreamChunk {
	choices: {
		delta: {
			content?: string;
		};
		finish_reason?: string;
	}[];
}
