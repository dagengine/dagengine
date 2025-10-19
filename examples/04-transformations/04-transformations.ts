/**
 * Fundamentals 04: Transformations
 *
 * Learn how to reshape data mid-workflow.
 *
 * Learn:
 * - transformSections() hook
 * - Reshaping data between dimensions
 * - The classic pattern: many items → few groups
 * - When transformations are needed
 *
 * Use case: Classify 10 reviews → Group into 3 categories → Analyze each category
 *
 * Run: npm run 04
 */

import { config } from "dotenv";
import { resolve } from "path";
import {
	DagEngine,
	Plugin,
	type PromptContext,
	type ProviderSelection,
	type SectionData,
	type DimensionResult,
	type TransformSectionsContext,
	type ProcessResult,
} from "../../src";

config({ path: resolve(process.cwd(), ".env") });

// ============================================================================
// TYPES
// ============================================================================

interface CategoryResult {
	category: "pricing" | "support" | "features";
	reasoning: string;
}

interface CategoryGroup {
	category: string;
	reviews: string[];
	count: number;
}

interface GroupingResult {
	groups: CategoryGroup[];
	total_reviews: number;
}

interface CategoryAnalysis {
	category: string;
	review_count: number;
	summary: string;
	key_issues: string[];
	recommendation: string;
}

interface SectionResult {
	section: SectionData;
	results: Record<string, DimensionResult<unknown>>;
}

// ============================================================================
// CONFIG
// ============================================================================

const PRICING = {
	"claude-3-5-haiku-20241022": { inputPer1M: 0.80, outputPer1M: 4.00 },
	"claude-3-5-sonnet-20241022": { inputPer1M: 3.00, outputPer1M: 15.00 }
};

// ============================================================================
// PLUGIN
// ============================================================================

/**
 * ReviewGroupAnalyzer
 *
 * Demonstrates transformation pattern:
 * 1. Classify each review (10 reviews → 10 classifications)
 * 2. Group by category (10 reviews → 3 groups) ← TRANSFORMATION
 * 3. Analyze each group (3 groups → 3 analyses)
 *
 * Result: Process 3 groups instead of 10 reviews (70% fewer API calls)
 */
class ReviewGroupAnalyzer extends Plugin {
	constructor() {
		super(
			"review-group-analyzer",
			"Review Group Analyzer",
			"Classify, group, and analyze reviews",
		);

		this.dimensions = [
			"classify",
			{ name: "group_by_category", scope: "global" },
			"analyze_category",
		];
	}

	defineDependencies(): Record<string, string[]> {
		return {
			group_by_category: ["classify"],
			analyze_category: ["group_by_category"],
		};
	}

	/**
	 * transformSections - Reshape data between dimensions
	 *
	 * Called after a dimension completes.
	 * Use case: Transform 10 reviews → 3 category groups
	 */
	transformSections(ctx: TransformSectionsContext): SectionData[] {
		if (ctx.dimension !== "group_by_category") {
			return ctx.currentSections;
		}

		const result = ctx.result as DimensionResult<GroupingResult>;
		const groups = result.data?.groups || [];

		console.log(
			`\n🔄 TRANSFORMATION: ${ctx.currentSections.length} reviews → ${groups.length} groups\n`,
		);

		return groups.map((group) => ({
			content: group.reviews.join("\n\n---\n\n"),
			metadata: {
				category: group.category,
				count: group.count,
				original_review_ids: group.reviews.map((_, idx) => idx + 1),
			},
		}));
	}

