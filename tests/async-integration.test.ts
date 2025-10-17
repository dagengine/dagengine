import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../src/core/engine";
import { Plugin, type PromptContext, type ProviderSelection } from "../src/plugin";
import { ProviderRegistry } from "../src/providers/registry";
import { MockAIProvider, createMockSection } from "./setup";
import { type FinalizeContext, type DimensionResult } from "../src/types";

describe("DagEngine - Full Async Integration", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("test", { result: "ok" });
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should handle plugin with all async methods", async () => {
		const executionLog: string[] = [];

		class FullAsyncPlugin extends Plugin {
			constructor() {
				super("full-async", "Full Async", "Test");
				this.dimensions = ["fetch", "process", "store"];
			}

			async defineDependencies(): Promise<Record<string, string[]>> {
				executionLog.push("defineDependencies-start");
				await new Promise((resolve) => setTimeout(resolve, 20));
				executionLog.push("defineDependencies-end");
				return {
					process: ["fetch"],
					store: ["process"],
				};
			}

			async createPrompt(context: PromptContext): Promise<string> {
				executionLog.push(`createPrompt-${context.dimension}`);
				await new Promise<void>((resolve) => setTimeout(resolve, 10));
				return `${context.dimension}: ${context.sections[0]?.content ?? ""}`;
			}

			async selectProvider(_dimension: string): Promise<ProviderSelection> {
				executionLog.push(`selectProvider-${_dimension}`);
				await new Promise<void>((resolve) => setTimeout(resolve, 10));
				return { provider: "mock-ai", options: {} };
			}

			async finalizeResults(
				context: FinalizeContext,
			): Promise<Record<string, DimensionResult>> {
				executionLog.push("finalizeResults");
				await new Promise<void>((resolve) => setTimeout(resolve, 10));
				return context.results;
			}
		}

		const engine = new DagEngine({
			plugin: new FullAsyncPlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")]);

		expect(executionLog).toContain("defineDependencies-start");
		expect(executionLog).toContain("defineDependencies-end");
		expect(executionLog).toContain("createPrompt-fetch");
		expect(executionLog).toContain("createPrompt-process");
		expect(executionLog).toContain("createPrompt-store");
		expect(executionLog).toContain("finalizeResults");
	});

	test("should handle mixed sync and async methods", async () => {
		class MixedPlugin extends Plugin {
			constructor() {
				super("mixed", "Mixed", "Test");
				this.dimensions = ["sync_dim", "async_dim"];
			}

			// Sync
			getDimensionNames(): string[] {
				return ["sync_dim", "async_dim"];
			}

			// Async
			async defineDependencies(): Promise<Record<string, string[]>> {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return { async_dim: ["sync_dim"] };
			}

			// Sync
			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			// Async
			async selectProvider(): Promise<ProviderSelection> {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new MixedPlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(result.sections[0]?.results.sync_dim).toBeDefined();
		expect(result.sections[0]?.results.async_dim).toBeDefined();
	});

	test("should handle async errors gracefully", async () => {
		const errors: string[] = [];

		class ErrorAsyncPlugin extends Plugin {
			constructor() {
				super("error-async", "Error Async", "Test");
				this.dimensions = ["failing"];
			}

			async createPrompt(): Promise<string> {
				await new Promise((resolve) => setTimeout(resolve, 10));
				throw new Error("Async prompt error");
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new ErrorAsyncPlugin(),
			registry,
			continueOnError: true,
		});

		await engine.process([createMockSection("Test")], {
			onError: (context, error) => {
				errors.push(error.message);
			},
		});

		expect(errors).toContain("Async prompt error");
	});

	test("should maintain correct execution order with async operations", async () => {
		const order: string[] = [];

		class OrderPlugin extends Plugin {
			constructor() {
				super("order", "Order", "Test");
				this.dimensions = ["step1", "step2", "step3"];
			}

			defineDependencies(): Record<string, string[]> {
				return {
					step2: ["step1"],
					step3: ["step2"],
				};
			}

			async createPrompt(context: PromptContext): Promise<string> {
				order.push(`${context.dimension}-start`);
				await new Promise((resolve) => setTimeout(resolve, 20));
				order.push(`${context.dimension}-end`);
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new OrderPlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")]);

		// Verify order: step1 complete before step2 starts
		const step1End = order.indexOf("step1-end");
		const step2Start = order.indexOf("step2-start");
		const step2End = order.indexOf("step2-end");
		const step3Start = order.indexOf("step3-start");

		expect(step1End).toBeLessThan(step2Start);
		expect(step2End).toBeLessThan(step3Start);
	});

	test("should handle async transform with section count changes", async () => {
		class AsyncCountChangePlugin extends Plugin {
			constructor() {
				super("count-change", "Count Change", "Test");
				this.dimensions = [
					{
						name: "split",
						scope: "global" as const,
						transform: async (result, sections) => {
							// Async split: each section becomes 2 sections
							const split = await Promise.all(
								sections.map(async (section) => {
									await new Promise((resolve) => setTimeout(resolve, 10));
									return [
										{
											...section,
											content: `${section.content}-part1`,
											metadata: {},
										},
										{
											...section,
											content: `${section.content}-part2`,
											metadata: {},
										},
									];
								}),
							);
							return split.flat();
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
			plugin: new AsyncCountChangePlugin(),
			registry,
		});

		const result = await engine.process([
			createMockSection("A"),
			createMockSection("B"),
		]);

		// 2 sections -> 4 sections
		expect(result.transformedSections).toHaveLength(4);
		expect(result.transformedSections[0]?.content).toBe("A-part1");
		expect(result.transformedSections[1]?.content).toBe("A-part2");
		expect(result.transformedSections[2]?.content).toBe("B-part1");
		expect(result.transformedSections[3]?.content).toBe("B-part2");
	});
});
