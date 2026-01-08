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
		goals: '関連するゴール',
		suggestedActions: 'おすすめのアクション',
		nextActions: '次のアクション',
		progress: '進捗',
	},

	goal: {
		types: {
			achievement: '達成目標',
			habit: '習慣形成',
			project: 'プロジェクト',
			learning: '学習目標',
		},
		status: {
			active: '進行中',
			completed: '完了',
			archived: '保留',
		},
		timeframe: {
			shortTerm: '短期（〜3ヶ月）',
			mediumTerm: '中期（3ヶ月〜1年）',
			longTerm: '長期（1年以上）',
		},
		priority: {
			high: '高',
			medium: '中',
			low: '低',
		},
		created: '作成日',
		due: '期限',
	},

	context: {
		referenceInfo: '参考情報（過去の振り返り）',
		recentReflections: '直近の振り返り',
		relatedTopics: '関連する過去の話題',
		relatedEntities: '関連する人物・プロジェクト',
		relatedGoals: 'アクティブなゴール',
	},

	help: {
		title: '利用可能なコマンド',
		commands: {
			help: '/help - このヘルプを表示',
			reportWeekly: '/report weekly - 今週の週次レポートを生成',
			reportWeeklyLast: '/report weekly last - 先週の週次レポートを生成',
			reportMonthly: '/report monthly - 今月の月次レポートを生成',
			reportMonthlyLast: '/report monthly last - 先月の月次レポートを生成',
		},
		tip: 'ヒント: 通常のメッセージを入力して、AIコーチと会話を始めましょう',
	},

	report: {
		weekly: '週次レポート',
		monthly: '月次レポート',
		sessionOverview: 'セッション概要',
		sessionCount: '会話回数',
		mainCategories: '主なカテゴリ',
		moodOverview: '全体のムード',
		topicHighlights: '話題のハイライト',
		sessionDetails: 'セッション詳細',
		category: 'カテゴリ',
		openQuestions: '未解決の問い',
		pendingActions: '次のアクション（未完了）',
		insights: '気づき・学び',
		generated: 'レポートを作成しました',
		savedTo: 'に保存しました',
		alreadyExists: 'のレポートは既に存在します。再生成しますか？',
		regenerate: '再生成する',
		cancel: 'キャンセル',
		noSessions: '対象期間にセッションがありません',
		invalidCommand: '無効なコマンドです。使用例: /report weekly, /report monthly last',
		coachFeedback: 'コーチからのフィードバック',
		highlights: '今週のハイライト',
		patterns: '気づいたパターン',
		advice: '来週へのアドバイス',
		questions: '問いかけ',
		statisticsSummary: '統計サマリー',
		generatingFeedback: 'コーチングフィードバックを生成中...',
	},

	embedding: {
		// Use English prefixes for better embedding model compatibility
		queryPrefix: 'Query: ',
		documentPrefix: 'Document: ',
	},

	coach: {
		settings: {
			heading: 'コーチキャラクター',
			character: 'キャラクター',
			characterDesc: 'AIコーチの性格を選択',
			customCharacter: 'カスタムキャラクター',
			createCustom: 'カスタムキャラクターを作成',
			editCustom: '編集',
			deleteCustom: '削除',
			name: '名前',
			tone: '口調',
			strictness: '厳しさ',
			personalityPrompt: '追加の性格設定',
			personalityPromptPlaceholder: 'このキャラクター固有の振る舞いを記述...',
			save: '保存',
			cancel: 'キャンセル',
			nameRequired: '名前を入力してください',
			deleteConfirm: 'このキャラクターを削除しますか？',
			updateFailed: 'キャラクターの更新に失敗しました',
			duplicateName: '同じ名前のキャラクターが既に存在します',
		},
		tones: {
			formal: 'フォーマル',
			casual: 'カジュアル',
			friendly: 'フレンドリー',
		},
		strictness: {
			gentle: '優しめ',
			balanced: 'バランス',
			strict: '厳しめ',
		},
		presets: {
			carl: {
				name: 'カール',
				personality:
					'無条件の肯定的関心を持つ。相手の言葉を丁寧に反映し、「あなたはそう感じているんですね」と共感を示す。アドバイスより傾聴を重視。答えは相手の中にあると信じる。',
			},
			al: {
				name: 'アル',
				personality:
					'「何のために？」と目的を問う。過去より未来、原因より目的に焦点を当てる。「課題の分離」で他者の課題に踏み込まない。勇気づけを大切にし、「できる」と信じる力を引き出す。',
			},
			viktor: {
				name: 'ヴィクトール',
				personality:
					'「それでも人生にイエスと言えるか？」と意味を問う。苦しみの中にも意味を見出す手助けをする。態度価値を重視し、どんな状況でも選択の自由があると説く。',
			},
			jung: {
				name: 'ユング',
				personality:
					'内面の探求を促す。「その感情の奥に何がある？」と影(シャドウ)に向き合わせる。夢や象徴を大切にし、無意識からのメッセージに耳を傾けさせる。',
			},
			hayao: {
				name: '隼雄',
				personality:
					'日本的な「間」を大切にする。物語やたとえ話で語りかける。解決を急がず「一緒にいる」ことを重視。「それはつらかったですね」と静かに寄り添う。',
			},
			marshall: {
				name: 'マーシャル',
				personality:
					'「で、明日から何を変える？」と行動を迫る。言い訳を許さず、フィードフォワード（未来志向のフィードバック）で具体的な一歩を決めさせる。結果にコミットさせる。',
			},
		},
		tonePrompts: {
			formal: '敬語を使い、丁寧で落ち着いた話し方をする。',
			casual: 'カジュアルな言葉遣いで、親しみやすく話しかける。',
			friendly: '温かく親しみやすい口調で、フレンドリーに接する。',
		},
		strictnessPrompts: {
			gentle: '優しく寄り添い、相手のペースを尊重する。批判は避け、肯定的なフィードバックを心がける。',
			balanced: '共感しつつも、必要に応じて率直な意見を伝える。サポートとチャレンジのバランスを取る。',
			strict: '直接的で率直なフィードバックを与える。言い訳を許さず、高い基準を求める。',
		},
		promptTemplate: {
			header: 'コーチのキャラクター',
			nameIntro: 'あなたの名前は「{name}」です。',
			toneHeader: '口調',
			attitudeHeader: '態度',
			personalityHeader: '性格',
		},
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
  "mood": {
    "state": "positive / neutral / negative / mixed",
    "description": "会話中の感情の動き（任意）"
  },
  "nextActions": [
    {
      "action": "具体的なアクション",
      "priority": "high / medium / low",
      "suggested": false
    }
  ],
  "openQuestions": ["まだ答えが出ていない問い"],
  "timeframe": {
    "horizon": "immediate / short-term / long-term",
    "deadline": "言及された期限（任意）"
  },
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
  ],
  "goals": [
    {
      "name": "ゴール名",
      "description": "ゴールの説明",
      "type": "achievement / habit / project / learning",
      "priority": "high / medium / low",
      "timeframe": "short-term / medium-term / long-term",
      "status": "active / completed / archived",
      "context": "どういう文脈で言及されたか",
      "suggestedActions": ["LLMが提案するゴール達成に向けたアクション"],
      "nextActions": ["ユーザーが言及した具体的な次のアクション"]
    }
  ]
}

