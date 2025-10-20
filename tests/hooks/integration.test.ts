import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../../src/core/engine";
import { TestPlugin } from "../helpers/test-plugin";
import { ProviderAdapter } from "../../src/providers/adapter";

import type {
	BeforeProcessStartContext,
	AfterProcessCompleteContext,
	SectionDimensionContext,
	DimensionResultContext,
	ProviderResultContext,
	TransformSectionsContext,
	FinalizeContext,
	RetryContext,
	ProcessStartResult,
	ProcessResult,
	SectionData,
	DimensionResult,
	RetryResponse,
} from "../../src/types";
import type {PromptContext} from '../../src/plugin'
import { BaseProvider } from "../../src/providers/types";
import type { ProviderRequest, ProviderResponse } from "../../src/providers/types";

/**
 * Mock provider for testing
 */
class MockProvider extends BaseProvider {
	public callLog: Array<{
		dimension: string;
		input: string;
		timestamp: number;
	}> = [];

	constructor() {
		super("mock", {});
	}

	protected getNativeBaseUrl(): string {
		return "http://localhost:3000";
	}

	async execute(request: ProviderRequest): Promise<ProviderResponse> {
		this.callLog.push({
			dimension: request.dimension || "unknown",
			input: Array.isArray(request.input) ? request.input[0] || "" : request.input,
			timestamp: Date.now(),
		});

		return {
			data: {
				result: `processed-${request.dimension}`,
				input: request.input
			},
			metadata: {
				model: "test-model",
				provider: "mock",
				tokens: {
					inputTokens: 100,
					outputTokens: 200,
					totalTokens: 300
				},
			},
		};
	}

	reset(): void {
		this.callLog = [];
	}
}

/**
 * Failing provider for retry tests
 */
class FailingProvider extends BaseProvider {
	public attemptCount = 0;

	constructor() {
		super("failing", {});
	}

	protected getNativeBaseUrl(): string {
		return "http://localhost:3000";
	}

	async execute(request: ProviderRequest): Promise<ProviderResponse> {
		this.attemptCount++;

		const input = Array.isArray(request.input) ? request.input[0] : request.input;

		// Fail if input doesn't include retry marker
		if (!input?.includes("retry-attempt")) {
			throw new Error("Need retry");
		}

		return {
			data: {
				result: "success",
				attempts: this.attemptCount
			},
			metadata: {
				model: "test-model",
				provider: "failing",
				tokens: {
					inputTokens: 100,
					outputTokens: 200,
					totalTokens: 300
				},
			},
		};
	}

	reset(): void {
		this.attemptCount = 0;
	}
}

