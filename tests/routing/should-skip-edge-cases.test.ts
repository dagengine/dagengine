import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../../src/core/engine";
import { Plugin } from "../../src/plugin";
import { ProviderAdapter } from "../../src/providers/adapter";
import type { SectionData, SectionDimensionContext } from "../../src/types";

class MockProvider {
	name = "mock";
	callCount = 0;

	async execute() {
		this.callCount++;
		return {
			data: { result: "test" },
			metadata: {
				model: "test-model",
				provider: "mock",
				tokens: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
			},
		};
	}

	reset() {
		this.callCount = 0;
	}
}

describe("shouldSkipSectionDimension - Edge Cases", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as any);
	});

	test("should handle when all sections skip all dimensions", async () => {
		class AllSkipPlugin extends Plugin {
			constructor() {
				super("all-skip", "All Skip", "All dimensions skip for all sections");
				this.dimensions = ["dim1", "dim2"];
			}

			createPrompt() {
				return "test";
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(): boolean {
				return true; // Always skip
			}
		}

		const plugin = new AllSkipPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		const result = await engine.process([
			{ content: "Section 1", metadata: {} },
			{ content: "Section 2", metadata: {} },
		]);

		// No API calls should be made
		expect(mockProvider.callCount).toBe(0);

		// All sections should have skipped markers for all dimensions
		result.sections.forEach((s) => {
			expect(s.results.dim1?.metadata).toEqual({
				skipped: true,
				reason: "Skipped by plugin shouldSkipSectionDimension",
			});
			expect(s.results.dim2?.metadata).toEqual({
				skipped: true,
				reason: "Skipped by plugin shouldSkipSectionDimension",
			});
		});
	});

	test("should handle when some sections skip, some do not", async () => {
		class PartialSkipPlugin extends Plugin {
			constructor() {
				super("partial-skip", "Partial Skip", "Some skip, some don't");
				this.dimensions = ["process"];
			}

			createPrompt() {
				return "test";
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;
				// Skip odd-indexed sections
				return (section.metadata.index as number) % 2 === 1;
			}
		}

		const plugin = new PartialSkipPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		const result = await engine.process([
			{ content: "Section 0", metadata: { index: 0 } },
			{ content: "Section 1", metadata: { index: 1 } },
			{ content: "Section 2", metadata: { index: 2 } },
			{ content: "Section 3", metadata: { index: 3 } },
		]);

		// Should process 2 sections (even indices: 0, 2)
		expect(mockProvider.callCount).toBe(2);

		// Verify which sections were skipped
		expect(result.sections[0]?.results.process?.metadata).not.toHaveProperty(
			"skipped",
		);
		expect(result.sections[1]?.results.process?.metadata).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipSectionDimension",
		});
		expect(result.sections[2]?.results.process?.metadata).not.toHaveProperty(
			"skipped",
		);
		expect(result.sections[3]?.results.process?.metadata).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipSectionDimension",
		});
	});

	test("should handle dimension with dependencies where parent is skipped", async () => {
		class DependencySkipPlugin extends Plugin {
			constructor() {
				super("dep-skip", "Dependency Skip", "Parent skipped");
				this.dimensions = ["extract", "analyze"];
			}

			defineDependencies() {
				return {
					analyze: ["extract"],
				};
			}

			createPrompt() {
				return "test";
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;
				if (dimension === "extract") {
					return section.metadata.skipExtract === true;
				}
				return false;
			}
		}

		const plugin = new DependencySkipPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			continueOnError: true,
		});

		const result = await engine.process([
			{ content: "Section 1", metadata: { skipExtract: true } },
		]);

		// extract should be skipped/
		expect(result.sections[0]?.results.extract?.metadata).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipSectionDimension",
		});

		// analyze should still run (with dependency error or continue)
		expect(result.sections[0]?.results.analyze).toBeDefined();
	});

	test("should handle empty content sections", async () => {
		class EmptyContentPlugin extends Plugin {
			constructor() {
				super("empty-content", "Empty Content", "Handle empty content");
				this.dimensions = ["process"];
			}

			createPrompt() {
				return "test";
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;
				// Skip if content is empty or whitespace only
				return section.content.trim().length === 0;
			}
		}

		const plugin = new EmptyContentPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		const result = await engine.process([
			{ content: "", metadata: {} },
			{ content: "   ", metadata: {} },
			{ content: "Has content", metadata: {} },
		]);

		// Should only process the third section
		expect(mockProvider.callCount).toBe(1);

		expect(result.sections[0]?.results.process?.metadata).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipSectionDimension",
		});
		expect(result.sections[1]?.results.process?.metadata).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipSectionDimension",
		});
		expect(result.sections[2]?.results.process?.metadata).not.toHaveProperty(
			"skipped",
		);
	});

	test("should handle very large number of sections with skip logic", async () => {
		class LargeScalePlugin extends Plugin {
			constructor() {
				super("large-scale", "Large Scale", "Handle many sections");
				this.dimensions = ["process"];
			}

			createPrompt() {
				return "test";
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;
				// Skip sections divisible by 5
				return (section.metadata.index as number) % 5 === 0;
			}
		}

		const plugin = new LargeScalePlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			concurrency: 10,
		});

		const sections = Array.from({ length: 100 }, (_, i) => ({
			content: `Section ${i}`,
			metadata: { index: i },
		}));

		const result = await engine.process(sections);

		// Should skip sections: 0, 5, 10, 15, ..., 95 (20 sections)
		// Should process: 80 sections
		expect(mockProvider.callCount).toBe(80);
	});

	test("should handle skip logic with special characters in content", async () => {
		class SpecialCharsPlugin extends Plugin {
			constructor() {
				super("special-chars", "Special Chars", "Handle special characters");
				this.dimensions = ["process"];
			}

			createPrompt() {
				return "test";
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;
				// Skip if contains emoji or special unicode
				return /[\u{1F600}-\u{1F64F}]/u.test(section.content);
			}
		}

		const plugin = new SpecialCharsPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		const result = await engine.process([
			{ content: "Regular text", metadata: {} },
			{ content: "Text with emoji 😀", metadata: {} },
			{ content: "More regular text", metadata: {} },
		]);

		// Should process 2 sections (without emoji)
		expect(mockProvider.callCount).toBe(2);
	});

	test("should handle skip logic with complex metadata structures", async () => {
		class ComplexMetadataPlugin extends Plugin {
			constructor() {
				super(
					"complex-metadata",
					"Complex Metadata",
					"Handle complex metadata",
				);
				this.dimensions = ["process"];
			}

			createPrompt() {
				return "test";
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;
				// Skip based on nested metadata
				const config = section.metadata.config as any;
				if (!config) return false;
				return config.processing?.skip === true;
			}
		}

		const plugin = new ComplexMetadataPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		const result = await engine.process([
			{
				content: "Section 1",
				metadata: { config: { processing: { skip: true } } },
			},
			{
				content: "Section 2",
				metadata: { config: { processing: { skip: false } } },
			},
			{ content: "Section 3", metadata: {} },
		]);

		// Should process sections 2 and 3
		expect(mockProvider.callCount).toBe(2);
	});

	test("should handle skip logic that changes behavior based on previous results", async () => {
		let skipCount = 0;

		class StatefulSkipPlugin extends Plugin {
			constructor() {
				super("stateful-skip", "Stateful Skip", "Stateful skip logic");
				this.dimensions = ["process"];
			}

			createPrompt() {
				return "test";
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;
				// Skip every third call (simulating stateful logic)
				skipCount++;
				return skipCount % 3 === 0;
			}
		}

		const plugin = new StatefulSkipPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		skipCount = 0; // Reset counter
		const result = await engine.process([
			{ content: "Section 1", metadata: {} }, // skipCount=1, don't skip
			{ content: "Section 2", metadata: {} }, // skipCount=2, don't skip
			{ content: "Section 3", metadata: {} }, // skipCount=3, skip
			{ content: "Section 4", metadata: {} }, // skipCount=4, don't skip
			{ content: "Section 5", metadata: {} }, // skipCount=5, don't skip
			{ content: "Section 6", metadata: {} }, // skipCount=6, skip
		]);

		// Should process 4 sections (skip sections 3 and 6)
		expect(mockProvider.callCount).toBe(4);
	});
});

