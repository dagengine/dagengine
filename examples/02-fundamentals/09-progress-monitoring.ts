/**
 * Fundamentals 09: Progress Monitoring & Analytics
 *
 * Learn how to track and monitor workflow execution.
 *
 * Learn:
 * - Progress display configuration
 * - Real-time progress tracking
 * - Cost tracking during execution
 * - Execution analytics (critical path, bottlenecks)
 * - Custom progress callbacks
 * - Performance optimization insights
 *
 * Critical for:
 * - Long-running workflows
 * - User experience (show progress)
 * - Performance debugging
 * - Cost monitoring
 *
 * Run: npm run guide:09
 */

import { config } from "dotenv";
import { resolve } from "path";
import {
	DagEngine,
	Plugin,
	type PromptContext,
	type ProviderSelection,
	type SectionData,
} from "../../../src/index.js";

config({ path: resolve(process.cwd(), ".env") });

// ============================================================================
// TYPES
// ============================================================================

interface SentimentResult {
	sentiment: string;
	score: number;
}

interface TopicsResult {
	topics: string[];
}

interface SummaryResult {
	summary: string;
}

// ============================================================================
// CUSTOM PROGRESS TRACKER
// ============================================================================

/**
 * Custom progress tracking for advanced monitoring
 */
class ProgressTracker {
	private startTime: number = Date.now();
	private dimensionTimes: Map<string, number> = new Map();
	private dimensionCosts: Map<string, number> = new Map();
	private completedSections: number = 0;
	private totalSections: number = 0;

	start(totalSections: number): void {
		this.startTime = Date.now();
		this.totalSections = totalSections;
		console.log(`\n📊 Progress Tracking Started`);
		console.log(`   Total sections: ${totalSections}\n`);
	}

	onDimensionStart(dimension: string, sectionId: number): void {
		console.log(`   ⚙️  [${dimension}] Processing section ${sectionId}...`);
	}

	onDimensionComplete(dimension: string, sectionId: number, duration: number, cost: number): void {
		// Track dimension timing
		const currentTime = this.dimensionTimes.get(dimension) || 0;
		this.dimensionTimes.set(dimension, currentTime + duration);

		// Track dimension cost
		const currentCost = this.dimensionCosts.get(dimension) || 0;
		this.dimensionCosts.set(dimension, currentCost + cost);

		this.completedSections++;

		const progress = (this.completedSections / this.totalSections) * 100;
		console.log(`   ✓ [${dimension}] Section ${sectionId} complete (${duration.toFixed(0)}ms, $${cost.toFixed(4)})`);
		console.log(`   Progress: ${progress.toFixed(1)}%\n`);
	}

	getSummary(): {
		totalTime: number;
		dimensionTimes: Record<string, number>;
		dimensionCosts: Record<string, number>;
		avgTimePerSection: number;
	} {
		const totalTime = Date.now() - this.startTime;
		const dimensionTimes: Record<string, number> = {};
		const dimensionCosts: Record<string, number> = {};

		this.dimensionTimes.forEach((time, dimension) => {
			dimensionTimes[dimension] = time;
		});

		this.dimensionCosts.forEach((cost, dimension) => {
			dimensionCosts[dimension] = cost;
		});

		return {
			totalTime,
			dimensionTimes,
			dimensionCosts,
			avgTimePerSection: totalTime / this.totalSections
		};
	}
}

// ============================================================================
// PLUGIN WITH PROGRESS TRACKING
// ============================================================================

/**
 * MonitoredPlugin
 *
 * Demonstrates progress tracking and monitoring
 */
class MonitoredPlugin extends Plugin {
	private tracker = new ProgressTracker();
	private dimensionStartTimes = new Map<string, number>();

	constructor() {
		super(
			"monitored-plugin",
			"Monitored Plugin",
			"Plugin with comprehensive monitoring"
		);

		this.dimensions = [
			"sentiment",    // Independent
			"topics",       // Independent
			{ name: "summary", scope: "global" }  // Depends on both
		];
	}

	defineDependencies(): Record<string, string[]> {
		return {
			summary: ["sentiment", "topics"]
		};
	}

	// ============================================================================
	// MONITORING HOOKS
	// ============================================================================

	/**
	 * Track when processing starts
	 */
	async beforeProcess(sections: SectionData[]): Promise<void> {
		this.tracker.start(sections.length);
	}

	/**
	 * Track when each dimension starts
	 */
	async beforeDimensionExecute(ctx: any): Promise<void> {
		const key = `${ctx.dimension}:${ctx.section.metadata?.id}`;
		this.dimensionStartTimes.set(key, Date.now());
		this.tracker.onDimensionStart(ctx.dimension, ctx.section.metadata?.id);
	}

