/**
 * Display utilities for review analysis results
 */

import type { ProcessResult } from "../../src/index.js";
import {
	isCategoryAnalysis,
	isExecutiveSummary,
	type CategoryAnalysis,
} from "./types.js";
import { SAMPLE_REVIEWS } from "./data.js";

/**
 * Get emoji for impact level
 */
function getEmoji(impact: "high" | "medium" | "low"): string {
	const emojiMap: Record<"high" | "medium" | "low", string> = {
		high: "🔴",
		medium: "🟡",
		low: "🟢",
	};
	return emojiMap[impact];
}

/**
 * Format large numbers with commas
 */
function formatNumber(num: number): string {
	return num.toLocaleString();
}

/**
 * Display analysis results with comprehensive metrics
 */
export function displayResults(result: ProcessResult, duration: number): void {
	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("📊 ANALYSIS RESULTS");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	// Count spam filtered
	const totalAnalyzed = result.transformedSections
		.map((s) => (s.metadata?.count as number) || 0)
		.reduce((sum, count) => sum + count, 0);
	const spamCount = SAMPLE_REVIEWS.length - totalAnalyzed;

	console.log(`✓ Analyzed ${totalAnalyzed} legitimate reviews`);
	console.log(`✓ Filtered ${spamCount} spam reviews\n`);

	// Show category analyses
	const categoryAnalyses = result.sections
		.map((s) => s.results.analyze_category?.data)
		.filter((data): data is CategoryAnalysis =>
			data !== undefined ? isCategoryAnalysis(data) : false,
		);

	categoryAnalyses.forEach((analysis) => {
		const emoji = getEmoji(analysis.impact);
		console.log(`${emoji} ${analysis.category.toUpperCase()}`);
		console.log(`├─ Insight: ${analysis.key_insight}`);
		console.log(`├─ Action: ${analysis.recommendation}`);
		console.log(`├─ Impact: ${analysis.impact}`);
		console.log(`└─ Quote: "${analysis.top_quote}"\n`);
	});

	// Show executive summary
	const summaryData = result.globalResults.executive_summary?.data;

	if (summaryData && isExecutiveSummary(summaryData)) {
		console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		console.log("📋 EXECUTIVE SUMMARY");
		console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
		console.log(summaryData.summary);
		console.log("\n🎯 Top Priorities:");
		summaryData.top_priorities.forEach((p, i) => {
			console.log(`   ${i + 1}. ${p}`);
		});
	}

	// Show detailed cost breakdown
	if (result.costs) {
		console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		console.log("💰 COST BREAKDOWN");
		console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

		// Calculate metrics
		const { totalCost, totalTokens, byDimension } = result.costs;
		const totalCalls = Object.values(byDimension).length > 0
			? Object.entries(byDimension).reduce((sum, [dim]) => {
				// Count calls per dimension
				if (dim === "filter_spam") return sum + SAMPLE_REVIEWS.length;
				if (dim === "sentiment" || dim === "categorize") return sum + totalAnalyzed;
				if (dim === "analyze_category") return sum + categoryAnalyses.length;
				return sum + 1; // Global dimensions
			}, 0)
			: 0;

		// Calculate skipped calls
		const skippedSentimentCalls = spamCount;
		const skippedCategorizeCalls = spamCount;
		const totalSkippedCalls = skippedSentimentCalls + skippedCategorizeCalls;

		// Show dimension breakdown
		console.log("📊 By Dimension:\n");

		const dimensionOrder = [
			"filter_spam",
			"sentiment",
			"categorize",
			"group_by_category",
			"analyze_category",
			"executive_summary"
		];

		dimensionOrder.forEach(dim => {
			const dimCost = byDimension[dim];
			if (!dimCost) return;

			const tokens = dimCost.tokens;
			const model = dimCost.model.includes("haiku") ? "Haiku" : "Sonnet";

			// Calculate calls for this dimension
			let calls = 1;
			if (dim === "filter_spam") calls = SAMPLE_REVIEWS.length;
			else if (dim === "sentiment" || dim === "categorize") calls = totalAnalyzed;
			else if (dim === "analyze_category") calls = categoryAnalyses.length;

			console.log(`   ${dim}:`);
			console.log(`   ├─ Calls:  ${calls}`);
			console.log(`   ├─ Model:  ${model}`);
			console.log(`   ├─ Tokens: ${formatNumber(tokens.totalTokens)} (${formatNumber(tokens.inputTokens)} in, ${formatNumber(tokens.outputTokens)} out)`);
			console.log(`   └─ Cost:   $${dimCost.cost.toFixed(4)}\n`);
		});

		// Show summary metrics
		console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		console.log("📈 SUMMARY");
		console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

		console.log(`⏱️  Duration:        ${(duration / 1000).toFixed(1)}s`);
		console.log(`💰 Total Cost:      $${totalCost.toFixed(4)}`);
		console.log(`🎫 Total Tokens:    ${formatNumber(totalTokens)}`);
		console.log(`📞 API Calls Made:  ${totalCalls}`);
		console.log(`⏭️  API Calls Saved: ${totalSkippedCalls} (spam filtered)`);

		// Calculate savings percentage
		const totalPossibleCalls = totalCalls + totalSkippedCalls;
		const savingsPercent = totalSkippedCalls > 0
			? ((totalSkippedCalls / totalPossibleCalls) * 100).toFixed(0)
			: "0";

		console.log(`🎯 Efficiency Gain: ${savingsPercent}% fewer API calls`);

		console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	}

	// Show workflow explanation
	console.log("\n✨ What just happened?");
	console.log("   1️⃣  Spam Detection");
	console.log(`      • Checked all ${SAMPLE_REVIEWS.length} reviews`);
	console.log(`      • Identified ${spamCount} spam reviews`);
	console.log(`      • Saved ${spamCount * 2} API calls by skipping spam\n`);

	console.log("   2️⃣  Sentiment & Category Analysis");
	console.log(`      • Analyzed ${totalAnalyzed} legitimate reviews`);
	console.log(`      • Ran sentiment + categorize in parallel`);
	console.log(`      • Skipped ${spamCount} spam reviews automatically\n`);

	console.log("   3️⃣  Category Grouping");
	console.log(`      • Grouped reviews into ${categoryAnalyses.length} categories`);
	console.log(`      • Transformed ${SAMPLE_REVIEWS.length} sections → ${categoryAnalyses.length} sections\n`);

	console.log("   4️⃣  Deep Analysis");
	console.log(`      • Analyzed each category for insights`);
	console.log(`      • Generated actionable recommendations\n`);

	console.log("   5️⃣  Executive Summary");
	console.log(`      • Synthesized all findings`);
	console.log(`      • Prioritized top actions\n`);

	console.log("🚀 Key Benefits:");
	console.log("   ✓ Automatic spam filtering saved API costs");
	console.log("   ✓ Parallel execution maximized speed");
	console.log("   ✓ Smart grouping reduced redundancy");
	console.log("   ✓ Full cost tracking with token usage\n");
}