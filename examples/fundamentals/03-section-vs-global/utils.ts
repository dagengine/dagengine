export function printConcept(numReviews: number): void {
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("THE CONCEPT: Section vs Global");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("📦 SECTION DIMENSIONS (default)");
	console.log("   - Run once PER item");
	console.log("   - Execute in PARALLEL");
	console.log("   - Independent analysis");
	console.log("   - Fast, distributed\n");

	console.log("   Example: analyze_sentiment");
	for (let reviewIndex = 1; reviewIndex <= numReviews; reviewIndex++) {
		const prefix = reviewIndex === numReviews ? "└─" : "├─";
		console.log(`   ${prefix} Review ${reviewIndex} → sentiment (parallel)`);
	}
	console.log("");

	console.log("🌍 GLOBAL DIMENSIONS");
	console.log("   - Run once ACROSS ALL items");
	console.log("   - Execute SEQUENTIALLY");
	console.log("   - Cross-item synthesis");
	console.log("   - Aggregation, comparison\n");

	console.log("   Example: overall_analysis");
	console.log(`   └─ All ${numReviews} sentiments → overall (1 call)\n`);

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("EXECUTION FLOW");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("Phase 1: SECTION dimension (parallel)");
	console.log("────────────────────────────────────────");
	console.log(`  analyze_sentiment runs ${numReviews} times`);
	console.log(`  All ${numReviews} run in parallel\n`);

	console.log("Phase 2: GLOBAL dimension (sequential)");
	console.log("────────────────────────────────────────");
	console.log("  overall_analysis runs 1 time");
	console.log(`  Receives ALL ${numReviews} sentiment results\n`);

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}
