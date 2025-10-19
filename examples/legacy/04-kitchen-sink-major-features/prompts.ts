/**
 * Prompt Templates
 *
 * One function per dimension, clean and focused
 */

import type { PromptContext, DimensionDependencies, SectionData } from '../../../src';

export function createPrompt(context: PromptContext): string {
	const { dimension, sections, dependencies } = context;
	const section = sections[0];

	switch (dimension) {
		case 'quality_check':
			return qualityCheckPrompt(section);

		case 'sentiment':
			return sentimentPrompt(section);

		case 'topics':
			return topicsPrompt(section);

		case 'group_by_sentiment':
			return groupingPrompt(dependencies);

		case 'deep_analysis':
			return deepAnalysisPrompt(section);

		case 'competitive_compare':
			return comparisonPrompt(dependencies);

		case 'executive_summary':
			return summaryPrompt(dependencies);

		default:
			return '';
	}
}

// ----------------------------------------------------------------------------
// Individual Prompt Functions (Type-Safe)
// ----------------------------------------------------------------------------

function qualityCheckPrompt(section: SectionData | undefined): string {
	if (!section) return '';

	return `Rate this review's quality (1-10):
"${section.content}"

Consider: genuine, informative, clear

Return JSON: {"quality_score": 1-10, "is_spam": boolean, "reason": "..."}`;
}

function sentimentPrompt(section: SectionData | undefined): string {
	if (!section) return '';

	return `Analyze sentiment: "${section.content}"

Return JSON: {
  "sentiment": "positive|negative|neutral",
  "score": 0-1,
  "confidence": 0-1
}`;
}

function topicsPrompt(section: SectionData | undefined): string {
	if (!section) return '';

	return `Extract topics: "${section.content}"

Return JSON: {
  "topics": ["topic1", "topic2"],
  "primary_topic": "main topic"
}`;
}

interface SentimentSection {
	data?: {
		sentiment?: string;
		score?: number;
	};
}

interface TopicsSection {
	data?: {
		topics?: string[];
		primary_topic?: string;
	};
}

interface SentimentData {
	sections?: SentimentSection[];
	aggregated?: boolean;
}

interface TopicsData {
	sections?: TopicsSection[];
	aggregated?: boolean;
}

function groupingPrompt(dependencies: DimensionDependencies): string {
	const sentimentData = dependencies.sentiment?.data as SentimentData | undefined;
	const topicsData = dependencies.topics?.data as TopicsData | undefined;

	if (!sentimentData?.sections) return 'Error: No sentiment data';

	const summaries = sentimentData.sections.map((s, i) => ({
		id: i,
		sentiment: s?.data?.sentiment || 'unknown',
		topics: topicsData?.sections?.[i]?.data?.topics || []
	}));

	return `Group ${summaries.length} reviews by sentiment:
${JSON.stringify(summaries, null, 2)}

Return JSON: {
  "positive": [ids],
  "negative": [ids],
  "neutral": [ids],
  "summary": {
    "positive_count": number,
    "negative_count": number,
    "neutral_count": number
  }
}`;
}

function deepAnalysisPrompt(section: SectionData | undefined): string {
	if (!section) return '';

	const group = section.metadata?.sentiment_group as string | undefined || 'unknown';
	const count = section.metadata?.review_count as number | undefined || 0;

	return `Deep analysis of ${count} ${group} reviews:

${section.content}

Return JSON: {
  "key_themes": ["theme1", "theme2", "theme3"],
  "insights": ["insight1", "insight2"],
  "recommendations": ["action1", "action2"]
}`;
}

interface AnalysisSection {
	data?: {
		key_themes?: string[];
		insights?: string[];
		recommendations?: string[];
	};
}

interface DeepAnalysisData {
	sections?: AnalysisSection[];
}

function comparisonPrompt(dependencies: DimensionDependencies): string {
	const analysisData = dependencies.deep_analysis?.data as DeepAnalysisData | undefined;
	const analyses = analysisData?.sections || [];

	return `Compare sentiment groups:
${JSON.stringify(analyses.map(a => a.data), null, 2)}

Return JSON: {
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "action_items": ["action1", "action2", "action3"]
}`;
}

interface GroupingSummary {
	positive_count?: number;
	negative_count?: number;
	neutral_count?: number;
}

interface GroupingData {
	summary?: GroupingSummary;
}

interface ComparisonData {
	strengths?: string[];
	weaknesses?: string[];
	action_items?: string[];
}

function summaryPrompt(dependencies: DimensionDependencies): string {
	const comparison = dependencies.competitive_compare?.data as ComparisonData | undefined;
	const grouping = dependencies.group_by_sentiment?.data as GroupingData | undefined;

	return `Executive summary:

Grouping: ${JSON.stringify(grouping?.summary, null, 2)}
Comparison: ${JSON.stringify(comparison, null, 2)}

Return JSON: {
  "overall_sentiment": "positive|negative|mixed",
  "sentiment_distribution": {
    "positive_pct": number,
    "negative_pct": number,
    "neutral_pct": number
  },
  "key_findings": ["finding1", "finding2", "finding3"],
  "recommended_actions": ["action1", "action2", "action3"],
  "impact_estimate": "high|medium|low",
  "confidence": 0-1
}`;
}