describe("Hook Integration Tests", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider);
	});

	test("should execute all hooks in correct order", async () => {
		const executionLog: string[] = [];

		class ComprehensivePlugin extends TestPlugin {
			constructor() {
				super("comprehensive", "Comprehensive", "Test all hooks");
				this.dimensions = ["process"];
			}

			beforeProcessStart(
				context: BeforeProcessStartContext,
			): ProcessStartResult {
				executionLog.push("1-beforeProcessStart");
				return {
					sections: context.sections,
					metadata: { initialized: true },
				};
			}

			defineDependencies(): Record<string, string[]> {
				executionLog.push("2-defineDependencies");
				return {};
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				executionLog.push("3-shouldSkipSectionDimension");
				return false;
			}

			transformDependencies(context: SectionDimensionContext) {
				executionLog.push("4-transformDependencies");
				return context.dependencies;
			}

			beforeDimensionExecute(): void {
				executionLog.push("5-beforeDimensionExecute");
			}

			createPrompt(): string {
				executionLog.push("6-createPrompt");
				return "test";
			}

			selectProvider() {
				executionLog.push("7-selectProvider");
				return { provider: "mock", options: {} };
			}

			beforeProviderExecute(context: ProviderResultContext): ProviderRequest {
				executionLog.push("8-beforeProviderExecute");
				return context.request;
			}

			afterProviderExecute(context: ProviderResultContext): ProviderResponse {
				executionLog.push("9-afterProviderExecute");
				return context.result;
			}

			afterDimensionExecute(): void {
				executionLog.push("10-afterDimensionExecute");
			}

			finalizeResults(
				context: FinalizeContext,
			): Record<string, DimensionResult> {
				executionLog.push("11-finalizeResults");
				return context.results;
			}

			afterProcessComplete(
				context: AfterProcessCompleteContext,
			): ProcessResult {
				executionLog.push("12-afterProcessComplete");
				return context.result;
			}
		}

		const engine = new DagEngine({
			plugin: new ComprehensivePlugin(),
			providers: adapter,
		});

		await engine.process([{ content: "Test", metadata: {} }]);

		expect(executionLog).toEqual([
			"1-beforeProcessStart",
			"2-defineDependencies",
			"3-shouldSkipSectionDimension",
			"4-transformDependencies",
			"5-beforeDimensionExecute",
			"6-createPrompt",
			"7-selectProvider",
			"8-beforeProviderExecute",
			"9-afterProviderExecute",
			"10-afterDimensionExecute",
			"11-finalizeResults",
			"12-afterProcessComplete",
		]);
	});

	test("should pass data through hook pipeline", async () => {
		interface EnhancedData {
			result?: string;
			input?: string;
			enhanced?: string;
		}

		class DataPipelinePlugin extends TestPlugin {
			constructor() {
				super("pipeline", "Pipeline", "Test data flow");
				this.dimensions = ["process"];
			}

			beforeProcessStart(
				context: BeforeProcessStartContext,
			): ProcessStartResult {
				return {
					sections: context.sections.map((s) => ({
						...s,
						metadata: { ...s.metadata, stage: "beforeProcessStart" },
					})),
					metadata: { pipelineId: "test-123" },
				};
			}

			createPrompt(context: PromptContext): string {
				const firstSection = context.sections[0];
				const stage = firstSection?.metadata.stage as string | undefined;
				return `process: ${stage ?? 'unknown'}`;
			}

			beforeProviderExecute(context: ProviderResultContext): ProviderRequest {
				return {
					...context.request,
					input: `${context.request.input} + beforeProviderExecute`,
				};
			}

			afterProviderExecute(context: ProviderResultContext): ProviderResponse {
				const currentData = context.result.data as EnhancedData | undefined;

				return {
					...context.result,
					data: {
						...(currentData || {}),
						enhanced: "afterProviderExecute",
					},
				};
			}

			afterDimensionExecute(context: DimensionResultContext): void {
				const data = context.result.data as EnhancedData | undefined;
				expect(data?.enhanced).toBe("afterProviderExecute");
			}
		}

		const engine = new DagEngine({
			plugin: new DataPipelinePlugin(),
			providers: adapter,
		});

		const result = await engine.process([{ content: "Test", metadata: {} }]);

		expect(mockProvider.callLog[0]?.input).toContain("beforeProviderExecute");

		const processResult = result.sections[0]?.results.process;
		const processData = processResult?.data as EnhancedData | undefined;
		expect(processData?.enhanced).toBe("afterProviderExecute");
	});

	test("should handle complex workflow with dependencies and transformations", async () => {
		class ComplexWorkflowPlugin extends TestPlugin {
			constructor() {
				super("complex", "Complex", "Complex workflow");
				this.dimensions = [
					"extract",
					{ name: "summarize", scope: "global" as const },
					"enrich",
				];
			}

			defineDependencies(): Record<string, string[]> {
				return {
					summarize: ["extract"],
					enrich: ["summarize"],
				};
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}

			transformSections(context: TransformSectionsContext): SectionData[] {
				if (context.dimension === "summarize") {
					const resultData = context.result.data as { result?: string } | undefined;
					return [
						...context.currentSections,
						{
							content: `Summary: ${resultData?.result ?? 'unknown'}`,
							metadata: { type: "summary", fromDimension: "summarize" },
						},
					];
				}
				return context.currentSections;
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				if (context.dimension === "enrich") {
					return context.section.metadata.type === "summary";
				}
				return false;
			}
		}

		const engine = new DagEngine({
			plugin: new ComplexWorkflowPlugin(),
			providers: adapter,
		});

		const result = await engine.process([
			{ content: "Original section 1", metadata: {} },
			{ content: "Original section 2", metadata: {} },
		]);

		expect(result.transformedSections.length).toBeGreaterThan(2);

		const summarySection = result.transformedSections.find(
			(s) => s.metadata.type === "summary",
		);
		expect(summarySection).toBeDefined();

		const summarySectionIndex = result.transformedSections.findIndex(
			(s) => s.metadata.type === "summary",
		);
		if (summarySectionIndex >= 0) {
			const enrichResult = result.sections[summarySectionIndex]?.results.enrich;
			const enrichData = enrichResult?.data as { skipped?: boolean } | undefined;
			expect(enrichData?.skipped).toBe(true);
		}
	});

	test("should handle retry with modification", async () => {
		const failingProvider = new FailingProvider();
		adapter.registerProvider(failingProvider);

		class RetryModifyPlugin extends TestPlugin {
			constructor() {
				super("retry-modify", "Retry Modify", "Test retry with modification");
				this.dimensions = ["process"];
			}

			createPrompt(): string {
				return "initial";
			}

			selectProvider() {
				return { provider: "failing", options: {} };
			}

			handleRetry(context: RetryContext): RetryResponse {
				return {
					shouldRetry: true,
					modifiedRequest: {
						...context.request,
						input: `${context.request.input}-retry-attempt-${context.attempt}`,
					},
				};
			}
		}

		const engine = new DagEngine({
			plugin: new RetryModifyPlugin(),
			providers: adapter,
			maxRetries: 3,
		});

		const result = await engine.process([{ content: "Test", metadata: {} }]);

		const processResult = result.sections[0]?.results.process;
		const processData = processResult?.data as { result?: string } | undefined;
		expect(processData?.result).toBe("success");
		expect(failingProvider.attemptCount).toBeGreaterThan(1);
	});

	test("should aggregate and finalize with global dimensions", async () => {
		class AggregationPlugin extends TestPlugin {
			constructor() {
				super("aggregation", "Aggregation", "Test aggregation");
				this.dimensions = [
					"analyze",
					{ name: "global_summary", scope: "global" as const },
				];
			}

			defineDependencies(): Record<string, string[]> {
				return {
					global_summary: ["analyze"],
				};
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}

			finalizeResults(
				context: FinalizeContext,
			): Record<string, DimensionResult> {
				const finalized: Record<string, DimensionResult> = {
					...context.results,
				};

				const analyzeResults = Object.keys(context.results).filter((k) =>
					k.startsWith("analyze_section_"),
				);

				const globalSummary = finalized["global_summary"];
				if (globalSummary) {
					finalized["global_summary"] = {
						...globalSummary,
						data: {
							...(typeof globalSummary.data === 'object' && globalSummary.data !== null
								? globalSummary.data
								: {}),
							aggregatedFrom: analyzeResults.length,
						},
					};
				}

				return finalized;
			}
		}

		const engine = new DagEngine({
			plugin: new AggregationPlugin(),
			providers: adapter,
		});

		const result = await engine.process([
			{ content: "Section 1", metadata: {} },
			{ content: "Section 2", metadata: {} },
			{ content: "Section 3", metadata: {} },
		]);

		const summaryData = result.globalResults.global_summary?.data as
			{ aggregatedFrom?: number } | undefined;
		expect(summaryData?.aggregatedFrom).toBe(3);
	});
});