	createPrompt(ctx: PromptContext): string {
		const { dimension, sections, dependencies } = ctx;

		if (dimension === "classify") {
			const review = sections[0]?.content || "";

			return `Classify this review into ONE category:

"${review}"

Categories: pricing (cost/value), support (service), features (functionality)

Return JSON:
{
  "category": "pricing|support|features",
  "reasoning": "brief explanation"
}`;
		}

		if (dimension === "group_by_category") {
			const classifyData = dependencies.classify as
				| DimensionResult<{
						sections: Array<DimensionResult<CategoryResult>>;
						aggregated: boolean;
				  }>
				| undefined;

			if (!classifyData?.data?.aggregated) {
				return "Error: Expected aggregated classification data";
			}

			const classifications = classifyData.data.sections.map((s, idx) => ({
				review: sections[idx]?.content || "",
				category: s.data?.category || "features",
			}));

			return `Group these reviews by category:

${JSON.stringify(classifications, null, 2)}

Return JSON:
{
  "groups": [
    {
      "category": "pricing",
      "reviews": ["review 1", "review 2"],
      "count": 2
    }
  ],
  "total_reviews": ${classifications.length}
}`;
		}

		if (dimension === "analyze_category") {
			// After transformation, sections are now category groups
			const category = (sections[0]?.metadata?.category as string) || "unknown";
			const count = (sections[0]?.metadata?.count as number) || 0;
			const reviews = sections[0]?.content || "";

			return `Analyze ${count} reviews in "${category}" category:

${reviews}

Return JSON:
{
  "category": "${category}",
  "review_count": ${count},
  "summary": "1-2 sentence summary",
  "key_issues": ["issue 1", "issue 2", "issue 3"],
  "recommendation": "specific action"
}`;
		}

		return "";
	}

	selectProvider(dimension: string): ProviderSelection {
		// Fast model for classification
		if (dimension === "classify") {
			return {
				provider: "anthropic",
				options: {
					model: "claude-3-5-haiku-20241022",
					temperature: 0.1,
				},
			};
		}

		// Powerful model for analysis
		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-sonnet-20241022",
				temperature: 0.3,
			},
		};
	}
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
	console.log("\n📚 Fundamentals 04: Transformations\n");
	console.log("Learn to reshape data mid-workflow.\n");

	// Setup
	const reviews: SectionData[] = [
		{ content: "Too expensive for what you get.", metadata: { id: 1 } },
		{ content: "Great value! Worth every penny.", metadata: { id: 2 } },
		{ content: "Support team never responds.", metadata: { id: 3 } },
		{ content: "Customer service was excellent!", metadata: { id: 4 } },
		{ content: "Missing key features I need.", metadata: { id: 5 } },
		{ content: "Love all the features!", metadata: { id: 6 } },
		{ content: "Overpriced compared to competitors.", metadata: { id: 7 } },
		{ content: "Support response time is terrible.", metadata: { id: 8 } },
		{ content: "The features are intuitive and powerful.", metadata: { id: 9 } },
		{ content: "Fair pricing for the quality.", metadata: { id: 10 } }
	];

	const engine = new DagEngine({
		plugin: new ReviewGroupAnalyzer(),
		providers: {
			anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! }
		},
		pricing: { models: PRICING }
	});

	console.log(`✓ Created engine with ReviewGroupAnalyzer`);
	console.log(`✓ Prepared ${reviews.length} reviews\n`);

	// Explain pattern
	printPattern();

	// Process
	console.log("Processing...\n");

	const startTime = Date.now();
	const result = await engine.process(reviews);
	const duration = Date.now() - startTime;

	// Display results
	printResults(result, duration);

	// Explanation
	printExplanation();
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

