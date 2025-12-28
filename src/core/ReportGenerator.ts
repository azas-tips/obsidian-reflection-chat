import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { SessionCategory, MoodState, NextAction } from '../types';
import {
	parseFrontmatter,
	getFrontmatterString,
	getFrontmatterStringArray,
} from '../utils/frontmatter';
import { getTranslations, getAllTranslations } from '../i18n';
import { escapeRegex } from '../utils/sanitize';
import { logger } from '../utils/logger';

export type ReportType = 'weekly' | 'monthly';
export type ReportPeriod = 'rolling' | 'last';

export interface ReportCommand {
	type: ReportType;
	period: ReportPeriod;
}

export interface SessionData {
	date: string;
	summary: string;
	category: SessionCategory;
	tags: string[];
	mood?: MoodState;
	nextActions?: NextAction[];
	openQuestions?: string[];
	decisions?: string[];
	insights?: string[];
}

export interface ReportData {
	type: ReportType;
	period: ReportPeriod;
	startDate: string;
	endDate: string;
	sessions: SessionData[];
	categoryBreakdown: Record<string, number>;
	moodSummary: {
		positive: number;
		neutral: number;
		negative: number;
		mixed: number;
	};
	allTags: string[];
	allOpenQuestions: string[];
	pendingActions: NextAction[];
	allInsights: string[];
}

export class ReportGenerator {
	private app: App;
	private journalFolder: string;

	constructor(app: App, journalFolder: string) {
		this.app = app;
		this.journalFolder = journalFolder;
	}

	updateSettings(journalFolder: string): void {
		this.journalFolder = journalFolder;
	}

	/**
	 * Parse /report command
	 * @returns ReportCommand if valid, null if not a report command
	 */
	parseCommand(input: string): ReportCommand | null {
		const trimmed = input.trim().toLowerCase();
		if (!trimmed.startsWith('/report')) {
			return null;
		}

		const parts = trimmed.split(/\s+/);
		if (parts.length < 2) {
			return null;
		}

		const typeArg = parts[1];
		if (typeArg !== 'weekly' && typeArg !== 'monthly') {
			return null;
		}

		const periodArg = parts[2];
		const period: ReportPeriod = periodArg === 'last' ? 'last' : 'rolling';

		return {
			type: typeArg,
			period,
		};
	}

	/**
	 * Calculate date range for report
	 */
	getDateRange(command: ReportCommand): { startDate: Date; endDate: Date } {
		const now = new Date();
		let startDate: Date;
		let endDate: Date;

		if (command.type === 'weekly') {
			if (command.period === 'last') {
				// Last calendar week (Monday to Sunday)
				const dayOfWeek = now.getDay();
				const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

				// End of last week (last Sunday)
				endDate = new Date(now);
				endDate.setDate(now.getDate() - daysSinceMonday - 1);
				endDate.setHours(23, 59, 59, 999);

				// Start of last week (last Monday)
				startDate = new Date(endDate);
				startDate.setDate(endDate.getDate() - 6);
				startDate.setHours(0, 0, 0, 0);
			} else {
				// Rolling: past 7 days
				endDate = new Date(now);
				endDate.setHours(23, 59, 59, 999);

				startDate = new Date(now);
				startDate.setDate(now.getDate() - 6);
				startDate.setHours(0, 0, 0, 0);
			}
		} else {
			// monthly
			if (command.period === 'last') {
				// Last calendar month
				endDate = new Date(now.getFullYear(), now.getMonth(), 0);
				endDate.setHours(23, 59, 59, 999);

				startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
				startDate.setHours(0, 0, 0, 0);
			} else {
				// Rolling: past 30 days
				endDate = new Date(now);
				endDate.setHours(23, 59, 59, 999);

				startDate = new Date(now);
				startDate.setDate(now.getDate() - 29);
				startDate.setHours(0, 0, 0, 0);
			}
		}

		return { startDate, endDate };
	}

	/**
	 * Generate report filename
	 */
	getReportFilename(command: ReportCommand, endDate: Date): string {
		const year = endDate.getFullYear();
		const month = String(endDate.getMonth() + 1).padStart(2, '0');
		const day = String(endDate.getDate()).padStart(2, '0');

		if (command.type === 'weekly') {
			if (command.period === 'last') {
				// Get ISO week number
				const weekNum = this.getISOWeekNumber(endDate);
				return `weekly-${year}-W${String(weekNum).padStart(2, '0')}.md`;
			} else {
				return `weekly-${year}-${month}-${day}.md`;
			}
		} else {
			if (command.period === 'last') {
				return `monthly-${year}-${month}.md`;
			} else {
				return `monthly-${year}-${month}-${day}.md`;
			}
		}
	}

	/**
	 * Get ISO week number
	 */
	private getISOWeekNumber(date: Date): number {
		const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
		const dayNum = d.getUTCDay() || 7;
		d.setUTCDate(d.getUTCDate() + 4 - dayNum);
		const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
		return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
	}

