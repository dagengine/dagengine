/**
 * Fundamentals 08: Error Handling
 *
 * Demonstrates graceful error handling with fallback results.
 *
 * Run: npm run 08
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
	type FailureContext
} from "@dagengine/core";

config({ path: resolve(process.cwd(), ".env") });

interface AnalysisResult {
	sentiment: "positive" | "negative" | "neutral";
	confidence: number;
	fallback?: boolean;
}

class ErrorHandlingPlugin extends Plugin {
	private errorCount: number = 0;
	private fallbackCount: number = 0;

	constructor() {
		super(
			"error-handling",
			"Error Handling Plugin",
			"Graceful error recovery"
		);

		this.dimensions = ["analyze", "detailed"];
	}

	defineDependencies(): Record<string, string[]> {
		return {
			detailed: ["analyze"]
		};
	}

	async handleDimensionFailure(
		context: FailureContext
	): Promise<DimensionResult<AnalysisResult> | void> {
		this.errorCount++;

		console.log(`\n❌ Dimension "${context.dimension}" failed`);
		console.log(`   Error: ${context.error.message}`);
		console.log(`   Providing fallback result...\n`);

		this.fallbackCount++;

		return {
			data: {
				sentiment: "neutral",
				confidence: 0.0,
				fallback: true
			},
			metadata: {
				fallback: true,
				originalError: context.error.message
			}
		};
	}

	createPrompt(context: PromptContext): string {
		const content = context.sections[0]?.content || "";

		if (context.dimension === "analyze") {
			return `Analyze sentiment: "${content}"

Return JSON:
{
  "sentiment": "positive" or "negative" or "neutral",
  "confidence": 0.0-1.0
}`;
		}

		const analysis = context.dependencies.analyze?.data as AnalysisResult | undefined;

		return `Given sentiment is ${analysis?.sentiment}, provide detailed analysis: "${content}"

Return JSON:
{
  "sentiment": "positive" or "negative" or "neutral",
  "confidence": 0.0-1.0
}`;
	}

	selectProvider(dimension: string): ProviderSelection {
		if (dimension === "detailed") {
			return {
				provider: "anthropic",
				options: {
					model: "claude-3-5-invalid",
					temperature: 0.2,
				}
			};
		}

		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-haiku-20241022",
				temperature: 0.2
			}
		};
	}

	getStats() {
		return {
			errorCount: this.errorCount,
			fallbackCount: this.fallbackCount
		};
	}
}

async function main(): Promise<void> {
	console.log("\n📚 Fundamentals 08: Error Handling\n");
	console.log("Demonstrating graceful error recovery with fallback results.\n");

	const sections: SectionData[] = [
		{ content: "Great product! Love it.", metadata: { id: 1 } },
		{ content: "Terrible experience.", metadata: { id: 2 } },
		{ content: "It's okay, nothing special.", metadata: { id: 3 } }
	];

	const plugin = new ErrorHandlingPlugin();

	const engine = new DagEngine({
		plugin,
		providers: {
			anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! }
		},
		pricing: {
			models: {
				"claude-3-5-haiku-20241022": { inputPer1M: 0.80, outputPer1M: 4.00 }
			}
		},
		continueOnError: true
	});

	console.log("Processing 3 sections...");
	console.log("Note: 'detailed' dimension uses max_tokens: 1 (will fail)\n");
	console.log("═".repeat(60) + "\n");

	const startTime = Date.now();
	const result = await engine.process(sections);
	const duration = Date.now() - startTime;

	console.log("═".repeat(60) + "\n");

	displayResults(result, duration, plugin.getStats());
}

function displayResults(
	result: ProcessResult,
	duration: number,
	stats: { errorCount: number; fallbackCount: number }
): void {
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("RESULTS");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	let successCount = 0;
	let fallbackCount = 0;

	result.sections.forEach((sectionResult, index) => {
		const content = sectionResult.section.content;
		const analyze = sectionResult.results.analyze as DimensionResult<AnalysisResult> | undefined;
		const detailed = sectionResult.results.detailed as DimensionResult<AnalysisResult> | undefined;

		console.log(`${index + 1}. "${content}"`);

		if (analyze?.data) {
			if (analyze.data.fallback) {
				console.log(`   📊 analyze: ${analyze.data.sentiment} (fallback)`);
				fallbackCount++;
			} else {
				console.log(`   📊 analyze: ${analyze.data.sentiment} (${analyze.data.confidence.toFixed(2)})`);
				successCount++;
			}
		}

		if (detailed?.data) {
			if (detailed.data.fallback) {
				console.log(`   📊 detailed: ${detailed.data.sentiment} (fallback)`);
				fallbackCount++;
			} else {
				console.log(`   📊 detailed: ${detailed.data.sentiment} (${detailed.data.confidence.toFixed(2)})`);
				successCount++;
			}
		}

		console.log("");
	});

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("SUMMARY");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log(`✅ Successful: ${successCount}`);
	console.log(`🔄 Fallbacks: ${fallbackCount}`);
	console.log(`❌ Errors Handled: ${stats.errorCount}`);
	console.log(`⚡ Duration: ${(duration / 1000).toFixed(2)}s`);

	if (result.costs) {
		console.log(`💰 Cost: $${result.costs.totalCost.toFixed(4)}`);
		console.log(`🎫 Tokens: ${result.costs.totalTokens.toLocaleString()}`);
	}

	console.log("");
}

main().catch((error: Error) => {
	console.error("\n❌ Error:", error.message);
	process.exit(1);
});