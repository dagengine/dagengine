/**
 * Fundamentals 07: Async Hooks
 *
 * Demonstrates that ALL hooks (16 total) support async/await.
 *
 * Run: npm run 07
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
	type BeforeProcessStartContext,
	type ProcessStartResult,
	type ProcessResultContext,
	type ProcessFailureContext,
	type ProcessContext,
	type SectionDimensionContext,
	type DimensionContext,
	type DimensionResultContext,
	type ProviderContext,
	type ProviderRequest,
	type ProviderResultContext,
	type ProviderResponse,
	type TransformSectionsContext,
	type FinalizeContext,
	type RetryContext,
	type RetryResponse,
	type FallbackContext,
	type FallbackResponse,
	type FailureContext,
	type SkipWithResult
} from "@dagengine/core";

config({ path: resolve(process.cwd(), ".env") });

interface AnalysisResult {
	sentiment: "positive" | "negative" | "neutral";
	score: number;
}

class CompleteHooksDemo extends Plugin {
	private hookLog: string[] = [];

	constructor() {
		super(
			"complete-hooks",
			"Complete Hooks Demo",
			"Every hook demonstrated"
		);

		this.dimensions = [
			{ name: "analyze", scope: "global" as const },
			"detail"
		];
	}

	async beforeProcessStart(
		context: BeforeProcessStartContext
	): Promise<ProcessStartResult> {
		await this.logAsync("beforeProcessStart");
		return {};
	}

	async defineDependencies(
		context: ProcessContext
	): Promise<Record<string, string[]>> {
		await this.logAsync("defineDependencies");
		return { detail: ["analyze"] };
	}

	async shouldSkipGlobalDimension(
		context: DimensionContext
	): Promise<boolean | SkipWithResult> {
		await this.logAsync(`shouldSkipGlobalDimension: ${context.dimension}`);
		return false;
	}

	async shouldSkipSectionDimension(
		context: SectionDimensionContext
	): Promise<boolean | SkipWithResult> {
		await this.logAsync(`shouldSkipSectionDimension: ${context.dimension}`);
		return false;
	}

	async transformDependencies(
		context: DimensionContext | SectionDimensionContext
	): Promise<Record<string, DimensionResult>> {
		await this.logAsync(`transformDependencies: ${context.dimension}`);
		return context.dependencies;
	}

	async beforeDimensionExecute(
		context: DimensionContext | SectionDimensionContext
	): Promise<void> {
		await this.logAsync(`beforeDimensionExecute: ${context.dimension}`);
	}

	async beforeProviderExecute(
		context: ProviderContext
	): Promise<ProviderRequest> {
		await this.logAsync(`beforeProviderExecute: ${context.dimension}`);
		return context.request;
	}

	async afterProviderExecute(
		context: ProviderResultContext
	): Promise<ProviderResponse> {
		await this.logAsync(`afterProviderExecute: ${context.dimension}`);
		return context.result;
	}

	async afterDimensionExecute(
		context: DimensionResultContext
	): Promise<void> {
		await this.logAsync(`afterDimensionExecute: ${context.dimension}`);
	}

	async transformSections(
		context: TransformSectionsContext
	): Promise<SectionData[]> {
		await this.logAsync(`transformSections: ${context.dimension}`);
		return context.currentSections;
	}

	async finalizeResults(
		context: FinalizeContext
	): Promise<Record<string, DimensionResult>> {
		await this.logAsync("finalizeResults");
		return context.results;
	}

	async afterProcessComplete(
		context: ProcessResultContext
	): Promise<ProcessResult> {
		await this.logAsync("afterProcessComplete");
		return context.result;
	}

	async handleProcessFailure(
		context: ProcessFailureContext
	): Promise<ProcessResult | void> {
		await this.logAsync("handleProcessFailure");
	}

	async handleRetry(
		context: RetryContext
	): Promise<RetryResponse> {
		await this.logAsync("handleRetry");
		return {};
	}

	async handleProviderFallback(
		context: FallbackContext
	): Promise<FallbackResponse> {
		await this.logAsync("handleProviderFallback");
		return {};
	}

	async handleDimensionFailure(
		context: FailureContext
	): Promise<DimensionResult | void> {
		await this.logAsync("handleDimensionFailure");
	}

	createPrompt(context: PromptContext): string {
		this.hookLog.push(`createPrompt: ${context.dimension}`);

		if (context.dimension === "analyze") {
			const sections = context.sections.map(section => section.content).join("\n");
			return `Analyze overall sentiment:\n${sections}\n\nReturn JSON: {"sentiment": "positive/negative/neutral", "score": 0.0-1.0}`;
		}

		const content = context.sections[0]?.content || "";
		const analysis = context.dependencies.analyze?.data as AnalysisResult | undefined;
		return `Given overall sentiment is ${analysis?.sentiment}, analyze: "${content}"\n\nReturn JSON: {"sentiment": "positive/negative/neutral", "score": 0.0-1.0}`;
	}

	selectProvider(dimension: string): ProviderSelection {
		this.hookLog.push(`selectProvider: ${dimension}`);

		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-haiku-20241022",
				temperature: 0.2
			}
		};
	}

	private async logAsync(hookName: string): Promise<void> {
		await new Promise(resolve => setTimeout(resolve, 10));
		this.hookLog.push(hookName);
	}

	getHookLog(): string[] {
		return this.hookLog;
	}
}

async function main(): Promise<void> {
	console.log("\n📚 Fundamentals 07: Async Hooks\n");
	console.log("Demonstrating that ALL hooks support async/await.\n");

	const sections: SectionData[] = [
		{ content: "Great product! Love it.", metadata: { id: 1 } },
		{ content: "Terrible experience.", metadata: { id: 2 } }
	];

	const plugin = new CompleteHooksDemo();

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
		progressDisplay: {
			display: 'bar'
		}
	});

	console.log("Processing 2 sections through all hooks...\n");

	const startTime = Date.now();
	const result = await engine.process(sections);
	const duration = Date.now() - startTime;

	displayResults(result, duration, plugin.getHookLog());
}

function displayResults(
	result: ProcessResult,
	duration: number,
	hookLog: string[]
): void {
	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("RESULTS");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	result.sections.forEach((sectionResult, index) => {
		const content = sectionResult.section.content;
		const detail = sectionResult.results.detail as DimensionResult<AnalysisResult> | undefined;

		console.log(`${index + 1}. "${content}"`);
		if (detail?.data) {
			console.log(`   📊 ${detail.data.sentiment} (${detail.data.score.toFixed(2)})`);
		}
		console.log("");
	});

	const globalAnalysis = result.globalResults.analyze as DimensionResult<AnalysisResult> | undefined;
	if (globalAnalysis?.data) {
		console.log("Global Analysis:");
		console.log(`📊 Overall: ${globalAnalysis.data.sentiment} (${globalAnalysis.data.score.toFixed(2)})\n`);
	}

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("ALL HOOKS CALLED");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	const uniqueHooks = new Map<string, number>();
	hookLog.forEach(hook => {
		const baseHook = hook.split(":")[0];
		if (baseHook) {
			uniqueHooks.set(baseHook, (uniqueHooks.get(baseHook) || 0) + 1);
		}
	});

	const asyncHooks = Array.from(uniqueHooks.entries())
		.filter(([name]) => name !== "createPrompt" && name !== "selectProvider")
		.sort(([a], [b]) => a.localeCompare(b));

	const syncHooks = Array.from(uniqueHooks.entries())
		.filter(([name]) => name === "createPrompt" || name === "selectProvider")
		.sort(([a], [b]) => a.localeCompare(b));

	console.log("Async Hooks (can use await):\n");
	asyncHooks.forEach(([name, count], index) => {
		console.log(`${index + 1}. ${name} (${count}x)`);
	});

	console.log("\nRequired Methods (async optional):\n");
	syncHooks.forEach(([name, count], index) => {
		console.log(`${index + 1}. ${name} (${count}x)`);
	});

	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("SUMMARY");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log(`⚡ Duration: ${(duration / 1000).toFixed(2)}s`);

	if (result.costs) {
		console.log(`💰 Cost: $${result.costs.totalCost.toFixed(4)}`);
		console.log(`🎫 Tokens: ${result.costs.totalTokens.toLocaleString()}`);
	}

	console.log(`🎯 Total Hook Calls: ${hookLog.length}`);
	console.log(`📋 Async Hooks: ${asyncHooks.length}`);

	console.log("");
}

main().catch((error: Error) => {
	console.error("\n❌ Error:", error.message);
	process.exit(1);
});