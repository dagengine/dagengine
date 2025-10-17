import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../src/core/engine/dag-engine.ts";
import { MockAIProvider, createMockSection } from "./setup.ts";
import { ProviderRegistry } from "../src/providers/registry.ts";
import { Plugin } from "../src/plugin.ts";
import type {
	PromptContext,
	ProviderSelection,
	DimensionDependencies,
} from "../src/types.ts";

/**
 * First dimension result structure
 */
interface FirstDimensionResult {
	result: string;
}

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

			createPrompt(context: PromptContext): string {
				executionOrder.push(context.dimension);
				return `Process ${context.dimension}`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
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

	test("should detect circular dependencies", async () => {
		class CircularPlugin extends Plugin {
			constructor() {
				super("circular", "Circular", "Test circular deps");
				this.dimensions = ["a", "b", "c"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
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

		await expect(engine.process([createMockSection("Test")])).rejects.toThrow(
			"Circular dependency",
		);
	});

	test("should provide dependencies to dependent dimensions", async () => {
		let receivedDeps: DimensionDependencies | null = null;

		class DepsPlugin extends Plugin {
			constructor() {
				super("deps", "Deps", "Test deps");
				this.dimensions = ["first", "second"];
			}

			createPrompt(context: PromptContext): string {
				if (context.dimension === "second") {
					receivedDeps = context.dependencies;
				}
				return `Process ${context.dimension}`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
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
		expect(receivedDeps).not.toBeNull();

		const firstDep = receivedDeps!.first;
		expect(firstDep).toBeDefined();

		const firstData = firstDep?.data as FirstDimensionResult | undefined;
		expect(firstData).toEqual({ result: "first result" });
	});
});