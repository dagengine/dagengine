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
 * Run: npm run 02
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
	type ProcessResult,
} from "@dagengine/core";

import { printExecutionPlan } from './utils.js'

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

interface SectionResult {
	section: SectionData;
	results: Record<string, DimensionResult<unknown>>;
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

		this.dimensions = ["sentiment", "topics", "summary"];
	}

	/**
	 * Define which dimensions depend on which
	 */
	defineDependencies(): Record<string, string[]> {
		return {
			summary: ["sentiment", "topics"]
		};
	}

	/**
	 * Create prompts for each dimension
	 */
	createPrompt(ctx: PromptContext): string {
		const { dimension, sections, dependencies } = ctx;
		const text = sections[0]?.content || "";

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

		if (dimension === "topics") {
			return `Extract the main topics from this text:

"${text}"

Return JSON:
{
  "topics": ["topic1", "topic2", "topic3"],
  "main_topic": "the most important topic"
}`;
		}

		if (dimension === "summary") {
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
	 * Choose AI provider
	 */
	selectProvider(): ProviderSelection {
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

	// Setup
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

	// Execution plan
	printExecutionPlan();

	// Process
	console.log("Processing...\n");

	const startTime = Date.now();
	const result = await engine.process(sections);
	const duration = Date.now() - startTime;

	// Display results
	printResults(result, duration);
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

function printResults(result: ProcessResult, duration: number): void {
	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("RESULTS");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	result.sections.forEach((sectionResult: SectionResult, sectionIndex: number) => {
		console.log(`Section ${sectionIndex + 1}:`);
		console.log(`"${sectionResult.section.content.slice(0, 60)}..."\n`);

		// Sentiment
		const sentiment = sectionResult.results.sentiment as DimensionResult<SentimentResult> | undefined;
		if (sentiment?.data) {
			const sentimentData = sentiment.data;
			console.log(`  📊 Sentiment: ${sentimentData.sentiment} (${sentimentData.score.toFixed(2)})`);
			console.log(`     └─ ${sentimentData.reasoning}`);
		}

		// Topics
		const topics = sectionResult.results.topics as DimensionResult<TopicsResult> | undefined;
		if (topics?.data) {
			const topicsData = topics.data;
			console.log(`  🏷️  Topics: ${topicsData.topics.join(", ")}`);
			console.log(`     └─ Main: ${topicsData.main_topic}`);
		}

		// Summary
		const summary = sectionResult.results.summary as DimensionResult<SummaryResult> | undefined;
		if (summary?.data) {
			const summaryData = summary.data;
			console.log(`  📝 Summary: ${summaryData.summary}`);
			console.log(`     └─ Tone: ${summaryData.tone} | Words: ${summaryData.word_count}`);
		}

		console.log("");
	});

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log(`⚡ Completed in ${(duration / 1000).toFixed(2)}s`);

	if (result.costs) {
		console.log(`💰 Cost: $${result.costs.totalCost.toFixed(4)}`);
	}

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
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