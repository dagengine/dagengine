/**
 * Prompt builders for review analysis
 *
 * All prompts are sanitized to prevent prompt injection
 * and include clear JSON formatting instructions.
 */

import type { SectionData } from "../../src/index.js";
import type {
	GlobalGroupingDependencies,
	GlobalSummaryDependencies,
	ReviewWithAnalysis,
} from "./types.js";

/**
 * Prompt builder with input sanitization
 */
export class PromptBuilder {
	/**
	 * Sanitize text to prevent prompt injection
	 */
	private static sanitize(text: string, maxLength = 500): string {
		return text
			.replace(/["\n\r]/g, " ") // Remove quotes and newlines
			.slice(0, maxLength) // Truncate
			.trim();
	}

	/**
	 * Check if review is spam/fake
	 */
	static spamCheck(content: string): string {
		const sanitized = this.sanitize(content, 500);
		const truncated = content.length > 500 ? " [truncated]" : "";

		return `You are a spam detector for customer reviews. Be VERY CAREFUL - most reviews are legitimate.

Review to analyze: "${sanitized}"${truncated}

ONLY mark as SPAM if the review contains ALL of these:
1. Contains suspicious URLs (www.spam-link.com, bit.ly, etc.)
2. OR pharmaceutical keywords (PILLS, VIAGRA, CIALIS)
3. OR obvious scam language (BUY NOW, CLICK HERE, FREE MONEY)
4. OR all caps with excessive punctuation AND suspicious links

Examples of LEGITIMATE reviews (mark is_spam: false):
- "Great value for money! The features are worth every penny."
- "Best investment we made this year. ROI in first month."
- "Support takes forever to respond. Waited 6 hours for simple question."
- "Amazing features! The automation saves us hours every week."
- "Interface is confusing. Took weeks to figure out basic tasks."
- "Pricing is fair and transparent."

CRITICAL: If a review talks about product features, pricing, support, or user experience, 
it is a LEGITIMATE review, NOT spam - even if it's very positive or very negative.

Return ONLY valid JSON:
{
  "is_spam": true or false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}`;
	}

	/**
	 * Analyze sentiment of review
	 */
	static sentiment(content: string): string {
		const sanitized = this.sanitize(content, 500);

		return `Analyze sentiment of this review:

Review: "${sanitized}"

Return ONLY valid JSON:
{
  "sentiment": "positive" or "negative" or "neutral",
  "score": 0.0-1.0
}`;
	}

	/**
	 * Categorize review into one category
	 */
	static categorize(content: string): string {
		const sanitized = this.sanitize(content, 500);

		return `Categorize this review into ONE category:

Review: "${sanitized}"

Categories: pricing, support, features, ux, performance, other

Return ONLY valid JSON:
{
  "category": "one of the categories above"
}`;
	}

	/**
	 * Group reviews by category and calculate stats
	 */
	static groupByCategory(
		sections: SectionData[],
		dependencies: GlobalGroupingDependencies,
	): string {
		const sentiments = dependencies.sentiment?.data?.sections || [];
		const categories = dependencies.categorize?.data?.sections || [];

		// Only include reviews that have BOTH sentiment AND category (skip spam)
		const reviews: ReviewWithAnalysis[] = sentiments
			.map((sentimentResult, reviewIndex) => {
				const sentiment = sentimentResult?.data?.sentiment;
				const category = categories[reviewIndex]?.data?.category;
				const content = sections[reviewIndex]?.content;

				// Skip if missing sentiment or category (these are spam reviews)
				if (!sentiment || !category || !content) {
					return null;
				}

				return {
					sentiment,
					category,
					content: this.sanitize(content, 200),
				} as ReviewWithAnalysis;
			})
			.filter((review): review is ReviewWithAnalysis => review !== null);

		return `Group these reviews by category and calculate stats:

Reviews: ${JSON.stringify(reviews)}

IMPORTANT: Only process reviews with valid sentiment and category data.
Do NOT create a category for spam or reviews without data.

Return ONLY valid JSON:
{
  "categories": [
    {
      "name": "category name",
      "reviews": ["review text 1", "review text 2"],
      "count": 2,
      "avg_sentiment": "positive" or "negative" or "neutral"
    }
  ]
}`;
	}

	/**
	 * Deep analysis of reviews in a category
	 */
	static analyzeCategory(section: SectionData | undefined): string {
		if (!section?.content) {
			console.warn("⚠️  No section content for analysis");
			return "";
		}

		const category = String(section.metadata?.category || "unknown");
		const count = Number(section.metadata?.count || 0);
		const content = section.content;

		return `Deep analysis of ${count} reviews in category: ${category}

Reviews:
${content}

Return ONLY valid JSON:
{
  "category": "${category}",
  "key_insight": "main finding in one sentence",
  "recommendation": "specific action to take",
  "impact": "high" or "medium" or "low",
  "top_quote": "most representative quote from reviews"
}`;
	}

	/**
	 * Create executive summary from category analyses
	 */
	static executiveSummary(dependencies: GlobalSummaryDependencies): string {
		const analyses = dependencies.analyze_category?.data?.sections || [];
		const analysisData = analyses.map((analysis) => analysis?.data).filter(Boolean);

		return `Create executive summary from category analyses:

Analyses: ${JSON.stringify(analysisData)}

Return ONLY valid JSON:
{
  "summary": "2-3 sentence overview",
  "top_priorities": ["priority 1", "priority 2", "priority 3"],
  "estimated_impact": "dollar amount or percentage improvement"
}`;
	}
}