## 価値観の抽出ガイド
- 「〜を大事にしたい」「〜は譲れない」などの表現に注目
- 選択肢を比較する際の判断軸を抽出
- トレードオフで悩んでいる場合は conflicted
- 例: "時間の自由", "経済的安定", "成長機会", "家族との時間", "社会的評価"

## ムード（mood）の判定ガイド
- positive: 前向き、期待、やる気、安心
- negative: 不安、落ち込み、イライラ、焦り
- neutral: 淡々と、冷静、特に感情的でない
- mixed: 感情が揺れている、複雑な心境
- descriptionには感情の変化があれば記載（例: "最初は不安だったが話すうちに前向きに"）

## 次のアクション（nextActions）の抽出ガイド
- ユーザーが言及した具体的な行動予定を抽出
- 会話からLLMが提案したアクションも含める（suggested: true）
- priority: 緊急度・重要度から判断
  - high: 今日〜今週中、重要な決断に関わる
  - medium: 今月中、やった方がいい
  - low: いつか、余裕があれば
- 例: "上司に相談する", "本を読み直す", "見積もりを作成する"

## 未解決の問い（openQuestions）の抽出ガイド
- 会話で答えが出なかった問いを記録
- 次回以降の会話で掘り下げるべきテーマ
- 例: "本当にやりたいことは何か", "転職のタイミング", "優先順位の付け方"

