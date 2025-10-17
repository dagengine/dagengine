import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../src/core/engine";
import { Plugin, type ProviderSelection } from "../src/plugin";
import { ProviderRegistry } from "../src/providers/registry";
import { MockAIProvider, createMockSection } from "./setup";

describe("DagEngine - Async Graph Analytics", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("test", { result: "ok" });
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should handle getGraphAnalytics with async dependencies", async () => {
		class AsyncGraphPlugin extends Plugin {
			constructor() {
				super("async-graph", "Async Graph", "Test");
				this.dimensions = ["a", "b", "c", "d"];
			}

			async defineDependencies(): Promise<Record<string, string[]>> {
				await new Promise((resolve) => setTimeout(resolve, 20));
				return {
					b: ["a"],
					c: ["a"],
					d: ["b", "c"],
				};
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new AsyncGraphPlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")]);

		const analytics = await engine.getGraphAnalytics();

		expect(analytics.totalDimensions).toBe(4);
		expect(analytics.totalDependencies).toBe(4);
		expect(analytics.independentDimensions).toContain("a");
		expect(analytics.criticalPath).toContain("a");
		expect(analytics.criticalPath).toContain("d");
	});

	test("should handle exportGraphDOT with async dimensions", async () => {
		class AsyncDOTPlugin extends Plugin {
			constructor() {
				super("async-dot", "Async DOT", "Test");
				this.dimensions = ["input", "process", "output"];
			}

			defineDependencies(): Record<string, string[]> {
				return {
					process: ["input"],
					output: ["process"],
				};
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new AsyncDOTPlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")]);

		const dot = await engine.exportGraphDOT();

		expect(dot).toContain("digraph DagWorkflow");
		expect(dot).toContain('"input"');
		expect(dot).toContain('"process"');
		expect(dot).toContain('"output"');
		expect(dot).toContain('"input" -> "process"');
		expect(dot).toContain('"process" -> "output"');
	});

	test("should handle exportGraphJSON with async dimensions", async () => {
		class AsyncJSONPlugin extends Plugin {
			constructor() {
				super("async-json", "Async JSON", "Test");
				this.dimensions = ["fetch", "transform", "load"];
			}

			defineDependencies(): Record<string, string[]> {
				return {
					transform: ["fetch"],
					load: ["transform"],
				};
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new AsyncJSONPlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")]);

		const graph = await engine.exportGraphJSON();

		expect(graph.nodes).toHaveLength(3);
		expect(graph.links).toHaveLength(2);
		expect(graph.nodes.map((n) => n.id)).toContain("fetch");
		expect(graph.nodes.map((n) => n.id)).toContain("transform");
		expect(graph.nodes.map((n) => n.id)).toContain("load");
	});
});
