import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../src/core/engine/dag-engine.ts";
import { Plugin } from "../src/plugin.ts";
import { ProviderRegistry } from "../src/providers/registry.ts";
import { MockAIProvider, createMockSection } from "./setup.ts";
import type {
	PromptContext,
	DimensionDependencies,
	DimensionResult,
	ProviderRequest,
	ProviderResponse,
} from "../src/types.ts";

/**
 * Aggregated section data structure
 */
interface AggregatedData {
	aggregated: boolean;
	sections: DimensionResult[];
	totalSections: number;
	[key: string]: unknown;
}

/**
 * Section analysis result
 */
interface SectionAnalysisResult {
	sentiment: string;
}

/**
 * Global summary result
 */
interface GlobalSummaryResult {
	summary: string;
}

/**
 * Generic result structure
 */
interface GenericResult {
	result: string;
}

describe("DagEngine - Section Aggregation", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should aggregate section results for global dimension", async () => {
		let receivedDeps: DimensionDependencies | null = null;

		class AggregationPlugin extends Plugin {
			constructor() {
				super("agg", "Aggregation", "Test");
				this.dimensions = [
					"section_analysis",
					{ name: "global_summary", scope: "global" as const },
				];
			}

			createPrompt(context: PromptContext): string {
				if (context.dimension === "global_summary") {
					receivedDeps = context.dependencies;
				}
				return context.dimension;
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return {
					global_summary: ["section_analysis"],
				};
			}
		}

		mockProvider.setMockResponse("section_analysis", { sentiment: "positive" });
		mockProvider.setMockResponse("global_summary", {
			summary: "Overall positive",
		});

		const engine = new DagEngine({
			plugin: new AggregationPlugin(),
			registry,
		});

		const sections = [
			createMockSection("Section 1"),
			createMockSection("Section 2"),
			createMockSection("Section 3"),
		];

		await engine.process(sections);

		expect(receivedDeps).toBeDefined();

		const sectionAnalysis = receivedDeps!.section_analysis;
		expect(sectionAnalysis).toBeDefined();
		expect(sectionAnalysis?.data).toBeDefined();

		const data = sectionAnalysis?.data as AggregatedData;
		expect(data.aggregated).toBe(true);
		expect(data.sections).toHaveLength(3);
	});

	test("should provide correct totalSections count", async () => {
		let receivedTotal: number | null = null;

		class TotalPlugin extends Plugin {
			constructor() {
				super("total", "Total", "Test");
				this.dimensions = [
					"section_dim",
					{ name: "global_dim", scope: "global" as const },
				];
			}

			createPrompt(context: PromptContext): string {
				if (context.dimension === "global_dim") {
					const sectionDim = context.dependencies.section_dim;
					const data = sectionDim?.data as AggregatedData | undefined;
					receivedTotal = data?.totalSections ?? null;
				}
				return context.dimension;
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return { global_dim: ["section_dim"] };
			}
		}

		mockProvider.setMockResponse("section_dim", { result: "ok" });
		mockProvider.setMockResponse("global_dim", { result: "global" });

		const engine = new DagEngine({
			plugin: new TotalPlugin(),
			registry,
		});

		const sections = Array.from({ length: 7 }, (_, i) =>
			createMockSection(`Section ${i}`),
		);

		await engine.process(sections);

		expect(receivedTotal).toBe(7);
	});

	test("should handle partial section results", async () => {
		let receivedSections: DimensionResult[] = [];

		class PartialPlugin extends Plugin {
			constructor() {
				super("partial", "Partial", "Test");
				this.dimensions = [
					"section_dim",
					{ name: "global_dim", scope: "global" as const },
				];
			}

			createPrompt(context: PromptContext): string {
				if (context.dimension === "global_dim") {
					const sectionDim = context.dependencies.section_dim;
					const data = sectionDim?.data as AggregatedData | undefined;
					receivedSections = data?.sections ?? [];
				}
				return context.dimension;
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return { global_dim: ["section_dim"] };
			}
		}

		let callCount = 0;
		mockProvider.execute = async (request: ProviderRequest): Promise<ProviderResponse> => {
			callCount++;
			if (callCount % 2 === 0) {
				return { error: "Failed" };
			}
			return { data: { result: `ok-${callCount}` } };
		};

		const engine = new DagEngine({
			plugin: new PartialPlugin(),
			registry,
			continueOnError: true,
		});

		const sections = [
			createMockSection("Section 1"),
			createMockSection("Section 2"),
			createMockSection("Section 3"),
			createMockSection("Section 4"),
		];

		await engine.process(sections);

		// Should have aggregated both successful and failed results
		expect(receivedSections.length).toBeGreaterThan(0);
	});

	test("should handle empty section results", async () => {
		let receivedDeps: DimensionDependencies | null = null;

		class EmptyPlugin extends Plugin {
			constructor() {
				super("empty", "Empty", "Test");
				this.dimensions = [{ name: "global_dim", scope: "global" as const }];
			}

			createPrompt(context: PromptContext): string {
				receivedDeps = context.dependencies;
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return { global_dim: ["nonexistent_section_dim"] };
			}
		}

		mockProvider.setMockResponse("test", { result: "ok" });

		const engine = new DagEngine({
			plugin: new EmptyPlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")]);

		expect(receivedDeps).not.toBeNull();
		const nonexistentDim = receivedDeps!.nonexistent_section_dim;
		expect(nonexistentDim).toBeDefined();
		expect(nonexistentDim?.error).toBeDefined();
	});

	test("should mark aggregated results correctly", async () => {
		let isAggregated: boolean | null = null;

		class MarkPlugin extends Plugin {
			constructor() {
				super("mark", "Mark", "Test");
				this.dimensions = [
					"section_dim",
					{ name: "global_dim", scope: "global" as const },
				];
			}

			createPrompt(context: PromptContext): string {
				if (context.dimension === "global_dim") {
					const sectionDim = context.dependencies.section_dim;
					const data = sectionDim?.data as AggregatedData | undefined;
					isAggregated = data?.aggregated ?? null;
				}
				return context.dimension;
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return { global_dim: ["section_dim"] };
			}
		}

		mockProvider.setMockResponse("section_dim", { result: "section" });
		mockProvider.setMockResponse("global_dim", { result: "global" });

		const engine = new DagEngine({
			plugin: new MarkPlugin(),
			registry,
		});

		await engine.process([
			createMockSection("Section 1"),
			createMockSection("Section 2"),
		]);

		expect(isAggregated).toBe(true);
	});

	test("should handle mixed success/failure in aggregation", async () => {
		let aggregatedResults: DimensionResult[] = [];

		class MixedPlugin extends Plugin {
			constructor() {
				super("mixed", "Mixed", "Test");
				this.dimensions = [
					"section_dim",
					{ name: "global_dim", scope: "global" as const },
				];
			}

			createPrompt(context: PromptContext): string {
				if (context.dimension === "global_dim") {
					const sectionDim = context.dependencies.section_dim;
					const data = sectionDim?.data as AggregatedData | undefined;
					aggregatedResults = data?.sections ?? [];
				}
				return context.dimension;
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return { global_dim: ["section_dim"] };
			}
		}

		let sectionCallCount = 0;

		mockProvider.execute = async (request: ProviderRequest): Promise<ProviderResponse> => {
			// The input is 'section_dim' for all section calls
			if (request.input === "section_dim") {
				sectionCallCount++;

				// Make the 2nd section call fail
				if (sectionCallCount === 2) {
					return { error: "Section 2 failed" };
				}
			}

			return { data: { result: "ok" } };
		};

		const engine = new DagEngine({
			plugin: new MixedPlugin(),
			registry,
			continueOnError: true,
			maxRetries: 0,
		});

		const sections = [
			createMockSection("Section 1"),
			createMockSection("Section 2"),
			createMockSection("Section 3"),
		];

		await engine.process(sections);

		expect(aggregatedResults).toHaveLength(3);

		const errorResults = aggregatedResults.filter((r) => r.error !== undefined);
		expect(errorResults.length).toBeGreaterThan(0);
	});

	test("should aggregate multiple section dimensions", async () => {
		let receivedDeps: DimensionDependencies | null = null;

		class MultiAggPlugin extends Plugin {
			constructor() {
				super("multi-agg", "Multi Agg", "Test");
				this.dimensions = [
					"section_dim1",
					"section_dim2",
					{ name: "global_dim", scope: "global" as const },
				];
			}

			createPrompt(context: PromptContext): string {
				if (context.dimension === "global_dim") {
					receivedDeps = context.dependencies;
				}
				return context.dimension;
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return { global_dim: ["section_dim1", "section_dim2"] };
			}
		}

		mockProvider.setMockResponse("section_dim1", { result: "dim1" });
		mockProvider.setMockResponse("section_dim2", { result: "dim2" });
		mockProvider.setMockResponse("global_dim", { result: "global" });

		const engine = new DagEngine({
			plugin: new MultiAggPlugin(),
			registry,
		});

		await engine.process([
			createMockSection("Section 1"),
			createMockSection("Section 2"),
		]);

		expect(receivedDeps).not.toBeNull();

		const dim1 = receivedDeps!.section_dim1;
		const dim2 = receivedDeps!.section_dim2;

		expect(dim1).toBeDefined();
		expect(dim2).toBeDefined();

		const data1 = dim1?.data as AggregatedData | undefined;
		const data2 = dim2?.data as AggregatedData | undefined;

		expect(data1?.aggregated).toBe(true);
		expect(data2?.aggregated).toBe(true);
	});
});