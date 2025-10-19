/**
 * Fundamentals 02: Dependencies
 *
 * Learn how dependencies create automatic parallelization.
 *
 * Learn:
 * - Multiple dimensions
 * - defineDependencies() method
 * - Automatic parallel execution
 * - Accessing dependency results in prompts
 *
 * Run: npm run guide:02
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
} from "../../src/index.js";

config({ path: resolve(process.cwd(), ".env") });

// ============================================================================
// TYPES
// ============================================================================

interface SentimentResult {
	sentiment: "positive" | "negative" | "neutral";
	score: number;
	reasoning: string;
}

interface TopicsResult {
	topics: string[];
	main_topic: string;
}

interface SummaryResult {
	summary: string;
	tone: string;
	word_count: number;
}

// ============================================================================
// PLUGIN
// ============================================================================

/**
 * TextAnalyzer
 *
 * Analyzes text with THREE dimensions:
 * 1. sentiment - Analyze sentiment (independent)
 * 2. topics - Extract topics (independent)
 * 3. summary - Summarize using sentiment + topics (dependent)
 *
 * Dependencies create automatic parallelization:
 * - sentiment and topics run IN PARALLEL
 * - summary waits for BOTH to complete
 * - summary receives BOTH results automatically
 */
class TextAnalyzer extends Plugin {
	constructor() {
		super(
			"text-analyzer",
			"Text Analyzer",
			"Analyze sentiment, topics, and create summary"
		);

		// ✅ THREE DIMENSIONS (tasks)
		this.dimensions = [
			"sentiment",   // Task 1: Analyze sentiment
			"topics",      // Task 2: Extract topics
			"summary"      // Task 3: Create summary (needs 1 + 2)
		];
	}

	/**
	 * ✅ NEW METHOD: defineDependencies
	 *
	 * This method tells dag-ai which dimensions depend on which.
	 *
	 * Result: dag-ai automatically:
	 * 1. Runs independent tasks in parallel
	 * 2. Waits for dependencies to complete
	 * 3. Passes dependency results to dependent tasks
	 *
	 * @returns Dependency mapping
	 */
	defineDependencies(): Record<string, string[]> {
		return {
			// "summary" needs BOTH "sentiment" AND "topics"
			summary: ["sentiment", "topics"]
		};

		// Note: sentiment and topics have NO dependencies
		// So they run in parallel automatically!
	}

	/**
	 * createPrompt - Create prompts for each dimension
	 *
	 * Note: For "summary", we can access sentiment and topics results
	 * via ctx.dependencies
	 */
	createPrompt(ctx: PromptContext): string {
		const { dimension, sections, dependencies } = ctx;
		const text = sections[0]?.content || "";

		// ============================================================================
		// DIMENSION 1: sentiment (independent)
		// ============================================================================

		if (dimension === "sentiment") {
			return `Analyze the sentiment of this text:

"${text}"

Return JSON:
{
  "sentiment": "positive" or "negative" or "neutral",
  "score": 0.0-1.0,
  "reasoning": "brief explanation"
}`;
		}

		// ============================================================================
		// DIMENSION 2: topics (independent)
		// ============================================================================

		if (dimension === "topics") {
			return `Extract the main topics from this text:

"${text}"

Return JSON:
{
  "topics": ["topic1", "topic2", "topic3"],
  "main_topic": "the most important topic"
}`;
		}

		// ============================================================================
		// DIMENSION 3: summary (dependent on sentiment + topics)
		// ============================================================================

		if (dimension === "summary") {
			// ✅ Access dependency results
			const sentimentResult = dependencies.sentiment as DimensionResult<SentimentResult> | undefined;
			const topicsResult = dependencies.topics as DimensionResult<TopicsResult> | undefined;

			const sentiment = sentimentResult?.data?.sentiment || "unknown";
			const topics = topicsResult?.data?.topics || [];

			return `Create a brief summary of this text:

"${text}"

Use this analysis:
- Sentiment: ${sentiment}
- Topics: ${topics.join(", ")}

Return JSON:
{
  "summary": "1-2 sentence summary",
  "tone": "describe the tone",
  "word_count": number of words in original text
}`;
		}

		return "";
	}