	/**
	 * Check if report file already exists
	 */
	async checkReportExists(command: ReportCommand): Promise<TFile | null> {
		const { endDate } = this.getDateRange(command);
		const filename = this.getReportFilename(command, endDate);
		const filePath = `${this.journalFolder}/reports/${filename}`;

		const file = this.app.vault.getAbstractFileByPath(filePath);
		return file instanceof TFile ? file : null;
	}

	/**
	 * Fetch sessions within date range
	 */
	async fetchSessions(startDate: Date, endDate: Date): Promise<SessionData[]> {
		const startStr = this.formatDateStr(startDate);
		const endStr = this.formatDateStr(endDate);

		const files = this.app.vault.getMarkdownFiles().filter((f) => {
			if (!f.path.startsWith(this.journalFolder + '/')) return false;
			// Skip reports folder
			if (f.path.startsWith(this.journalFolder + '/reports/')) return false;

			const dateMatch = f.basename.match(/^(\d{4}-\d{2}-\d{2})/);
			if (dateMatch) {
				const fileDate = dateMatch[1];
				return fileDate >= startStr && fileDate <= endStr;
			}
			return false;
		});

		const sessions: SessionData[] = [];

		for (const file of files) {
			try {
				const content = await this.app.vault.read(file);
				const sessionData = this.parseSessionNote(content, file.basename);
				if (sessionData) {
					sessions.push(sessionData);
				}
			} catch (error) {
				logger.error(
					`Error reading ${file.path}:`,
					error instanceof Error ? error : undefined
				);
			}
		}

		// Sort by date
		sessions.sort((a, b) => a.date.localeCompare(b.date));

		return sessions;
	}

	/**
	 * Parse session note content
	 */
	private parseSessionNote(content: string, basename: string): SessionData | null {
		const { frontmatter, body } = parseFrontmatter(content);

		const date = getFrontmatterString(frontmatter, 'date', basename.replace('.md', ''));
		const category = getFrontmatterString(frontmatter, 'category', 'life') as SessionCategory;
		const tags = getFrontmatterStringArray(frontmatter, 'tags');

		// Extract summary
		let summary = '';
		const summaryPatterns = getAllTranslations().map(
			(t) =>
				new RegExp(
					`###?\\s*${escapeRegex(t.notes.summary)}\\s*\\n([\\s\\S]*?)(?=\\n###?|$)`
				)
		);

		for (const pattern of summaryPatterns) {
			const match = body.match(pattern);
			if (match) {
				summary = match[1].trim();
				break;
			}
		}

		// Extract decisions
		const decisions: string[] = [];
		const decisionsPatterns = getAllTranslations().map(
			(t) =>
				new RegExp(
					`###?\\s*${escapeRegex(t.notes.decisions)}\\s*\\n([\\s\\S]*?)(?=\\n###?|$)`
				)
		);
		for (const pattern of decisionsPatterns) {
			const match = body.match(pattern);
			if (match) {
				const lines = match[1].trim().split('\n');
				for (const line of lines) {
					const item = line.replace(/^[-*]\s*/, '').trim();
					if (item) decisions.push(item);
				}
				break;
			}
		}

		// Extract insights
		const insights: string[] = [];
		const insightsPatterns = getAllTranslations().map(
			(t) =>
				new RegExp(
					`###?\\s*${escapeRegex(t.notes.insights)}\\s*\\n([\\s\\S]*?)(?=\\n###?|$)`
				)
		);
		for (const pattern of insightsPatterns) {
			const match = body.match(pattern);
			if (match) {
				const lines = match[1].trim().split('\n');
				for (const line of lines) {
					const item = line.replace(/^[-*]\s*/, '').trim();
					if (item) insights.push(item);
				}
				break;
			}
		}

		// TODO: Parse mood, nextActions, openQuestions when they are implemented in session notes

		return {
			date,
			summary,
			category,
			tags,
			decisions,
			insights,
		};
	}

	/**
	 * Aggregate sessions into report data
	 */
	aggregateSessions(
		command: ReportCommand,
		sessions: SessionData[],
		startDate: Date,
		endDate: Date
	): ReportData {
		const categoryBreakdown: Record<string, number> = {};
		const moodSummary = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
		const allTags: string[] = [];
		const allOpenQuestions: string[] = [];
		const pendingActions: NextAction[] = [];
		const allInsights: string[] = [];

		for (const session of sessions) {
			// Category breakdown
			categoryBreakdown[session.category] = (categoryBreakdown[session.category] || 0) + 1;

			// Mood summary
			if (session.mood) {
				moodSummary[session.mood.state]++;
			}

			// Collect tags
			allTags.push(...session.tags);

			// Collect open questions
			if (session.openQuestions) {
				allOpenQuestions.push(...session.openQuestions);
			}

			// Collect pending actions
			if (session.nextActions) {
				pendingActions.push(...session.nextActions);
			}

			// Collect insights
			if (session.insights) {
				allInsights.push(...session.insights);
			}
		}

		// Deduplicate tags
		const uniqueTags = [...new Set(allTags)];

		return {
			type: command.type,
			period: command.period,
			startDate: this.formatDateStr(startDate),
			endDate: this.formatDateStr(endDate),
			sessions,
			categoryBreakdown,
			moodSummary,
			allTags: uniqueTags,
			allOpenQuestions: [...new Set(allOpenQuestions)],
			pendingActions,
			allInsights: [...new Set(allInsights)],
		};
	}

