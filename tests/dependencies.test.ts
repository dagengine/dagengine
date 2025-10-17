import { DagEngine } from "../src";

import { MockAIProvider, createMockSection } from "./setup";
import { ProviderRegistry } from "../src/providers/registry";
import { Plugin } from "../src/plugin";

describe("DagEngine - Dependencies", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should execute dimensions in dependency order", async () => {
		const executionOrder: string[] = [];

		class DependencyPlugin extends Plugin {
			constructor() {
				super("dep", "Dependency Plugin", "Test dependencies");
				this.dimensions = ["base", "dependent", "final"];
			}

			createPrompt(context: any): string {
				executionOrder.push(context.dimension);
				return `Process ${context.dimension}`;
			}

			selectProvider(): any {
				return { provider: "mock-ai" };
			}

			defineDependencies(): Record<string, string[]> {
				return {
					dependent: ["base"],
					final: ["dependent"],
				};
			}
		}

		const engine = new DagEngine({
			plugin: new DependencyPlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")]);

		expect(executionOrder).toEqual(["base", "dependent", "final"]);
	});

	test("should detect circular dependencies", () => {
		class CircularPlugin extends Plugin {
			constructor() {
				super("circular", "Circular", "Test circular deps");
				this.dimensions = ["a", "b", "c"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): any {
				return { provider: "mock-ai" };
			}

			defineDependencies(): Record<string, string[]> {
				return {
					a: ["b"],
					b: ["c"],
					c: ["a"], // Circular!
				};
			}
		}

		const engine = new DagEngine({
			plugin: new CircularPlugin(),
			registry,
		});

		expect(engine.process([createMockSection("Test")])).rejects.toThrow(
			"Circular dependency",
		);
	});

	test("should provide dependencies to dependent dimensions", async () => {
		let receivedDeps: any = null;

		class DepsPlugin extends Plugin {
			constructor() {
				super("deps", "Deps", "Test deps");
				this.dimensions = ["first", "second"];
			}

			createPrompt(context: any): string {
				if (context.dimension === "second") {
					receivedDeps = context.dependencies;
				}
				return `Process ${context.dimension}`;
			}

			selectProvider(): any {
				return { provider: "mock-ai" };
			}

			defineDependencies(): Record<string, string[]> {
				return { second: ["first"] };
			}
		}

		mockProvider.setMockResponse("Process first", { result: "first result" });

		const engine = new DagEngine({
			plugin: new DepsPlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")]);

		expect(receivedDeps).toBeDefined();
		expect(receivedDeps.first).toBeDefined();
		expect(receivedDeps.first.data).toEqual({ result: "first result" });
	});
});