	/**
	 * Track when each dimension completes
	 */
	async afterDimensionExecute(ctx: any): Promise<void> {
		const key = `${ctx.dimension}:${ctx.section.metadata?.id}`;
		const startTime = this.dimensionStartTimes.get(key) || Date.now();
		const duration = Date.now() - startTime;

		// Estimate cost (simplified - in production, use actual cost tracking)
		const estimatedCost = this.estimateCost(ctx.dimension, ctx.result);

		this.tracker.onDimensionComplete(
			ctx.dimension,
			ctx.section.metadata?.id,
			duration,
			estimatedCost
		);

		this.dimensionStartTimes.delete(key);
	}

	/**
	 * Simple cost estimation
	 */
	private estimateCost(dimension: string, result: any): number {
		// Simplified cost calculation
		// In production, get from result.metadata.usage
		if (dimension === "summary") {
			return 0.002; // Sonnet
		}
		return 0.0005; // Haiku
	}

	getTracker(): ProgressTracker {
		return this.tracker;
	}

	// ============================================================================
	// STANDARD PLUGIN METHODS
	// ============================================================================

	createPrompt(ctx: PromptContext): string {
		const { dimension, sections, dependencies } = ctx;
		const content = sections[0]?.content || "";

		if (dimension === "sentiment") {
			return `Analyze sentiment: "${content}"

Return JSON:
{
  "sentiment": "positive" or "negative" or "neutral",
  "score": 0.0-1.0
}`;
		}

		if (dimension === "topics") {
			return `Extract topics: "${content}"

Return JSON:
{
  "topics": ["topic1", "topic2"]
}`;
		}

		if (dimension === "summary") {
			const sentimentData = (dependencies.sentiment as any)?.data?.sections || [];
			const topicsData = (dependencies.topics as any)?.data?.sections || [];

			return `Create summary from analyses:

Sentiments: ${JSON.stringify(sentimentData.map((s: any) => s.data))}
Topics: ${JSON.stringify(topicsData.map((t: any) => t.data))}

Return JSON:
{
  "summary": "overall summary"
}`;
		}

		return "";
	}

	selectProvider(dimension: string): ProviderSelection {
		if (dimension === "summary") {
			return {
				provider: "anthropic",
				options: { model: "claude-3-5-sonnet-20241022", temperature: 0.3 }
			};
		}

		return {
			provider: "anthropic",
			options: { model: "claude-3-5-haiku-20241022", temperature: 0.2 }
		};
	}
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
	console.log("\n📚 Fundamentals 09: Progress Monitoring & Analytics\n");
	console.log("Learn how to track and optimize workflow execution.\n");

	// ============================================================================
	// SETUP DATA
	// ============================================================================

	const sections: SectionData[] = [
		{ content: "Excellent product! Highly recommended.", metadata: { id: 1 } },
		{ content: "Not satisfied with the quality.", metadata: { id: 2 } },
		{ content: "Great features and good value.", metadata: { id: 3 } },
		{ content: "Customer support was helpful.", metadata: { id: 4 } },
		{ content: "Disappointed with performance.", metadata: { id: 5 } }
	];

	// ============================================================================
	// METHOD 1: Built-in Progress Display
	// ============================================================================

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("METHOD 1: Built-in Progress Display");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	const plugin1 = new MonitoredPlugin();