## 時間軸（timeframe）の判定ガイド
- horizon: 話題の時間的スコープ
  - immediate: 今日〜今週（直近の課題）
  - short-term: 今月〜3ヶ月（近い将来）
  - long-term: 半年以上（キャリア、人生設計）
- deadline: 「来週までに」「3月末」など具体的期限があれば記載

## ゴール（goals）の抽出ガイド
- ユーザーが達成したい目標・なりたい姿を抽出
- 「〜したい」「〜を目指している」「〜が目標」などの表現に注目
- typeの判定:
  - achievement: 達成目標（資格取得、昇進、目標売上など）
  - habit: 習慣形成（毎日運動、早起き、読書習慣など）
  - project: プロジェクト完遂（新規事業、制作物完成など）
  - learning: 学習目標（プログラミング習得、語学学習など）
- priorityはユーザーの言及頻度・熱量から判断
- suggestedActionsはLLMがゴール達成に有効と考えるアクションを提案
- nextActionsはユーザーが具体的に言及した次のステップ
- 既存ゴールへの進捗言及があれば status を適切に設定

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
- 該当なしの項目は空配列またはnull
- 推測で埋めない
- valuesは会話で明確に表れたものだけ
- entitiesは固有名詞のみ抽出（一般名詞は含めない）
- relationsは明示的に言及された関係のみ
- moodは会話全体の印象から判断
- nextActionsはユーザー発案（suggested: false）とLLM提案（suggested: true）を区別
- openQuestionsは答えが出なかった問いのみ（解決済みは含めない）
- goalsは明確な目標・ゴールが言及された場合のみ抽出
- suggestedActionsはLLMの提案、nextActionsはユーザーの発言から抽出`,

		coachingFeedback: `あなたは専属のパーソナルコーチです。以下のセッションデータを分析し、週次/月次の振り返りフィードバックを提供してください。

## あなたの役割
- 温かく、しかし率直なフィードバックを提供する
- パターンや傾向を見つけて指摘する
- 具体的で実行可能なアドバイスを提案する
- 思考を深める問いかけをする

## 入力データ
期間: {startDate} 〜 {endDate}
セッション数: {sessionCount}

### カテゴリ分布
{categoryBreakdown}

### 各セッションの要約
{sessionSummaries}

### 気づき・学び
{insights}

### 未解決の問い
{openQuestions}

### 保留中のアクション
{pendingActions}

## 出力形式（JSON）
{
  "highlights": "この期間で特に印象的だったこと、達成したこと、前進したことを2-3文で（具体的なセッション内容に言及）",
  "patterns": [
    "気づいたパターンや傾向（例: 仕事の話題が多い、週後半に疲れが見える等）"
  ],
  "advice": [
    "来週/来月に向けた具体的なアドバイス（実行可能なもの）"
  ],
  "questions": [
    "さらに深掘りすべき問いかけ（内省を促す質問）"
  ]
}

## 注意事項
- セッションデータに基づいた具体的なフィードバックを
- 一般論や抽象的なアドバイスは避ける
- 温かいが甘やかさない、コーチらしいトーンで
- 日本語で出力`,
	},
};
