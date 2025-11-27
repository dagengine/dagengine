import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../src/core/engine/dag-engine.ts";
import { Plugin } from "../src/plugin.ts";
import { ProviderRegistry } from "../src/providers/registry.ts";
import { MockAIProvider, createMockSection } from "./setup.ts";
import type {
	ProviderSelection,
	ProviderRequest,
	ProviderResponse,
} from "../src/types.ts";

describe("DagEngine - Parallel Section Dimensions", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("test", { result: "ok" });
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should execute independent section dimensions in parallel", async () => {
		class ParallelDimensionsPlugin extends Plugin {
			constructor() {
				super("parallel", "Parallel Dimensions", "Test");
				this.dimensions = ["dim_a", "dim_b", "dim_c"];
			}

			// No dependencies = all dimensions can run in parallel
			defineDependencies(): Record<string, string[]> {
				return {};
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const dimensionStartTimes: Record<string, number> = {};
		const dimensionEndTimes: Record<string, number> = {};

		mockProvider.execute = async (request: ProviderRequest): Promise<ProviderResponse> => {
			const dimension = request.dimension || "unknown";

			if (!dimensionStartTimes[dimension]) {
				dimensionStartTimes[dimension] = Date.now();
			}

			// Each dimension takes 100ms
			await new Promise<void>((resolve) => setTimeout(resolve, 100));

			dimensionEndTimes[dimension] = Date.now();

			return { data: { result: "ok" } };
		};

		const engine = new DagEngine({
			plugin: new ParallelDimensionsPlugin(),
			registry,
			concurrency: 10,
		});

		const sections = [createMockSection("Content 1")];

		const startTime = Date.now();
		await engine.process(sections);
		const totalTime = Date.now() - startTime;

		// All 3 dimensions should start within 50ms of each other (parallel)
		const startTimes = Object.values(dimensionStartTimes);
		const startSpread = Math.max(...startTimes) - Math.min(...startTimes);

		expect(startSpread).toBeLessThan(50); // All started nearly simultaneously

		// Total time should be ~100ms (parallel), not ~300ms (sequential)
		expect(totalTime).toBeLessThan(200); // Allow some overhead
	});

	test("should execute multiple independent dimensions in parallel with multiple sections", async () => {
		class MultiSectionParallelPlugin extends Plugin {
			constructor() {
				super("multi-parallel", "Multi Section Parallel", "Test");
				this.dimensions = ["sentiment", "topics", "keywords"];
			}

			defineDependencies(): Record<string, string[]> {
				return {}; // All independent
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const activeCalls: number[] = [];
		let currentActive = 0;
		let maxActive = 0;

		mockProvider.execute = async (_request: ProviderRequest): Promise<ProviderResponse> => {
			currentActive++;
			maxActive = Math.max(maxActive, currentActive);
			activeCalls.push(currentActive);

			await new Promise<void>((resolve) => setTimeout(resolve, 50));

			currentActive--;
			return { data: { result: "ok" } };
		};

		const engine = new DagEngine({
			plugin: new MultiSectionParallelPlugin(),
			registry,
			concurrency: 20,
		});

		// 3 sections × 3 dimensions = 9 total tasks
		const sections = Array.from({ length: 3 }, (_, i) =>
			createMockSection(`Content ${i}`)
		);

		await engine.process(sections);

		// With parallel dimensions, we should see high concurrency
		// All 9 tasks (3 dimensions × 3 sections) should be able to run together
		expect(maxActive).toBeGreaterThan(3); // More than just 1 dimension's sections
	});

	test("should respect dependency order while parallelizing independent dimensions", async () => {
		class DependencyOrderPlugin extends Plugin {
			constructor() {
				super("dep-order", "Dependency Order", "Test");
				this.dimensions = ["base_a", "base_b", "dependent"];
			}

			defineDependencies(): Record<string, string[]> {
				return {
					// base_a and base_b are independent (can run in parallel)
					// dependent requires both base_a and base_b
					dependent: ["base_a", "base_b"],
				};
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const executionOrder: string[] = [];
		const dimensionCompleteTimes: Record<string, number> = {};

		mockProvider.execute = async (request: ProviderRequest): Promise<ProviderResponse> => {
			const dimension = request.dimension || "unknown";

			await new Promise<void>((resolve) => setTimeout(resolve, 50));

			executionOrder.push(dimension);
			dimensionCompleteTimes[dimension] = Date.now();

			return { data: { result: "ok" } };
		};

		const engine = new DagEngine({
			plugin: new DependencyOrderPlugin(),
			registry,
			concurrency: 10,
		});

		const sections = [createMockSection("Content 1")];

		await engine.process(sections);

		// "dependent" should always come after both "base_a" and "base_b"
		const dependentIndex = executionOrder.indexOf("dependent");
		const baseAIndex = executionOrder.indexOf("base_a");
		const baseBIndex = executionOrder.indexOf("base_b");

		expect(dependentIndex).toBeGreaterThan(baseAIndex);
		expect(dependentIndex).toBeGreaterThan(baseBIndex);

		// base_a and base_b should complete before dependent starts
		// (their completion times should be less than dependent's completion time minus its duration)
	});

	test("should parallelize dimensions in same execution group", async () => {
		class SameGroupPlugin extends Plugin {
			constructor() {
				super("same-group", "Same Group", "Test");
				this.dimensions = ["dim_1", "dim_2", "dim_3", "dim_4", "dim_5"];
			}

			defineDependencies(): Record<string, string[]> {
				return {}; // All in same group (no dependencies)
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const dimensionStartTimes: Record<string, number> = {};

		mockProvider.execute = async (request: ProviderRequest): Promise<ProviderResponse> => {
			const dimension = request.dimension || "unknown";

			if (!dimensionStartTimes[dimension]) {
				dimensionStartTimes[dimension] = Date.now();
			}

			await new Promise<void>((resolve) => setTimeout(resolve, 100));

			return { data: { result: "ok" } };
		};

		const engine = new DagEngine({
			plugin: new SameGroupPlugin(),
			registry,
			concurrency: 10,
		});

		const sections = [createMockSection("Content 1")];

		const startTime = Date.now();
		await engine.process(sections);
		const totalTime = Date.now() - startTime;

		// All 5 dimensions should start within 50ms (parallel)
		const startTimes = Object.values(dimensionStartTimes);
		const startSpread = Math.max(...startTimes) - Math.min(...startTimes);

		expect(startSpread).toBeLessThan(50);

		// Total time should be ~100ms (parallel), not ~500ms (sequential)
		expect(totalTime).toBeLessThan(200);
	});

	test("should handle 10 independent dimensions in parallel", async () => {
		class TenDimensionsPlugin extends Plugin {
			constructor() {
				super("ten-dims", "Ten Dimensions", "Test");
				this.dimensions = [
					"dim_01", "dim_02", "dim_03", "dim_04", "dim_05",
					"dim_06", "dim_07", "dim_08", "dim_09", "dim_10",
				];
			}

			defineDependencies(): Record<string, string[]> {
				return {};
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const dimensionStartTimes: Record<string, number> = {};
		let maxConcurrent = 0;
		let currentConcurrent = 0;

		mockProvider.execute = async (request: ProviderRequest): Promise<ProviderResponse> => {
			const dimension = request.dimension || "unknown";

			currentConcurrent++;
			maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

			if (!dimensionStartTimes[dimension]) {
				dimensionStartTimes[dimension] = Date.now();
			}

			await new Promise<void>((resolve) => setTimeout(resolve, 100));

			currentConcurrent--;

			return { data: { result: "ok" } };
		};

		const engine = new DagEngine({
			plugin: new TenDimensionsPlugin(),
			registry,
			concurrency: 20,
		});

		const sections = [createMockSection("Content 1")];

		const startTime = Date.now();
		await engine.process(sections);
		const totalTime = Date.now() - startTime;

		// All 10 should run concurrently
		expect(maxConcurrent).toBe(10);

		// All should start within 100ms of each other
		const startTimes = Object.values(dimensionStartTimes);
		const startSpread = Math.max(...startTimes) - Math.min(...startTimes);
		expect(startSpread).toBeLessThan(100);

		// Total time ~100ms (parallel), not ~1000ms (sequential)
		expect(totalTime).toBeLessThan(250);
	});

	test("should still respect concurrency limit across parallel dimensions", async () => {
		class ConcurrencyLimitPlugin extends Plugin {
			constructor() {
				super("conc-limit", "Concurrency Limit", "Test");
				this.dimensions = ["dim_a", "dim_b", "dim_c"];
			}

			defineDependencies(): Record<string, string[]> {
				return {};
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		let maxConcurrent = 0;
		let currentConcurrent = 0;

		mockProvider.execute = async (_request: ProviderRequest): Promise<ProviderResponse> => {
			currentConcurrent++;
			maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

			await new Promise<void>((resolve) => setTimeout(resolve, 50));

			currentConcurrent--;

			return { data: { result: "ok" } };
		};

		const engine = new DagEngine({
			plugin: new ConcurrencyLimitPlugin(),
			registry,
			concurrency: 2, // Limit to 2
		});

		// 5 sections × 3 dimensions = 15 total tasks
		const sections = Array.from({ length: 5 }, (_, i) =>
			createMockSection(`Content ${i}`)
		);

		await engine.process(sections);

		// Should never exceed concurrency limit of 2
		expect(maxConcurrent).toBeLessThanOrEqual(2);
	});

	test("should measure parallel efficiency correctly", async () => {
		class EfficiencyPlugin extends Plugin {
			constructor() {
				super("efficiency", "Efficiency", "Test");
				this.dimensions = ["fast", "medium", "slow"];
			}

			defineDependencies(): Record<string, string[]> {
				return {};
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const durations: Record<string, number> = {
			fast: 50,
			medium: 100,
			slow: 150,
		};

		mockProvider.execute = async (request: ProviderRequest): Promise<ProviderResponse> => {
			const dimension = request.dimension || "unknown";
			const delay = durations[dimension] || 50;

			await new Promise<void>((resolve) => setTimeout(resolve, delay));

			return { data: { result: "ok" } };
		};

		const engine = new DagEngine({
			plugin: new EfficiencyPlugin(),
			registry,
			concurrency: 10,
		});

		const sections = [createMockSection("Content 1")];

		const startTime = Date.now();
		await engine.process(sections);
		const totalTime = Date.now() - startTime;

		// Sequential would be 50 + 100 + 150 = 300ms
		// Parallel should be ~150ms (slowest dimension)
		const sequentialTime = 50 + 100 + 150;
		const parallelEfficiency = sequentialTime / totalTime;

		// Should achieve at least 1.5x efficiency (parallel)
		expect(parallelEfficiency).toBeGreaterThan(1.5);
		expect(totalTime).toBeLessThan(250); // ~150ms + overhead
	});

	test("should handle mixed global and section dimensions in parallel", async () => {
		class MixedScopePlugin extends Plugin {
			constructor() {
				super("mixed", "Mixed Scope", "Test");
				this.dimensions = [
					{ name: "global_dim", scope: "global" as const },
					"section_dim_a",
					"section_dim_b",
				];
			}

			defineDependencies(): Record<string, string[]> {
				return {};
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const executionLog: Array<{ dimension: string; type: string; time: number }> = [];
		const startTime = Date.now();

		mockProvider.execute = async (request: ProviderRequest): Promise<ProviderResponse> => {
			const dimension = request.dimension || "unknown";
			const isGlobal = request.isGlobal;

			executionLog.push({
				dimension,
				type: isGlobal ? "global" : "section",
				time: Date.now() - startTime,
			});

			await new Promise<void>((resolve) => setTimeout(resolve, 50));

			return { data: { result: "ok" } };
		};

		const engine = new DagEngine({
			plugin: new MixedScopePlugin(),
			registry,
			concurrency: 10,
		});

		const sections = Array.from({ length: 2 }, (_, i) =>
			createMockSection(`Content ${i}`)
		);

		await engine.process(sections);

		// Should have: 1 global + 2 sections × 2 section dims = 5 total
		expect(executionLog.length).toBe(5);

		// All should start within a reasonable window (parallel)
		const times = executionLog.map((e) => e.time);
		const spread = Math.max(...times) - Math.min(...times);
		expect(spread).toBeLessThan(100);
	});

	test("should correctly track onDimensionStart for parallel dimensions", async () => {
		class CallbackTrackingPlugin extends Plugin {
			constructor() {
				super("callback", "Callback Tracking", "Test");
				this.dimensions = ["dim_a", "dim_b", "dim_c"];
			}

			defineDependencies(): Record<string, string[]> {
				return {};
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.execute = async (_request: ProviderRequest): Promise<ProviderResponse> => {
			await new Promise<void>((resolve) => setTimeout(resolve, 50));
			return { data: { result: "ok" } };
		};

		const engine = new DagEngine({
			plugin: new CallbackTrackingPlugin(),
			registry,
			concurrency: 10,
		});

		const sections = [createMockSection("Content 1")];

		const dimensionStarts: Array<{ dimension: string; time: number }> = [];
		const dimensionCompletes: Array<{ dimension: string; time: number }> = [];
		const startTime = Date.now();

		await engine.process(sections, {
			onDimensionStart: (dimension: string) => {
				dimensionStarts.push({ dimension, time: Date.now() - startTime });
			},
			onDimensionComplete: (dimension: string) => {
				dimensionCompletes.push({ dimension, time: Date.now() - startTime });
			},
		});

		// All 3 dimensions should have started
		expect(dimensionStarts.length).toBe(3);
		expect(dimensionCompletes.length).toBe(3);

		// All should start within 50ms (parallel)
		const startTimes = dimensionStarts.map((d) => d.time);
		const startSpread = Math.max(...startTimes) - Math.min(...startTimes);
		expect(startSpread).toBeLessThan(50);
	});
});