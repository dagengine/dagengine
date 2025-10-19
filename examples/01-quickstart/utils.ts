import type { DimensionResult, ProcessResult } from "../../src";
import type { CategoryAnalysis, ExecutiveSummary, SpamCheckResult } from "./types";
import { SAMPLE_REVIEWS } from "./data";

// ============================================================================
// HELPERS
// ============================================================================

function getEmoji(impact: "high" | "medium" | "low"): string {
	const emojiMap: Record<"high" | "medium" | "low", string> = {
		high: "🔴",
		medium: "🟡",
		low: "🟢"
	};
	return emojiMap[impact];
}

function calculateSavings(total: number, skipped: number): number {
	if (total === 0) return 0;
	return (skipped / total) * 100;
}

export function displayResults(result: ProcessResult, duration: number): void {
	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("📊 ANALYSIS RESULTS");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	// Count spam filtered
	const spamCount = result.sections.filter((s) => {
		const spamResult = s.results.filter_spam as DimensionResult<SpamCheckResult> | undefined;
		return spamResult?.data?.is_spam === true;
	}).length;

	console.log(`✓ Filtered ${spamCount} spam reviews\n`);

	// Show category analyses
	const categoryAnalyses = result.sections
		.filter((s) => s.results.analyze_category)
		.map((s) => {
			const analysisResult = s.results.analyze_category as DimensionResult<CategoryAnalysis>;
			return analysisResult?.data;
		})
		.filter((data): data is CategoryAnalysis => data !== undefined);

	categoryAnalyses.forEach((analysis) => {
		const emoji = getEmoji(analysis.impact);
		console.log(`${emoji} ${analysis.category.toUpperCase()}`);
		console.log(`├─ Insight: ${analysis.key_insight}`);
		console.log(`├─ Action: ${analysis.recommendation}`);
		console.log(`├─ Impact: ${analysis.impact}`);
		console.log(`└─ Quote: "${analysis.top_quote}"\n`);
	});

	// Show executive summary
	const summaryResult = result.globalResults.executive_summary as DimensionResult<ExecutiveSummary> | undefined;
	const summary = summaryResult?.data;

	if (summary) {
		console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		console.log("📋 EXECUTIVE SUMMARY");
		console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
		console.log(summary.summary);
		console.log("\n🎯 Top Priorities:");
		summary.top_priorities.forEach((p, i) => {
			console.log(`   ${i + 1}. ${p}`);
		});
		console.log(`\n💰 Estimated Impact: ${summary.estimated_impact}`);
	}

	// Show metrics
	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	if (result.costs) {
		const totalCost = result.costs.totalCost;
		const savings = calculateSavings(SAMPLE_REVIEWS.length, spamCount);

		console.log(`⚡ ${(duration / 1000).toFixed(1)}s | 💰 $${totalCost.toFixed(4)} | 🎯 ${Math.round(savings)}% cost savings`);
	}
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("✨ What just happened?");
	console.log("   ✓ Filtered spam automatically (saved API calls)");
	console.log("   ✓ Analyzed sentiment + categories in parallel");
	console.log("   ✓ Grouped reviews by category");
	console.log("   ✓ Deep-analyzed each category");
	console.log("   ✓ Generated executive summary\n");

	console.log("📚 Next steps:");
	console.log("   → Learn structure: npm run 01");
	console.log("   → See dependencies: npm run 02");
	console.log("   → Try with your data: npm run 00 -- --help\n");
}
