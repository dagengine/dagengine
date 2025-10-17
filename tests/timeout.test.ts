import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../src/core/engine/dag-engine.ts";
import { MockAIProvider, createMockSection } from "./setup.ts";
import { ProviderRegistry } from "../src/providers/registry.ts";
import { Plugin } from "../src/plugin.ts";
import type { PromptContext } from "../src/types.ts";

describe("DagEngine - Timeout Handling", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should timeout slow dimensions with global timeout", async () => {
		class SlowPlugin extends Plugin {
			constructor() {
				super("slow", "Slow", "Test timeout");
				this.dimensions = ["slow_dimension"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.delay = 2000; // 2 second delay

		const engine = new DagEngine({
			plugin: new SlowPlugin(),
			registry,
			timeout: 500, // 500ms timeout
			continueOnError: true,
		});

		const result = await engine.process([createMockSection("Test")]);

		const dimensionResult = result.sections[0]?.results.slow_dimension;
		expect(dimensionResult?.error).toBeDefined();
		expect(dimensionResult?.error).toContain(
			'Dimension "slow_dimension" timed out after 500ms',
		);
	});

	test("should respect per-dimension timeout", async () => {
		class TimeoutPlugin extends Plugin {
			constructor() {
				super("timeout", "Timeout", "Test");
				this.dimensions = ["fast", "slow"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.setMockResponse("fast", { result: "fast" });
		mockProvider.setMockResponse("slow", { result: "slow" });

		const engine = new DagEngine({
			plugin: new TimeoutPlugin(),
			registry,
			timeout: 5000,
			dimensionTimeouts: {
				slow: 100, // Only 100ms for slow dimension
			},
			continueOnError: true,
		});

		mockProvider.delay = 200; // 200ms delay

		const result = await engine.process([createMockSection("Test")]);

		// Fast should succeed (has 5000ms timeout)
		const fastResult = result.sections[0]?.results.fast;
		expect(fastResult).toBeDefined();

		// Slow should timeout (has 100ms timeout, but provider takes 200ms)
		const slowResult = result.sections[0]?.results.slow;
		expect(slowResult?.error).toBeDefined();
		expect(slowResult?.error).toContain(
			'Dimension "slow" timed out after 100ms',
		);
	});

	test("should not timeout fast dimensions", async () => {
		class FastPlugin extends Plugin {
			constructor() {
				super("fast", "Fast", "Test");
				this.dimensions = ["fast_dimension"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.delay = 50; // 50ms delay
		mockProvider.setMockResponse("test", { result: "success" });

		const engine = new DagEngine({
			plugin: new FastPlugin(),
			registry,
			timeout: 1000, // 1 second timeout
			continueOnError: false,
		});

		const result = await engine.process([createMockSection("Test")]);

		const dimensionResult = result.sections[0]?.results.fast_dimension;
		expect(dimensionResult?.data).toBeDefined();
		expect(dimensionResult?.error).toBeUndefined();
	});

	test("should handle timeout for specific sections", async () => {
		class SectionTimeoutPlugin extends Plugin {
			constructor() {
				super("section-timeout", "Section Timeout", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.delay = 300; // 300ms delay

		const engine = new DagEngine({
			plugin: new SectionTimeoutPlugin(),
			registry,
			timeout: 200, // 200ms timeout
			continueOnError: true,
		});

		const result = await engine.process([
			createMockSection("Section 1"),
			createMockSection("Section 2"),
			createMockSection("Section 3"),
		]);

		// All sections should timeout
		result.sections.forEach((section) => {
			const testResult = section.results.test;
			expect(testResult?.error).toBeDefined();
			expect(testResult?.error).toContain("timed out");
		});
	});

	test("should use dimension-specific timeout over global timeout", async () => {
		class OverrideTimeoutPlugin extends Plugin {
			constructor() {
				super("override", "Override", "Test");
				this.dimensions = ["dimension1", "dimension2"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.setMockResponse("dimension1", { result: "ok" });
		mockProvider.setMockResponse("dimension2", { result: "ok" });
		mockProvider.delay = 150; // 150ms delay

		const engine = new DagEngine({
			plugin: new OverrideTimeoutPlugin(),
			registry,
			timeout: 1000, // Global timeout: 1 second
			dimensionTimeouts: {
				dimension1: 100, // dimension1: 100ms (should timeout)
				// dimension2: uses global timeout (should succeed)
			},
			continueOnError: true,
		});

		const result = await engine.process([createMockSection("Test")]);

		// dimension1 should timeout (100ms < 150ms delay)
		const dim1Result = result.sections[0]?.results.dimension1;
		expect(dim1Result?.error).toBeDefined();
		expect(dim1Result?.error).toContain("timed out after 100ms");

		// dimension2 should succeed (1000ms > 150ms delay)
		const dim2Result = result.sections[0]?.results.dimension2;
		expect(dim2Result?.data).toBeDefined();
		expect(dim2Result?.error).toBeUndefined();
	});
});