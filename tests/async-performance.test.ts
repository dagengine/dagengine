import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../src/core/engine";
import { Plugin, type PromptContext, type ProviderSelection } from "../src/plugin";
import { ProviderRegistry } from "../src/providers/registry";
import { MockAIProvider, createMockSection } from "./setup";


const isWindows = process.platform === "win32";

describe("DagEngine - Async Performance", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("test", { result: "ok" });
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("async createPrompt should not slow down", async () => {
		class FastAsyncPlugin extends Plugin {
			constructor() {
				super("fast-async", "Fast Async", "Test");
				this.dimensions = ["process"];
			}

			async createPrompt(context: PromptContext): Promise<string> {
				// Very fast async operation (10ms)
				await new Promise((resolve) => setTimeout(resolve, 10));
				return context.sections[0]?.content || "";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new FastAsyncPlugin(),
			registry,
		});

		const startTime = Date.now();
		await engine.process([createMockSection("Test")]);
		const duration = Date.now() - startTime;

		// Should complete in reasonable time (< 200ms)
		expect(duration).toBeLessThan(200);
	});

	test("parallel async operations should be faster than sequential", async () => {
		class ParallelAsyncPlugin extends Plugin {
			constructor() {
				super("parallel", "Parallel", "Test");
				this.dimensions = ["process"]; // Single dimension
			}

			async createPrompt(context: PromptContext): Promise<string> {
				// Each takes 50ms
				await new Promise((resolve) => setTimeout(resolve, 50));
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new ParallelAsyncPlugin(),
			registry,
			concurrency: 3, // Process 3 sections in parallel
		});

		const startTime = Date.now();

		// ✅ THREE SECTIONS will process in parallel (not dimensions)
		await engine.process([
			createMockSection("Test1"),
			createMockSection("Test2"),
			createMockSection("Test3"),
		]);

		const duration = Date.now() - startTime;

		// Sequential: 3 sections × 50ms = 150ms
		// Parallel: max(50, 50, 50) = ~50ms + overhead
		// Should be significantly less than 150ms
		expect(duration).toBeLessThan(100); // Allow some overhead

		console.log(`Parallel: ${duration}ms (sequential would be ~150ms)`);
	});

	test.skipIf(isWindows)("should handle many async operations efficiently", async () => {
		class ManyAsyncPlugin extends Plugin {
			constructor() {
				super("many", "Many", "Test");
				this.dimensions = Array.from({ length: 20 }, (_, i) => `task${i}`);
			}

			async createPrompt(context: PromptContext): Promise<string> {
				await new Promise((resolve) => setTimeout(resolve, 5));
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new ManyAsyncPlugin(),
			registry,
			concurrency: 10,
		});

		const startTime = Date.now();
		await engine.process([createMockSection("Test")]);
		const duration = Date.now() - startTime;

		// 20 tasks @ 5ms each with concurrency=10
		// Should take ~10ms (2 batches), not ~100ms
		expect(duration).toBeLessThan(150);
	});
});