describe("shouldSkipGlobalDimension - Edge Cases", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as any);
	});

	test("should handle global dimension with single section", async () => {
		class SingleSectionGlobalPlugin extends Plugin {
			constructor() {
				super("single-section", "Single Section", "Global with one section");
				this.dimensions = [{ name: "global_summary", scope: "global" }];
			}

			createPrompt() {
				return "test";
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}

			shouldSkipGlobalDimension(context: SectionDimensionContext): boolean {
				const { sections } = context;

				// Skip if only one section
				return sections.length === 1;
			}
		}

		const plugin = new SingleSectionGlobalPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		// Test 1: Single section - skip
		mockProvider.reset();
		await engine.process([{ content: "Only one", metadata: {} }]);
		expect(mockProvider.callCount).toBe(0);

		// Test 2: Multiple sections - process
		mockProvider.reset();
		await engine.process([
			{ content: "First", metadata: {} },
			{ content: "Second", metadata: {} },
		]);
		expect(mockProvider.callCount).toBe(1);
	});

	test("should handle global dimension with all empty sections", async () => {
		class EmptyGlobalPlugin extends Plugin {
			constructor() {
				super("empty-global", "Empty Global", "All sections empty");
				this.dimensions = [{ name: "global_analysis", scope: "global" }];
			}

			createPrompt() {
				return "test";
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}

			shouldSkipGlobalDimension(context: SectionDimensionContext): boolean {
				const { sections } = context;
				// Skip if all sections are empty
				return sections.every((s) => s.content.trim().length === 0);
			}
		}

		const plugin = new EmptyGlobalPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		const result = await engine.process([
			{ content: "", metadata: {} },
			{ content: "   ", metadata: {} },
		]);

		// Should skip
		expect(mockProvider.callCount).toBe(0);
		expect(result.globalResults.global_analysis?.metadata).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipGlobalDimension",
		});
	});

	test("should handle global dimension skip with parallel global group", async () => {
		class ParallelGlobalSkipPlugin extends Plugin {
			constructor() {
				super(
					"parallel-global",
					"Parallel Global",
					"Parallel global dimensions",
				);
				this.dimensions = [
					{ name: "global_A", scope: "global" },
					{ name: "global_B", scope: "global" },
					{ name: "global_C", scope: "global" },
				];
			}

			createPrompt() {
				return "test";
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}

			shouldSkipGlobalDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;
				// Skip global_B
				return dimension === "global_B";
			}
		}

		const plugin = new ParallelGlobalSkipPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		const result = await engine.process([{ content: "Test", metadata: {} }]);

		// Should process global_A and global_C (2 calls)
		expect(mockProvider.callCount).toBe(2);

		// Verify global_B is skipped
		expect(result.globalResults.global_B?.metadata).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipGlobalDimension",
		});
	});

	test("should handle complex aggregate conditions for global skip", async () => {
		class ComplexAggregatePlugin extends Plugin {
			constructor() {
				super("complex-aggregate", "Complex Aggregate", "Complex conditions");
				this.dimensions = [{ name: "advanced_analysis", scope: "global" }];
			}

			createPrompt() {
				return "test";
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}

			shouldSkipGlobalDimension(context: SectionDimensionContext): boolean {
				const { sections } = context;
				// Complex condition: Skip if:
				// - Less than 3 sections, OR
				// - Average length < 50, OR
				// - None contain 'important' keyword
				if (sections.length < 3) return true;

				const avgLength =
					sections.reduce((sum, s) => sum + s.content.length, 0) /
					sections.length;
				if (avgLength < 50) return true;

				const hasImportant = sections.some((s) =>
					s.content.includes("important"),
				);
				return !hasImportant;
			}
		}

		const plugin = new ComplexAggregatePlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		// Test 1: Less than 3 sections - skip
		mockProvider.reset();
		await engine.process([
			{ content: "x".repeat(100), metadata: {} },
			{ content: "x".repeat(100), metadata: {} },
		]);
		expect(mockProvider.callCount).toBe(0);

		// Test 2: Low average length - skip
		mockProvider.reset();
		await engine.process([
			{ content: "short", metadata: {} },
			{ content: "short", metadata: {} },
			{ content: "short", metadata: {} },
		]);
		expect(mockProvider.callCount).toBe(0);

		// Test 3: No 'important' keyword - skip
		mockProvider.reset();
		await engine.process([
			{ content: "x".repeat(100), metadata: {} },
			{ content: "x".repeat(100), metadata: {} },
			{ content: "x".repeat(100), metadata: {} },
		]);
		expect(mockProvider.callCount).toBe(0);

		// Test 4: All conditions met - process
		mockProvider.reset();
		await engine.process([
			{ content: "x".repeat(100) + " important", metadata: {} },
			{ content: "x".repeat(100), metadata: {} },
			{ content: "x".repeat(100), metadata: {} },
		]);
		expect(mockProvider.callCount).toBe(1);
	});
});
