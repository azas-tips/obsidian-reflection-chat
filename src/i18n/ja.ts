import type { Translations } from './index';

export const ja: Translations = {
	ui: {
		viewTitle: 'リフレクションチャット',
		newChat: '新しいチャット',
		settings: '設定',
		send: '送信',
		sending: '...',
		saveAndEnd: '保存して終了',
		clear: 'クリア',
		inputPlaceholder: '今日はどんな一日だった？',
		emptyStateTitle: '今日の振り返りを始めよう',
		emptyStateDescription: '何か気になっていることや、今日あったことを話してみてください。',
		suggestions: {
			work: '今日の仕事で感じたこと',
			thoughts: '最近考えていること',
			decisions: '悩んでいる決断について',
		},
		relatedNotes: '関連する過去',
		userLabel: '自分',
		botLabel: 'Bot',
	},

	commands: {
		openChat: 'チャットを開く',
		reindexNotes: 'ノートを再インデックス',
		ribbonTooltip: 'リフレクションチャットを開く',
	},

	settings: {
		title: 'Reflection Chat 設定',
		api: {
			heading: 'API設定',
			apiKey: 'OpenRouter API Key',
			apiKeyDesc: 'OpenRouterのAPIキーを入力してください',
			testConnection: 'テスト接続',
			chatModel: '対話モデル',
			chatModelDesc: 'チャットに使用するモデル',
			summaryModel: '要約モデル',
			summaryModelDesc: 'セッション要約に使用するモデル（軽量なモデル推奨）',
			embeddingModel: '埋め込みモデル',
			embeddingModelDesc: 'セマンティック検索に使用する埋め込みモデル',
			embeddingModelOptions: {
				qwen8b: 'Qwen3 Embedding 8B (推奨)',
				qwen06b: 'Qwen3 Embedding 0.6B (軽量)',
				openai3small: 'OpenAI Text Embedding 3 Small',
				openai3large: 'OpenAI Text Embedding 3 Large',
			},
		},
		folders: {
			heading: 'フォルダ設定',
			journal: 'セッション保存先',
			journalDesc: 'セッションノートを保存するフォルダ',
			journalPlaceholder: 'journal',
			entities: 'エンティティ保存先',
			entitiesDesc: '人物・プロジェクト・書籍などのエンティティノートを保存するフォルダ',
			entitiesPlaceholder: 'entities',
		},
		context: {
			heading: '文脈設定',
			windowDays: '直近参照日数',
			windowDaysDesc: '直近の何日分のノートを参照するか',
			semanticResults: '類似検索件数',
			semanticResultsDesc: '意味的に類似したノートを何件取得するか',
		},
		prompts: {
			heading: 'プロンプト',
			systemPrompt: 'システムプロンプト',
			systemPromptDesc: 'AIコーチの振る舞いを定義するプロンプト',
			systemPromptPlaceholder: 'システムプロンプトを入力...',
			resetDefault: 'デフォルトに戻す',
		},
		other: {
			heading: 'その他',
			language: '言語',
			languageDesc: 'UIとノート出力の言語',
			autoIndex: '自動インデックス',
			autoIndexDesc: 'ノート保存時に自動でインデックスを更新する',
			reindex: 'ノートを再インデックス',
			reindexDesc: 'すべてのノートのインデックスを再構築します',
			reindexButton: '再インデックス',
		},
	},

	notices: {
		noMessages: '保存するメッセージがありません',
		apiKeyRequired: '要約生成にはAPIキーが必要です',
		saving: 'セッションを保存中...',
		saved: 'セッションを保存しました',
		saveFailed: '保存に失敗しました: ',
		apiKeyNotSet: 'APIキーを設定してください',
		embeddingLoading: '埋め込みモデルを読み込み中...',
		indexing: 'ノートをインデックス中...',
		indexComplete: 'インデックス完了',
		indexFailed: 'インデックスに失敗しました',
		connectionSuccess: '接続成功！',
		connectionFailed: '接続失敗: ',
		reindexing: 'インデックスを再構築中...',
		reindexComplete: 'インデックスの再構築が完了しました',
		invalidFolderPath:
			'無効なフォルダパスです。相対パスを使用し、特殊文字や「..」を含めないでください。',
		contentTruncated: '応答は長さ制限のため切り詰められました',
		folderConflict: 'セッションとエンティティのフォルダを同じにすることはできません',
		indexQueueFull:
			'インデックス待ちキューが満杯のため、一部のファイル更新がスキップされました',
	},

	dialogs: {
		clearConfirm: '現在のチャットをクリアして新しいチャットを開始しますか？',
	},

	errors: {
		invalidApiKey: 'APIキーが無効です。設定を確認してください。',
		rateLimited: 'APIのレート制限に達しました。しばらく待ってから再試行してください。',
		serverError: 'APIサーバーでエラーが発生しました。しばらく待ってから再試行してください。',
		serviceUnavailable: 'APIサービスが一時的に利用できません。',
		networkError: 'ネットワークエラーが発生しました。インターネット接続を確認してください。',
		embeddingLoadFailed: '埋め込みモデルの読み込みに失敗しました。再起動してください。',
		embeddingGenerateFailed: 'テキストの埋め込み生成に失敗しました。',
		folderCreateFailed: 'フォルダの作成に失敗しました。',
		fileWriteFailed: 'ファイルの保存に失敗しました。',
		indexOperationFailed: 'ベクトルインデックスの操作に失敗しました。',
		parseError: 'データの解析に失敗しました。',
		timeout: 'リクエストがタイムアウトしました。',
		unknown: '予期しないエラーが発生しました。',
		noApiKey: 'APIキーが設定されていません。',
		noResponseBody: 'レスポンスボディがありません。',
		notInitialized: 'プラグインが初期化されていません。再起動してください。',
		summaryFallback: 'セッションの要約を生成できませんでした。',
		truncationMarker: '... [レスポンスが切り詰められました]',
	},

	notes: {
		sessionTitle: 'セッション',
		summary: '要約',
		tags: 'タグ',
		decisions: '検討中の意思決定',
		insights: '気づき',
		entities: '言及されたエンティティ',
		values: '価値観・判断軸',
		conversationLog: '会話ログ',
		overview: '概要',
		relationships: '関係性',
		memo: 'メモ',
		firstMention: '初回言及',
		relatedSessions: '関連するセッション',
		relationshipPlaceholder: '（関係性があれば追記）',
	},

	context: {
		referenceInfo: '参考情報（過去の振り返り）',
		recentReflections: '直近の振り返り',
		relatedTopics: '関連する過去の話題',
		relatedEntities: '関連する人物・プロジェクト',
	},

	embedding: {
		// Use English prefixes for better embedding model compatibility
		queryPrefix: 'Query: ',
		documentPrefix: 'Document: ',
	},

	prompts: {
		system: `あなたは私専属のパーソナルコーチ兼思考パートナーです。

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
- 読んでいない・聞いていない内容を推測で語る`,

		summary: `以下のコーチングセッションを分析し、JSON形式で構造化してください。

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
- relationsは明示的に言及された関係のみ`,
	},
};
