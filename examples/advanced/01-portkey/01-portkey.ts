/**
 * Advanced 01: Portkey Gateway - Parallel Request / Rate Limitations Handling
 *
 * Simple demonstration of handling 100+ parallel requests with Portkey.
 *
 * Learn:
 * - Process 150 emails in parallel with smart rate limit handling
 * - Automatic retries on failures
 * - Real-time throughput tracking
 * - Cost analysis at scale
 *
 * Pattern: Gateway → Parallel Processing → Smart Retry
 *
 * Run: npm run 10-scale
 */

import { config } from "dotenv";
import { resolve } from "path";
import {
	DagEngine,
	Plugin,
	type PromptContext,
	type ProviderSelection,
	type DimensionResult,
	type ProcessResult,
} from "@dagengine/core";
import { generateEmails, displayEmailStats } from "./email-generator";

config({ path: resolve(process.cwd(), ".env") });

// ============================================================================
// TYPES
// ============================================================================

interface EmailAnalysis {
	category: "spam" | "work" | "personal" | "newsletter";
	confidence: number;
	summary: string;
}

// ============================================================================
// CONFIG
// ============================================================================

const PRICING = {
	"claude-3-5-haiku-20241022": { inputPer1M: 0.80, outputPer1M: 4.00 },
};

// ============================================================================
// PLUGIN
// ============================================================================

/**
 * Simple Email Analyzer - One dimension, many parallel requests
 */
class EmailAnalyzer extends Plugin {
	constructor() {
		super(
			"simple-email-analyzer",
			"Simple Email Analyzer",
			"Fast parallel email analysis with Portkey"
		);

		this.dimensions = ["analyze_email"];
	}

	createPrompt(ctx: PromptContext): string {
		const email = ctx.sections[0]!;

		return `Analyze this email quickly and categorize it.

Email: ${email.content}

Return ONLY valid JSON (no markdown):
{
  "category": "spam" | "work" | "personal" | "newsletter",
  "confidence": 0.95,
  "summary": "Brief one-line summary"
}`;
	}

	selectProvider(_dimension: string): ProviderSelection {
		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-haiku-20241022",
				temperature: 0.1,
				max_tokens: 150
			}
		};
	}
}

// ============================================================================
// PORTKEY CONFIGURATION
// ============================================================================

const PORTKEY_CONFIG = {
	anthropic: {
		apiKey: process.env.ANTHROPIC_API_KEY!,
		gateway: "portkey",
		gatewayApiKey: process.env.PORTKEY_API_KEY!,
		gatewayConfig: {
			// Automatic retry on failures
			retry: {
				attempts: 5,
				on_status_codes: [429, 500, 502, 503, 504],
			}
		}
	}
};

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
	const EMAIL_COUNT = 100;
	const CONCURRENCY = 100; // 100 parallel requests - all at once!

	console.log("\n" + "=".repeat(70));
	console.log("🚀 PORTKEY: PARALLEL REQUEST HANDLING DEMO");
	console.log("=".repeat(70) + "\n");

	console.log("📊 Test Configuration:");
	console.log(`   Total Emails: ${EMAIL_COUNT}`);
	console.log(`   Parallel Requests: ${CONCURRENCY} concurrent`);
	console.log(`   Provider: Anthropic Claude Haiku`);
	console.log(`   Gateway: Portkey with smart retries`);
	console.log(`   Retry Strategy: Up to 5 attempts on errors\n`);

	// Generate test data
	console.log("📧 Generating test emails...");
	const emails = generateEmails(EMAIL_COUNT);
	displayEmailStats(emails);
	console.log("");

	// Create engine
	const engine = new DagEngine({
		plugin: new EmailAnalyzer(),
		providers: PORTKEY_CONFIG,
		execution: {
			concurrency: CONCURRENCY,
			maxRetries: 3,
			continueOnError: true,
			retryDelay: 1000
		},
		pricing: { models: PRICING },
		progressDisplay: {
			display: "bar",
		}
	});

	// Process emails
	console.log(`⚡ Processing ${EMAIL_COUNT} emails with ${CONCURRENCY} parallel requests...\n`);

	const startTime = Date.now();
	let lastProgressUpdate = 0;

	const result = await engine.process(emails, {
		onProgress: (progress) => {
			// Update every 500ms to show real-time metrics
			const now = Date.now();
			if (now - lastProgressUpdate < 500) return;
			lastProgressUpdate = now;

			const elapsed = (now - startTime) / 1000;
			const throughput = progress.completed / elapsed;

			// Clear line and show live stats
			process.stdout.write('\r\x1b[K'); // Clear current line
			process.stdout.write(
				`📊 Progress: ${progress.completed}/${progress.total} ` +
				`(${progress.percent.toFixed(0)}%) | ` +
				`${throughput.toFixed(1)} req/s | ` +
				`$${progress.cost.toFixed(4)} | ` +
				`ETA: ${Math.ceil(progress.etaSeconds)}s`
			);
		},
		onDimensionComplete: (dim, res) => {
			const elapsed = Date.now() - startTime;
			if (!res.error) {
				const rps = (EMAIL_COUNT / (elapsed / 1000)).toFixed(1);
				console.log(`\n\n✅ Completed in ${(elapsed / 1000).toFixed(2)}s`);
				console.log(`📊 Throughput: ${rps} requests/second`);
			}
		}
	});

	const totalDuration = Date.now() - startTime;

	displayResults(result, totalDuration, EMAIL_COUNT);
}

