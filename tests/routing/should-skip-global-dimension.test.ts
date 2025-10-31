import { describe, test, expect, beforeEach, vi, afterEach, type MockInstance } from "vitest";
import { DagEngine } from "../../src/core/engine/dag-engine.ts";
import { Plugin } from "../../src/plugin.ts";
import { ProviderAdapter } from "../../src/providers/adapter.ts";
import type {
	SectionDimensionContext,
	ProviderResponse,
	ProviderSelection,
} from "../../src/types.ts";

/**
 * Mock provider for testing
 */
class MockProvider {
	name = "mock";
	callLog: string[] = [];

	async execute(_options: { [key: string]: unknown }): Promise<ProviderResponse> {
		this.callLog.push("called");
		return {
			data: { result: "mock result" },
			metadata: {
				model: "test-model",
				provider: "mock",
				tokens: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
			},
		};
	}

	reset(): void {
		this.callLog = [];
	}

	getTotalCalls(): number {
		return this.callLog.length;
	}
}

describe("shouldSkipGlobalDimension - Basic Functionality", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as never);
	});

	test("should process global dimension when shouldSkipGlobalDimension not defined", async () => {
		class NoSkipGlobalPlugin extends Plugin {
			constructor() {
				super("no-skip-global", "No Skip Global", "No global skip logic");
				this.dimensions = [{ name: "global_summary", scope: "global" }];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}
		}

		const plugin = new NoSkipGlobalPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		const sections = [
			{ content: "Section 1", metadata: {} },
			{ content: "Section 2", metadata: {} },
		];

		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(1);
	});

	test("should skip global dimension when shouldSkipGlobalDimension returns true", async () => {
		class GlobalSkipPlugin extends Plugin {
			constructor() {
				super("global-skip", "Global Skip", "Global skip test");
				this.dimensions = [
					{ name: "global_summary", scope: "global" },
					{ name: "global_analysis", scope: "global" },
				];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipGlobalDimension(context: SectionDimensionContext): boolean {
				const { dimension } = context;
				return dimension === "global_analysis";
			}
		}

		const plugin = new GlobalSkipPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		const sections = [
			{ content: "Section 1", metadata: {} },
			{ content: "Section 2", metadata: {} },
		];

		mockProvider.reset();
		const result = await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(1);

		expect(result.globalResults.global_analysis?.metadata).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipGlobalDimension",
		});
	});

	test("should skip global dimension if all sections are too short", async () => {
		class LengthBasedGlobalPlugin extends Plugin {
			constructor() {
				super("length-based", "Length Based", "Skip if all sections short");
				this.dimensions = [{ name: "overall_summary", scope: "global" }];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipGlobalDimension(context: SectionDimensionContext): boolean {
				const { dimension, sections } = context;

				if (dimension === "overall_summary") {
					return sections.every((s) => s.content.length < 50);
				}
				return false;
			}
		}

		const plugin = new LengthBasedGlobalPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		mockProvider.reset();
		await engine.process([
			{ content: "Short", metadata: {} },
			{ content: "Also short", metadata: {} },
		]);
		expect(mockProvider.getTotalCalls()).toBe(0);

		mockProvider.reset();
		await engine.process([
			{ content: "Short", metadata: {} },
			{ content: "x".repeat(100), metadata: {} },
		]);
		expect(mockProvider.getTotalCalls()).toBe(1);
	});

	test("should skip global dimension based on section count", async () => {
		class CountBasedGlobalPlugin extends Plugin {
			constructor() {
				super("count-based", "Count Based", "Skip based on count");
				this.dimensions = [{ name: "cross_reference", scope: "global" }];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipGlobalDimension(context: SectionDimensionContext): boolean {
				const { dimension, sections } = context;
				if (dimension === "cross_reference") {
					return sections.length < 3;
				}
				return false;
			}
		}

		const plugin = new CountBasedGlobalPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		mockProvider.reset();
		await engine.process([
			{ content: "Section 1", metadata: {} },
			{ content: "Section 2", metadata: {} },
		]);
		expect(mockProvider.getTotalCalls()).toBe(0);

		mockProvider.reset();
		await engine.process([
			{ content: "Section 1", metadata: {} },
			{ content: "Section 2", metadata: {} },
			{ content: "Section 3", metadata: {} },
		]);
		expect(mockProvider.getTotalCalls()).toBe(1);
	});

	test("should skip global dimension based on metadata flag", async () => {
		class MetadataBasedGlobalPlugin extends Plugin {
			constructor() {
				super("metadata-global", "Metadata Global", "Metadata-based skip");
				this.dimensions = [{ name: "expensive_global", scope: "global" }];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipGlobalDimension(context: SectionDimensionContext): boolean {
				const { dimension, sections } = context;

				if (dimension === "expensive_global") {
					return sections.some(
						(s) =>
							(s.metadata as { skipExpensive?: boolean }).skipExpensive === true,
					);
				}
				return false;
			}
		}

		const plugin = new MetadataBasedGlobalPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		mockProvider.reset();
		await engine.process([{ content: "Test", metadata: {} }]);
		expect(mockProvider.getTotalCalls()).toBe(1);

		mockProvider.reset();
		await engine.process([
			{ content: "Test", metadata: {} },
			{ content: "Test2", metadata: { skipExpensive: true } },
		]);
		expect(mockProvider.getTotalCalls()).toBe(0);
	});

	test("should handle async shouldSkipGlobalDimension", async () => {
		class AsyncGlobalSkipPlugin extends Plugin {
			constructor() {
				super("async-global", "Async Global", "Async global skip");
				this.dimensions = [{ name: "global_dim", scope: "global" }];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			async shouldSkipGlobalDimension(
				context: SectionDimensionContext,
			): Promise<boolean> {
				const { sections } = context;

				await new Promise<void>((resolve) => setTimeout(resolve, 10));
				return sections.length < 2;
			}
		}

		const plugin = new AsyncGlobalSkipPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		mockProvider.reset();
		await engine.process([{ content: "Only one", metadata: {} }]);
		expect(mockProvider.getTotalCalls()).toBe(0);
	});

	test("should work with both section and global skip logic", async () => {
		class CombinedSkipPlugin extends Plugin {
			constructor() {
				super("combined", "Combined Skip", "Both section and global skip");
				this.dimensions = [
					"section_dim",
					{ name: "global_dim", scope: "global" },
				];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { section } = context;
				return section.content.length < 10;
			}

			shouldSkipGlobalDimension(context: SectionDimensionContext): boolean {
				const { sections } = context;
				return sections.length < 2;
			}
		}

		const plugin = new CombinedSkipPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		mockProvider.reset();
		await engine.process([
			{ content: "Hi", metadata: {} },
			{ content: "Long enough content", metadata: {} },
		]);

		expect(mockProvider.getTotalCalls()).toBe(2);
	});

	test("should skip multiple global dimensions independently", async () => {
		class MultiGlobalSkipPlugin extends Plugin {
			constructor() {
				super("multi-global", "Multi Global", "Skip multiple global dims");
				this.dimensions = [
					{ name: "global_A", scope: "global" },
					{ name: "global_B", scope: "global" },
					{ name: "global_C", scope: "global" },
				];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipGlobalDimension(context: SectionDimensionContext): boolean {
				const { dimension } = context;
				return dimension === "global_A" || dimension === "global_C";
			}
		}

		const plugin = new MultiGlobalSkipPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		mockProvider.reset();
		const result = await engine.process([{ content: "Test", metadata: {} }]);

		expect(mockProvider.getTotalCalls()).toBe(1);

		expect(result.globalResults.global_A?.metadata).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipGlobalDimension",
		});
		expect(result.globalResults.global_C?.metadata).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipGlobalDimension",
		});
	});
});

