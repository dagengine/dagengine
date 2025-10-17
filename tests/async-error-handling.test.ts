import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../src/core/engine";
import { Plugin, PromptContext, type ProviderSelection } from "../src/plugin";
import { ProviderRegistry } from "../src/providers/registry";
import { MockAIProvider, createMockSection } from "./setup";
import type { DimensionResult } from "../src/types";

describe("DagEngine - Async Error Handling", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("test", { result: "ok" });
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should handle async createPrompt errors", async () => {
		const errors: string[] = [];

		class ErrorPromptPlugin extends Plugin {
			constructor() {
				super("error-prompt", "Error Prompt", "Test");
				this.dimensions = ["failing"];
			}

			async createPrompt(): Promise<string> {
				await new Promise((resolve) => setTimeout(resolve, 10));
				throw new Error("Async createPrompt failed");
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new ErrorPromptPlugin(),
			registry,
			continueOnError: true,
		});

		await engine.process([createMockSection("Test")], {
			onError: (context, error) => {
				errors.push(error.message);
			},
		});

		expect(errors).toContain("Async createPrompt failed");
	});

	test("should handle async selectProvider errors", async () => {
		const errors: string[] = [];

		class ErrorProviderPlugin extends Plugin {
			constructor() {
				super("error-provider", "Error Provider", "Test");
				this.dimensions = ["failing"];
			}

			createPrompt(): string {
				return "test";
			}

			async selectProvider(): Promise<ProviderSelection> {
				await new Promise((resolve) => setTimeout(resolve, 10));
				throw new Error("Async selectProvider failed");
			}
		}

		const engine = new DagEngine({
			plugin: new ErrorProviderPlugin(),
			registry,
			continueOnError: true,
		});

		await engine.process([createMockSection("Test")], {
			onError: (context, error) => {
				errors.push(error.message);
			},
		});

		expect(errors.some((e) => e.includes("selectProvider"))).toBe(true);
	});

	test("should handle async defineDependencies errors", async () => {
		class ErrorDependenciesPlugin extends Plugin {
			constructor() {
				super("error-deps", "Error Deps", "Test");
				this.dimensions = ["test"];
			}

			async defineDependencies(): Promise<Record<string, string[]>> {
				await new Promise((resolve) => setTimeout(resolve, 10));
				throw new Error("Async defineDependencies failed");
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new ErrorDependenciesPlugin(),
			registry,
		});

		await expect(engine.process([createMockSection("Test")])).rejects.toThrow();
	});

	test("should handle async finalizeResults errors", async () => {
		const errors: string[] = [];

		class ErrorProcessPlugin extends Plugin {
			constructor() {
				super("error-process", "Error Process", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}

			async finalizeResults(): Promise<Record<string, DimensionResult>> {
				await new Promise((resolve) => setTimeout(resolve, 10));
				throw new Error("Async finalizeResults failed");
			}
		}

		const engine = new DagEngine({
			plugin: new ErrorProcessPlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Test")], {
			onError: (context, error) => {
				errors.push(error.message);
			},
		});

		expect(result).toBeDefined();
		expect(errors).toContain("Async finalizeResults failed");
	});

	test("should handle async transform errors", async () => {
		class ErrorTransformPlugin extends Plugin {
			constructor() {
				super("error-transform", "Error Transform", "Test");
				this.dimensions = [
					{
						name: "failing",
						scope: "global" as const,
						transform: async () => {
							await new Promise((resolve) => setTimeout(resolve, 10));
							throw new Error("Async transform failed");
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

		const engine = new DagEngine({
			plugin: new ErrorTransformPlugin(),
			registry,
			continueOnError: true,
		});

		const result = await engine.process([createMockSection("Test")]);

		// Should preserve original sections on transform error
		expect(result.transformedSections).toHaveLength(1);
	});
});