// ============================================================================
// DISPLAY
// ============================================================================

function displayResults(
	result: ProcessResult,
	duration: number,
	emailCount: number
): void {
	console.log("\n" + "=".repeat(70));
	console.log("📊 RESULTS");
	console.log("=".repeat(70) + "\n");

	// Performance metrics
	const throughput = emailCount / (duration / 1000);
	const avgTime = duration / emailCount;

	console.log("⚡ Performance:");
	console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
	console.log(`   Emails Processed: ${emailCount}`);
	console.log(`   Throughput: ${throughput.toFixed(1)} emails/second`);
	console.log(`   Avg Time per Email: ${avgTime.toFixed(0)}ms\n`);

	// Success rate
	const successCount = result.sections.filter(s =>
		s.results.analyze_email?.data
	).length;
	const successRate = (successCount / emailCount) * 100;

	console.log("✅ Success Rate:");
	console.log(`   Successful: ${successCount}/${emailCount} (${successRate.toFixed(1)}%)`);
	if (successCount < emailCount) {
		console.log(`   Failed: ${emailCount - successCount} (retries exhausted)\n`);
	} else {
		console.log("");
	}

	// Category breakdown
	const categories: Record<string, number> = {};
	result.sections.forEach(s => {
		const analysis = s.results.analyze_email as DimensionResult<EmailAnalysis> | undefined;
		if (analysis?.data?.category) {
			categories[analysis.data.category] = (categories[analysis.data.category] || 0) + 1;
		}
	});

	if (Object.keys(categories).length > 0) {
		console.log("📂 Categories Detected:");
		Object.entries(categories)
			.sort(([, a], [, b]) => b - a)
			.forEach(([category, count]) => {
				const pct = ((count / successCount) * 100).toFixed(1);
				console.log(`   ${category}: ${count} (${pct}%)`);
			});
		console.log("");
	}

	// Cost analysis
	if (result.costs) {
		console.log("=".repeat(70));
		console.log("💰 COST ANALYSIS");
		console.log("=".repeat(70) + "\n");

		const totalCost = result.costs.totalCost;
		const costPer1k = (totalCost / emailCount) * 1000;
		const costPer1M = (totalCost / emailCount) * 1_000_000;

		console.log("📊 Cost Breakdown:");
		console.log(`   Total Cost: $${totalCost.toFixed(4)}`);
		console.log(`   Cost per Email: $${(totalCost / emailCount).toFixed(6)}`);
		console.log(`   Cost per 1K emails: $${costPer1k.toFixed(2)}`);
		console.log(`   Cost per 1M emails: $${costPer1M.toFixed(2)}\n`);

		if (result.costs.byDimension.analyze_email) {
			const data = result.costs.byDimension.analyze_email;
			console.log("Token Usage:");
			console.log(`   Total Tokens: ${data.tokens.totalTokens.toLocaleString()}`);
			console.log(`   Input Tokens: ${data.tokens.inputTokens.toLocaleString()}`);
			console.log(`   Output Tokens: ${data.tokens.outputTokens.toLocaleString()}`);
			console.log(`   Avg Tokens/Email: ${Math.round(data.tokens.totalTokens / emailCount)}\n`);
		}
	}

	// Summary
	console.log("=".repeat(70));
	console.log("🎯 KEY TAKEAWAYS");
	console.log("=".repeat(70) + "\n");

	console.log(`✓ Processed ${emailCount} emails in parallel`);
	console.log(`✓ ${throughput.toFixed(1)} requests per second throughput`);
	console.log(`✓ ${successRate.toFixed(1)}% success rate`);
	console.log("✓ Automatic retry handling on failures");
	console.log("✓ Smart rate limit protection");
	console.log("✓ Real-time cost tracking\n");

	console.log("📊 View detailed logs in Portkey:");
	console.log("   https://app.portkey.ai/logs\n");
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error: Error) => {
	console.error("\n❌ Error:", error.message);

	if (error.message.includes("Portkey API key")) {
		console.error("\n💡 Get your Portkey API key at: https://app.portkey.ai/api-keys");
	}

	if (error.message.includes("ANTHROPIC_API_KEY")) {
		console.error("\n💡 Set your Anthropic API key: export ANTHROPIC_API_KEY=your-key");
	}

	process.exit(1);
});