describe("shouldSkipGlobalDimension - Advanced Scenarios", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as never);
	});

	test("should skip based on aggregate statistics", async () => {
		class AggregateBasedPlugin extends Plugin {
			constructor() {
				super("aggregate", "Aggregate Based", "Skip based on aggregate stats");
				this.dimensions = [{ name: "statistical_analysis", scope: "global" }];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipGlobalDimension(context: SectionDimensionContext): boolean {
				const { sections, dimension } = context;

				if (dimension === "statistical_analysis") {
					const avgLength =
						sections.reduce((sum, s) => sum + s.content.length, 0) /
						sections.length;
					return avgLength < 100;
				}
				return false;
			}
		}

		const plugin = new AggregateBasedPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		mockProvider.reset();
		await engine.process([
			{ content: "x".repeat(50), metadata: {} },
			{ content: "x".repeat(50), metadata: {} },
		]);
		expect(mockProvider.getTotalCalls()).toBe(0);

		mockProvider.reset();
		await engine.process([
			{ content: "x".repeat(150), metadata: {} },
			{ content: "x".repeat(150), metadata: {} },
		]);
		expect(mockProvider.getTotalCalls()).toBe(1);
	});

	test("should skip based on content type distribution", async () => {
		class DistributionBasedPlugin extends Plugin {
			constructor() {
				super(
					"distribution",
					"Distribution Based",
					"Skip based on content types",
				);
				this.dimensions = [{ name: "code_summary", scope: "global" }];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipGlobalDimension(context: SectionDimensionContext): boolean {
				const { sections, dimension } = context;

				if (dimension === "code_summary") {
					const codeCount = sections.filter((s) =>
						/function|class/.test(s.content),
					).length;
					return codeCount < sections.length * 0.5;
				}
				return false;
			}
		}

		const plugin = new DistributionBasedPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		mockProvider.reset();
		await engine.process([
			{ content: "function test() {}", metadata: {} },
			{ content: "plain text", metadata: {} },
			{ content: "more text", metadata: {} },
		]);
		expect(mockProvider.getTotalCalls()).toBe(0);

		mockProvider.reset();
		await engine.process([
			{ content: "function test() {}", metadata: {} },
			{ content: "class MyClass {}", metadata: {} },
			{ content: "plain text", metadata: {} },
		]);
		expect(mockProvider.getTotalCalls()).toBe(1);
	});
});