	/**
	 * Format report as markdown
	 */
	formatReport(data: ReportData): string {
		const t = getTranslations();
		const lines: string[] = [];

		// Title
		const typeLabel = data.type === 'weekly' ? t.report.weekly : t.report.monthly;
		lines.push(`# 📊 ${typeLabel} (${data.startDate} - ${data.endDate})`);
		lines.push('');

		// Session overview
		lines.push(`## ${t.report.sessionOverview}`);
		lines.push(`- ${t.report.sessionCount}: ${data.sessions.length}`);

		// Category breakdown
		if (Object.keys(data.categoryBreakdown).length > 0) {
			const categoryParts = Object.entries(data.categoryBreakdown)
				.sort((a, b) => b[1] - a[1])
				.map(([cat, count]) => `${cat} (${count})`)
				.join(', ');
			lines.push(`- ${t.report.mainCategories}: ${categoryParts}`);
		}

		// Mood summary (if any mood data)
		const totalMoods =
			data.moodSummary.positive +
			data.moodSummary.neutral +
			data.moodSummary.negative +
			data.moodSummary.mixed;
		if (totalMoods > 0) {
			const moodParts: string[] = [];
			if (data.moodSummary.positive > 0)
				moodParts.push(`positive: ${data.moodSummary.positive}`);
			if (data.moodSummary.neutral > 0)
				moodParts.push(`neutral: ${data.moodSummary.neutral}`);
			if (data.moodSummary.negative > 0)
				moodParts.push(`negative: ${data.moodSummary.negative}`);
			if (data.moodSummary.mixed > 0) moodParts.push(`mixed: ${data.moodSummary.mixed}`);
			lines.push(`- ${t.report.moodOverview}: ${moodParts.join(', ')}`);
		}
		lines.push('');

		// Topics / Tags
		if (data.allTags.length > 0) {
			lines.push(`## ${t.report.topicHighlights}`);
			const topTags = data.allTags.slice(0, 10);
			for (const tag of topTags) {
				lines.push(`- #${tag}`);
			}
			lines.push('');
		}

		// Session summaries
		if (data.sessions.length > 0) {
			lines.push(`## ${t.report.sessionDetails}`);
			for (const session of data.sessions) {
				lines.push(`### ${session.date}`);
				lines.push(`**${t.report.category}**: ${session.category}`);
				if (session.summary) {
					lines.push(`${session.summary}`);
				}
				lines.push('');
			}
		}

		// Open questions
		if (data.allOpenQuestions.length > 0) {
			lines.push(`## ${t.report.openQuestions}`);
			for (const q of data.allOpenQuestions) {
				lines.push(`- ${q}`);
			}
			lines.push('');
		}

		// Pending actions
		if (data.pendingActions.length > 0) {
			lines.push(`## ${t.report.pendingActions}`);
			for (const action of data.pendingActions) {
				const priority =
					action.priority === 'high' ? '🔴' : action.priority === 'medium' ? '🟡' : '🟢';
				lines.push(`- [ ] ${priority} ${action.action}`);
			}
			lines.push('');
		}

		// Insights
		if (data.allInsights.length > 0) {
			lines.push(`## ${t.report.insights}`);
			for (const insight of data.allInsights) {
				lines.push(`- ${insight}`);
			}
			lines.push('');
		}

		return lines.join('\n');
	}

	/**
	 * Save report to file
	 */
	async saveReport(command: ReportCommand, content: string): Promise<string> {
		const { endDate } = this.getDateRange(command);
		const filename = this.getReportFilename(command, endDate);
		const folderPath = `${this.journalFolder}/reports`;
		const filePath = `${folderPath}/${filename}`;

		// Ensure folder exists
		await this.ensureFolder(folderPath);

		// Save file
		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		if (existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, content);
		} else {
			await this.app.vault.create(filePath, content);
		}

		return filePath;
	}

	/**
	 * Ensure folder exists
	 */
	private async ensureFolder(folderPath: string): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folder) {
			await this.app.vault.createFolder(folderPath);
		}
	}

	/**
	 * Format date as YYYY-MM-DD
	 */
	private formatDateStr(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	/**
	 * Generate report
	 */
	async generateReport(command: ReportCommand): Promise<{ content: string; filePath: string }> {
		const { startDate, endDate } = this.getDateRange(command);
		const sessions = await this.fetchSessions(startDate, endDate);
		const reportData = this.aggregateSessions(command, sessions, startDate, endDate);
		const content = this.formatReport(reportData);
		const filePath = await this.saveReport(command, content);

		return { content, filePath };
	}
}
