import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../src/core/engine/dag-engine.ts";
import { Plugin } from "../src/plugin.ts";
import { ProviderRegistry } from "../src/providers/registry.ts";
import { MockAIProvider, createMockSection } from "./setup.ts";
import type {
	PromptContext,
	ProviderSelection,
	SectionData,
	DimensionResult,
} from "../src/types.ts";

/**
 * Global analysis result structure
 */
interface GlobalAnalysisResult {
	themes: string[];
}

/**
 * Section analysis result structure
 */
interface SectionAnalysisResult {
	result: string;
}

/**
 * Generic test result structure
 */
interface GenericTestResult {
	result: string;
}

describe("DagEngine - Global Dimensions", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should process global dimensions", async () => {
		class GlobalPlugin extends Plugin {
			constructor() {
				super("global", "Global", "Test global");
				this.dimensions = [
					{ name: "global_analysis", scope: "global" as const },
					"section_analysis",
				];
			}

			createPrompt(context: PromptContext): string {
				return `Analyze ${context.dimension}`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.setMockResponse("Analyze global_analysis", {
			themes: ["theme1"],
		});
		mockProvider.setMockResponse("Analyze section_analysis", {
			result: "section",
		});

		const engine = new DagEngine({
			plugin: new GlobalPlugin(),
			registry,
		});

		const result = await engine.process([
			createMockSection("Section 1"),
			createMockSection("Section 2"),
		]);

		expect(result.globalResults.global_analysis).toBeDefined();

		const globalData = result.globalResults.global_analysis
			?.data as GlobalAnalysisResult | undefined;
		expect(globalData).toEqual({
			themes: ["theme1"],
		});
	});

	test("should process global dimensions after sections", async () => {
		const executionOrder: string[] = [];

		class GlobalAfterPlugin extends Plugin {
			constructor() {
				super("global-after", "Global After", "Test");
				this.dimensions = [
					"section_dim",
					{ name: "global_summary", scope: "global" as const },
				];
			}

			createPrompt(context: PromptContext): string {
				executionOrder.push(context.dimension);
				return `Process ${context.dimension}`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return {
					global_summary: ["section_dim"],
				};
			}
		}

		const engine = new DagEngine({
			plugin: new GlobalAfterPlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")]);

		expect(executionOrder).toContain("section_dim");
		expect(executionOrder).toContain("global_summary");
		expect(executionOrder.indexOf("section_dim")).toBeLessThan(
			executionOrder.indexOf("global_summary"),
		);
	});

	test("should apply transformation function", async () => {
		class TransformPlugin extends Plugin {
			constructor() {
				super("transform", "Transform", "Test transform");
				this.dimensions = [
					{
						name: "merger",
						scope: "global" as const,
						transform: (_result: DimensionResult, sections: SectionData[]): SectionData[] => {
							// Merge all sections into one
							return [
								{
									content: sections.map((s) => s.content).join(" "),
									metadata: { merged: true },
								},
							];
						},
					},
					"analysis",
				];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.setMockResponse("test", { result: "ok" });

		const engine = new DagEngine({
			plugin: new TransformPlugin(),
			registry,
		});

		const result = await engine.process([
			createMockSection("Section 1"),
			createMockSection("Section 2"),
			createMockSection("Section 3"),
		]);

		expect(result.transformedSections).toHaveLength(1);
		expect(result.transformedSections[0]?.content).toBe(
			"Section 1 Section 2 Section 3",
		);

		const metadata = result.transformedSections[0]?.metadata as { merged?: boolean } | undefined;
		expect(metadata?.merged).toBe(true);
	});

	test("should process parallel independent global dimensions", async () => {
		const startTimes: Record<string, number> = {};

		class ParallelGlobalPlugin extends Plugin {
			constructor() {
				super("parallel", "Parallel", "Test parallel");
				this.dimensions = [
					{ name: "global1", scope: "global" as const },
					{ name: "global2", scope: "global" as const },
					{ name: "global3", scope: "global" as const },
				];
			}

			createPrompt(context: PromptContext): string {
				startTimes[context.dimension] = Date.now();
				return `Process ${context.dimension}`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.delay = 100; // Add delay to see parallel execution

		const engine = new DagEngine({
			plugin: new ParallelGlobalPlugin(),
			registry,
		});

		const startTime = Date.now();
		await engine.process([createMockSection("Test")]);
		const totalTime = Date.now() - startTime;

		// If truly parallel, should take ~100ms, not 300ms
		expect(totalTime).toBeLessThan(250); // Some buffer for overhead
	});

	test("should handle global dimension with no dependencies", async () => {
		class IndependentGlobalPlugin extends Plugin {
			constructor() {
				super("independent", "Independent", "Test");
				this.dimensions = [
					{ name: "global_independent", scope: "global" as const },
				];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.setMockResponse("test", { result: "ok" });

		const engine = new DagEngine({
			plugin: new IndependentGlobalPlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(result.globalResults.global_independent).toBeDefined();

		const globalData = result.globalResults.global_independent
			?.data as GenericTestResult | undefined;
		expect(globalData?.result).toBe("ok");
	});

	test("should handle transformation that returns empty array", async () => {
		class EmptyTransformPlugin extends Plugin {
			constructor() {
				super("empty-transform", "Empty Transform", "Test");
				this.dimensions = [
					{
						name: "filter_all",
						scope: "global" as const,
						transform: (): SectionData[] => {
							return [];
						},
					},
					"analysis",
				];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.setMockResponse("test", { result: "ok" });

		const engine = new DagEngine({
			plugin: new EmptyTransformPlugin(),
			registry,
		});

		const result = await engine.process([
			createMockSection("Section 1"),
			createMockSection("Section 2"),
		]);

		// Should preserve original sections if transform returns empty
		expect(result.transformedSections.length).toBeGreaterThan(0);
	});

	test("should handle multiple global dimensions with transformations", async () => {
		class MultiGlobalTransformPlugin extends Plugin {
			constructor() {
				super("multi-global", "Multi Global", "Test");
				this.dimensions = [
					{
						name: "global1",
						scope: "global" as const,
						transform: (_result: DimensionResult, sections: SectionData[]): SectionData[] => {
							return sections.slice(0, 2);
						},
					},
					{
						name: "global2",
						scope: "global" as const,
						transform: (_result: DimensionResult, sections: SectionData[]): SectionData[] => {
							return sections.map((s) => ({
								...s,
								content: s.content.toUpperCase(),
							}));
						},
					},
				];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.setMockResponse("test", { result: "ok" });

		const engine = new DagEngine({
			plugin: new MultiGlobalTransformPlugin(),
			registry,
		});

		const result = await engine.process([
			createMockSection("section 1"),
			createMockSection("section 2"),
			createMockSection("section 3"),
		]);

		// After first transform: 2 sections
		// After second transform: uppercase content
		expect(result.transformedSections).toHaveLength(2);
		expect(result.transformedSections[0]?.content).toBe("SECTION 1");
		expect(result.transformedSections[1]?.content).toBe("SECTION 2");
	});
});