	/**
	 * selectProvider - Choose AI provider
	 *
	 * Using same model for all dimensions (keep it simple)
	 */
	selectProvider(dimension: string): ProviderSelection {
		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-haiku-20241022",
				temperature: 0.2
			}
		};
	}
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
	console.log("\n📚 Fundamentals 02: Dependencies\n");
	console.log("Learn automatic parallelization through dependencies.\n");

	// ============================================================================
	// SETUP
	// ============================================================================

	console.log("Setting up...");

	const engine = new DagEngine({
		plugin: new TextAnalyzer(),
		providers: {
			anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! }
		}
	});

	const sections: SectionData[] = [
		{
			content: "This product is absolutely amazing! Best purchase I've made all year. The quality exceeded my expectations and customer service was fantastic.",
			metadata: { id: 1 }
		},
		{
			content: "Terrible experience. The product broke after one week and support never responded to my emails. Complete waste of money.",
			metadata: { id: 2 }
		}
	];

	console.log(`✓ Created engine with TextAnalyzer plugin`);
	console.log(`✓ Prepared ${sections.length} text sections\n`);

	// ============================================================================
	// EXPLAIN EXECUTION PLAN
	// ============================================================================

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("EXECUTION PLAN");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("Dependencies defined:");
	console.log("  summary → [sentiment, topics]\n");

	console.log("dag-ai will automatically:");
	console.log("  1. Run sentiment + topics IN PARALLEL (no dependencies)");
	console.log("  2. Wait for BOTH to complete");
	console.log("  3. Run summary (using sentiment + topics results)\n");

	console.log("Execution timeline:");
	console.log("  0s ─┬─ sentiment (section 1) ────┐");
	console.log("      ├─ topics (section 1) ────────┤");
	console.log("      ├─ sentiment (section 2) ──────┤");
	console.log("      └─ topics (section 2) ─────────┤");
	console.log("  2s                                 ├─→ All complete");
	console.log("      ┌─ summary (section 1) ───────┤");
	console.log("      └─ summary (section 2) ────────┘");
	console.log("  3s                                 ─→ Done\n");

	console.log("Total time: ~3 seconds (vs ~6s sequential)\n");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	// ============================================================================
	// PROCESS
	// ============================================================================

	console.log("Processing...\n");

	const startTime = Date.now();
	const result = await engine.process(sections);
	const duration = Date.now() - startTime;

	// ============================================================================
	// DISPLAY RESULTS
	// ============================================================================

	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("RESULTS");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	result.sections.forEach((section, idx) => {
		console.log(`Section ${idx + 1}:`);
		console.log(`"${section.section.content.slice(0, 60)}..."\n`);

		// Sentiment
		const sentimentResult = section.results.sentiment as DimensionResult<SentimentResult> | undefined;
		if (sentimentResult?.data) {
			const s = sentimentResult.data;
			console.log(`  📊 Sentiment: ${s.sentiment} (${s.score.toFixed(2)})`);
			console.log(`     └─ ${s.reasoning}`);
		}

		// Topics
		const topicsResult = section.results.topics as DimensionResult<TopicsResult> | undefined;
		if (topicsResult?.data) {
			const t = topicsResult.data;
			console.log(`  🏷️  Topics: ${t.topics.join(", ")}`);
			console.log(`     └─ Main: ${t.main_topic}`);
		}

		// Summary
		const summaryResult = section.results.summary as DimensionResult<SummaryResult> | undefined;
		if (summaryResult?.data) {
			const s = summaryResult.data;
			console.log(`  📝 Summary: ${s.summary}`);
			console.log(`     └─ Tone: ${s.tone} | Words: ${s.word_count}`);
		}

		console.log("");
	});

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log(`⚡ Completed in ${(duration / 1000).toFixed(2)}s`);

	if (result.costs) {
		console.log(`💰 Cost: $${result.costs.totalCost.toFixed(4)}`);
	}

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	// ============================================================================
	// EXPLANATION
	// ============================================================================

	console.log("✨ What just happened?\n");

	console.log("1. Plugin defined 3 dimensions:");
	console.log("   - sentiment (independent)");
	console.log("   - topics (independent)");
	console.log("   - summary (depends on sentiment + topics)\n");

	console.log("2. dag-ai analyzed the dependencies:");
	console.log("   - sentiment and topics have NO dependencies");
	console.log("   - summary depends on BOTH sentiment and topics\n");

	console.log("3. dag-ai created execution groups:");
	console.log("   - Group 1 (parallel): sentiment, topics");
	console.log("   - Group 2 (sequential): summary\n");

	console.log("4. For each section:");
	console.log("   - Ran sentiment + topics in parallel (~2s)");
	console.log("   - Waited for both to complete");
	console.log("   - Ran summary with access to both results (~1s)\n");

	console.log("5. Total time: ~3s (vs ~6s if sequential)\n");

	console.log("🎓 What you learned:\n");
	console.log("✓ Multiple dimensions in one plugin");
	console.log("✓ defineDependencies() creates execution order");
	console.log("✓ Independent tasks run in parallel automatically");
	console.log("✓ Dependent tasks receive results via ctx.dependencies");
	console.log("✓ No manual parallelization code needed\n");

	console.log("💡 Key insight:\n");
	console.log("Dependencies are HOW you control execution order.");
	console.log("dag-ai figures out parallelization automatically.\n");

	console.log("⏭️  Next: npm run guide:03 (section vs global)\n");
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