describe("shouldSkipGlobalDimension - Error Handling", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;
	let consoleErrorSpy: MockInstance;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as never);
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	test("should handle errors in shouldSkipGlobalDimension gracefully", async () => {
		class ErrorGlobalPlugin extends Plugin {
			constructor() {
				super("error-global", "Error Global", "Error in global skip");
				this.dimensions = [{ name: "global_dim", scope: "global" }];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipGlobalDimension(): boolean {
				throw new Error("Error in shouldSkipGlobalDimension");
			}
		}

		const plugin = new ErrorGlobalPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		await expect(
			engine.process([{ content: "Test", metadata: {} }]),
		).resolves.toBeDefined();

		expect(consoleErrorSpy).toHaveBeenCalled();
		expect(mockProvider.getTotalCalls()).toBe(1);
	});

	test("should handle async errors in shouldSkipGlobalDimension", async () => {
		class AsyncErrorGlobalPlugin extends Plugin {
			constructor() {
				super(
					"async-error-global",
					"Async Error Global",
					"Async error in global skip",
				);
				this.dimensions = [{ name: "global_dim", scope: "global" }];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			async shouldSkipGlobalDimension(): Promise<boolean> {
				await new Promise<void>((resolve) => setTimeout(resolve, 5));
				throw new Error("Async error");
			}
		}

		const plugin = new AsyncErrorGlobalPlugin();
		const engine = new DagEngine({ plugin, providers: adapter });

		await expect(
			engine.process([{ content: "Test", metadata: {} }]),
		).resolves.toBeDefined();

		expect(consoleErrorSpy).toHaveBeenCalled();
		expect(mockProvider.getTotalCalls()).toBe(1);
	});
});

describe("shouldSkipGlobalDimension - Integration", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as never);
	});

	test("should work with cost tracking for global dimensions", async () => {
		class CostTrackingGlobalPlugin extends Plugin {
			constructor() {
				super("cost-global", "Cost Global", "Cost tracking with global skip");
				this.dimensions = [
					{ name: "expensive_global", scope: "global" },
					{ name: "cheap_global", scope: "global" },
				];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipGlobalDimension(context: SectionDimensionContext): boolean {
				const { sections, dimension } = context;

				if (dimension === "expensive_global") {
					return sections.some(
						(s) =>
							(s.metadata as { skipExpensive?: boolean }).skipExpensive === true,
					);
				}
				return false;
			}
		}

		const plugin = new CostTrackingGlobalPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: {
				models: {
					"test-model": { inputPer1M: 1.0, outputPer1M: 2.0 },
				},
			},
		});

		const sections = [
			{ content: "Section 1", metadata: {} },
			{ content: "Section 2", metadata: { skipExpensive: true } },
		];

		const result = await engine.process(sections);

		expect(result.costs).toBeDefined();
		expect(result.costs!.byDimension).toHaveProperty("cheap_global");
		expect(result.costs!.byDimension).not.toHaveProperty("expensive_global");
	});

	test("should work with global dimensions that have dependencies", async () => {
		class DependentGlobalPlugin extends Plugin {
			constructor() {
				super("dep-global", "Dependent Global", "Global with dependencies");
				this.dimensions = [
					{ name: "global_A", scope: "global" },
					{ name: "global_B", scope: "global" },
				];
			}

			defineDependencies(): Record<string, string[]> {
				return {
					global_B: ["global_A"],
				};
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipGlobalDimension(context: SectionDimensionContext): boolean {
				const { dimension } = context;
				return dimension === "global_A";
			}
		}

		const plugin = new DependentGlobalPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			continueOnError: true,
		});

		const result = await engine.process([{ content: "Test", metadata: {} }]);

		expect(result.globalResults.global_A?.metadata).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipGlobalDimension",
		});

		expect(result.globalResults.global_B).toBeDefined();
	});
});