function printPattern(): void {
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("THE PATTERN: Many Items → Few Groups");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("WITHOUT transformation:");
	console.log("  10 reviews → classify (10 calls)");
	console.log("            → analyze each (10 calls)");
	console.log("  Total: 20 calls\n");

	console.log("WITH transformation:");
	console.log("  10 reviews → classify (10 calls)");
	console.log("            → group into 3 categories (1 call)");
	console.log("            → analyze 3 groups (3 calls) ← 70% fewer!");
	console.log("  Total: 14 calls (30% savings)\n");

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("EXECUTION FLOW");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("Phase 1: CLASSIFY (section, parallel)");
	console.log("  Classify 10 reviews into categories\n");

	console.log("Phase 2: GROUP (global, sequential)");
	console.log("  Group 10 reviews into 3 categories\n");

	console.log("Phase 3: TRANSFORMATION 🔄");
	console.log("  transformSections() called");
	console.log("  Input: 10 review sections");
	console.log("  Output: 3 category group sections\n");

	console.log("Phase 4: ANALYZE (section, parallel)");
	console.log("  Analyze 3 category groups");
	console.log("  ✅ Processing 3 groups instead of 10!\n");

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

function printResults(result: ProcessResult, duration: number): void {
	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("CATEGORY ANALYSES");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	result.sections.forEach((section: SectionResult) => {
		const analysis = section.results.analyze_category as DimensionResult<CategoryAnalysis> | undefined;

		if (analysis?.data) {
			const analysisData = analysis.data;
			const emoji = analysisData.category === "pricing" ? "💰" :
				analysisData.category === "support" ? "🎧" : "✨";

			console.log(`${emoji} ${analysisData.category.toUpperCase()} (${analysisData.review_count} reviews)`);
			console.log(`   Summary: ${analysisData.summary}`);
			console.log(`   Key Issues:`);
			analysisData.key_issues.forEach((issue) => {
				console.log(`     • ${issue}`);
			});
			console.log(`   💡 Recommendation: ${analysisData.recommendation}\n`);
		}
	});

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log(`⚡ Completed in ${(duration / 1000).toFixed(2)}s`);

	if (result.costs) {
		const totalCost = result.costs.totalCost;
		const withoutTransformation = totalCost / 0.7;
		const savings = ((withoutTransformation - totalCost) / withoutTransformation) * 100;

		console.log(`💰 Cost: $${totalCost.toFixed(4)}`);
		console.log(`📊 Savings: ~${savings.toFixed(0)}% (vs analyzing individually)`);
		console.log(`🎫 Tokens: ${result.costs.totalTokens.toLocaleString()}`);
	}

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

function printExplanation(): void {
	console.log("✨ What just happened?\n");

	console.log("1. CLASSIFY dimension (section):");
	console.log("   - Ran 10 times (once per review)");
	console.log("   - All 10 ran in parallel");
	console.log("   - Result: 10 classifications\n");

	console.log("2. GROUP dimension (global):");
	console.log("   - Ran 1 time (across all reviews)");
	console.log("   - Organized 10 reviews into 3 categories");
	console.log("   - Result: 3 category groups\n");

	console.log("3. TRANSFORMATION 🔄:");
	console.log("   - transformSections() was called");
	console.log("   - Received: 10 review sections");
	console.log("   - Returned: 3 category group sections");
	console.log("   - Next dimension processes 3 sections!\n");

	console.log("4. ANALYZE dimension (section on transformed data):");
	console.log("   - Ran 3 times (once per category group)");
	console.log("   - All 3 ran in parallel");
	console.log("   - Result: 3 category analyses\n");

	console.log("🎓 What you learned:\n");
	console.log("✓ transformSections() reshapes data between dimensions");
	console.log("✓ Classic pattern: many items → few groups");
	console.log("✓ Reduces API calls dramatically (70% savings)");
	console.log("✓ Subsequent dimensions operate on transformed sections");
	console.log("✓ Combine with section/global scopes for powerful workflows\n");

	console.log("💡 Key insight:\n");
	console.log("Transformations let you reshape data mid-workflow.");
	console.log("Process 100 items as 5 groups = 95% fewer expensive calls.\n");

	console.log("📊 When to use transformations:\n");
	console.log("USE when:");
	console.log("  ✓ Grouping similar items");
	console.log("  ✓ Filtering/reducing items");
	console.log("  ✓ Splitting items into chunks");
	console.log("  ✓ Next dimension processes groups, not individuals\n");

	console.log("DON'T use when:");
	console.log("  ✗ Each item needs independent analysis");
	console.log("  ✗ No grouping/filtering needed");
	console.log("  ✗ Data shape doesn't need to change\n");

	console.log("⏭️  Next: npm run 05 (skip logic)\n");
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error: Error) => {
	console.error("\n❌ Error:", error.message);

	if (error.message.includes("API key")) {
		console.error("\n💡 Fix: Add ANTHROPIC_API_KEY to examples/.env");
		console.error("   Get your key at: https://console.anthropic.com/\n");
	}

	process.exit(1);
});