	const engine1 = new DagEngine({
		plugin: plugin1,
		providers: {
			anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! }
		},
		// ✅ FEATURE 1: Built-in progress display
		progressDisplay: {
			display: 'bar',        // 'bar', 'dots', 'none'
			showDimensions: true,  // Show dimension names
			showCosts: true        // Show cost estimates
		},
		pricing: {
			models: {
				"claude-3-5-haiku-20241022": { inputPer1M: 0.80, outputPer1M: 4.00 },
				"claude-3-5-sonnet-20241022": { inputPer1M: 3.00, outputPer1M: 15.00 }
			}
		}
	});

	console.log("Processing with built-in progress bar...\n");

	const startTime1 = Date.now();
	const result1 = await engine1.process(sections);
	const duration1 = Date.now() - startTime1;

	console.log(`\n✓ Complete in ${(duration1 / 1000).toFixed(2)}s\n`);

	// ============================================================================
	// METHOD 2: Execution Analytics
	// ============================================================================

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("METHOD 2: Execution Plan Analytics");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	const engine2 = new DagEngine({
		plugin: new MonitoredPlugin(),
		providers: {
			anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! }
		}
	});

	// ✅ FEATURE 2: Get execution plan analytics BEFORE processing
	const analytics = await engine2.getGraphAnalytics();

	console.log("📊 Execution Plan Analysis:\n");

	console.log("Critical Path (longest sequential path):");
	console.log(`   ${analytics.criticalPath.join(" → ")}`);
	console.log(`   Estimated time: ~${analytics.estimatedDuration}ms\n`);

	console.log("Parallel Groups (tasks that run together):");
	analytics.parallelGroups.forEach((group, idx) => {
		console.log(`   Group ${idx + 1}: [${group.join(", ")}]`);
	});
	console.log("");

	if (analytics.bottlenecks.length > 0) {
		console.log("⚠️  Bottlenecks (dimensions that slow execution):");
		analytics.bottlenecks.forEach((bottleneck) => {
			console.log(`   - ${bottleneck.dimension}: ${bottleneck.reason}`);
		});
		console.log("");
	}

	console.log("Optimization Suggestions:");
	analytics.suggestions.forEach((suggestion, idx) => {
		console.log(`   ${idx + 1}. ${suggestion}`);
	});
	console.log("");

	// ============================================================================
	// METHOD 3: Custom Progress Tracking
	// ============================================================================

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("METHOD 3: Custom Progress Tracking");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

	const plugin3 = new MonitoredPlugin();

	const engine3 = new DagEngine({
		plugin: plugin3,
		providers: {
			anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! }
		},
		progressDisplay: {
			display: 'none'  // Disable built-in display for custom tracking
		}
	});

	const startTime3 = Date.now();
	const result3 = await engine3.process(sections);
	const duration3 = Date.now() - startTime3;

	const summary = plugin3.getTracker().getSummary();

	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("CUSTOM TRACKING SUMMARY");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("⏱️  Timing Breakdown:\n");
	console.log(`   Total time: ${(summary.totalTime / 1000).toFixed(2)}s`);
	console.log(`   Average per section: ${(summary.avgTimePerSection / 1000).toFixed(2)}s\n`);

	console.log("   By dimension:");
	Object.entries(summary.dimensionTimes).forEach(([dimension, time]) => {
		const percentage = (time / summary.totalTime) * 100;
		console.log(`   - ${dimension}: ${(time / 1000).toFixed(2)}s (${percentage.toFixed(1)}%)`);
	});
	console.log("");

	console.log("💰 Cost Breakdown:\n");
	let totalCost = 0;
	Object.entries(summary.dimensionCosts).forEach(([dimension, cost]) => {
		totalCost += cost;
		console.log(`   - ${dimension}: $${cost.toFixed(4)}`);
	});
	console.log(`   - TOTAL: $${totalCost.toFixed(4)}\n`);

	// ============================================================================
	// METHOD 4: Real-time Progress Callbacks
	// ============================================================================

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("METHOD 4: Real-time Progress Callbacks");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	// ✅ FEATURE 4: Progress callback for real-time updates
	let progressUpdates = 0;

	const engine4 = new DagEngine({
		plugin: new MonitoredPlugin(),
		providers: {
			anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! }
		},
		progressDisplay: {
			display: 'none'
		},
		// Custom progress callback
		onProgress: (progress) => {
			progressUpdates++;
			console.log(`   [${progress.timestamp}] ${progress.dimension}: ${progress.completed}/${progress.total} (${progress.percentage.toFixed(1)}%)`);
		}
	});

	console.log("Real-time progress updates:\n");

	await engine4.process(sections);

	console.log(`\n   Received ${progressUpdates} progress updates\n`);

	// ============================================================================
	// EXPLANATION
	// ============================================================================

	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("MONITORING FEATURES SUMMARY");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("✨ What you learned:\n");

	console.log("1. BUILT-IN PROGRESS DISPLAY:");
	console.log("   - progressDisplay: { display: 'bar' | 'dots' | 'none' }");
	console.log("   - Shows progress bar with dimensions");
	console.log("   - Displays cost estimates in real-time");
	console.log("   - Zero configuration needed\n");

	console.log("2. EXECUTION ANALYTICS:");
	console.log("   - getGraphAnalytics() before processing");
	console.log("   - Critical path analysis (bottlenecks)");
	console.log("   - Parallel group identification");
	console.log("   - Optimization suggestions");
	console.log("   - Performance predictions\n");

	console.log("3. CUSTOM TRACKING:");
	console.log("   - beforeDimensionExecute() / afterDimensionExecute()");
	console.log("   - Track timing per dimension");
	console.log("   - Track costs per dimension");
	console.log("   - Build custom analytics\n");

	console.log("4. REAL-TIME CALLBACKS:");
	console.log("   - onProgress: (progress) => {}");
	console.log("   - Get updates during execution");
	console.log("   - Update UI, dashboards, webhooks");
	console.log("   - Monitor long-running processes\n");

	console.log("🎓 Key concepts:\n");

	console.log("✓ Multiple monitoring methods available");
	console.log("✓ Built-in progress display for quick visibility");
	console.log("✓ Analytics for performance optimization");
	console.log("✓ Custom tracking for advanced needs");
	console.log("✓ Real-time callbacks for integrations\n");

	console.log("💡 Configuration examples:\n");

	console.log("Simple progress bar:");
	console.log("  const engine = new DagEngine({");
	console.log("    progressDisplay: { display: 'bar' }");
	console.log("  });\n");

	console.log("Detailed progress:");
	console.log("  const engine = new DagEngine({");
	console.log("    progressDisplay: {");
	console.log("      display: 'bar',");
	console.log("      showDimensions: true,");
	console.log("      showCosts: true,");
	console.log("      showTimings: true");
	console.log("    }");
	console.log("  });\n");

	console.log("Custom callback:");
	console.log("  const engine = new DagEngine({");
	console.log("    onProgress: (progress) => {");
	console.log("      // Update your dashboard");
	console.log("      dashboard.update({");
	console.log("        completed: progress.completed,");
	console.log("        total: progress.total,");
	console.log("        cost: progress.costSoFar");
	console.log("      });");
	console.log("    }");
	console.log("  });\n");

	console.log("Analytics before processing:");
	console.log("  const analytics = await engine.getGraphAnalytics();");
	console.log("  console.log('Critical path:', analytics.criticalPath);");
	console.log("  console.log('Estimated time:', analytics.estimatedDuration);");
	console.log("  console.log('Bottlenecks:', analytics.bottlenecks);\n");

	console.log("📊 Use cases:\n");

	console.log("1. Web Dashboard:");
	console.log("   - Use onProgress callback");
	console.log("   - Send updates via WebSocket");
	console.log("   - Display real-time progress bar\n");

	console.log("2. CLI Tool:");
	console.log("   - Use built-in progress bar");
	console.log("   - Show in terminal");
	console.log("   - Simple and effective\n");

	console.log("3. API Service:");
	console.log("   - Use custom tracking");
	console.log("   - Store metrics in database");
	console.log("   - Generate performance reports\n");

	console.log("4. Debugging:");
	console.log("   - Use getGraphAnalytics()");
	console.log("   - Identify bottlenecks");
	console.log("   - Optimize execution plan\n");

	console.log("⚠️  Performance tips:\n");

	console.log("1. Use analytics to identify bottlenecks:");
	console.log("   const analytics = await engine.getGraphAnalytics();");
	console.log("   if (analytics.bottlenecks.length > 0) {");
	console.log("     // Optimize bottleneck dimensions");
	console.log("   }\n");

	console.log("2. Monitor costs in real-time:");
	console.log("   progressDisplay: { showCosts: true }\n");

	console.log("3. Track dimension performance:");
	console.log("   Use afterDimensionExecute() to log timing");
	console.log("   Identify slow dimensions");
	console.log("   Consider faster models or caching\n");

	console.log("4. Optimize parallel execution:");
	console.log("   Analytics shows parallel groups");
	console.log("   Ensure independent tasks have no dependencies");
	console.log("   Maximize parallelization\n");

	console.log("🎉 Fundamentals Complete!\n");
	console.log("You now know:");
	console.log("  ✓ Plugin structure (01)");
	console.log("  ✓ Dependencies & parallelization (02)");
	console.log("  ✓ Section vs Global scope (03)");
	console.log("  ✓ Transformations (04)");
	console.log("  ✓ Skip logic (05)");
	console.log("  ✓ Provider selection (06)");
	console.log("  ✓ Async hooks (07)");
	console.log("  ✓ Error handling (08)");
	console.log("  ✓ Progress monitoring (09)\n");

	console.log("⏭️  Next steps:");
	console.log("   → Explore patterns: examples/02-complete-guide/patterns/");
	console.log("   → Production template: examples/02-complete-guide/production/");
	console.log("   → Real examples: examples/02-complete-guide/use-cases/\n");
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error: Error) => {
	console.error("\n❌ Error:", error.message);
	process.exit(1);
});