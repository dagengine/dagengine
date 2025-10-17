import { describe, test, expect } from "vitest";
import { DagEngine } from "../src/core/engine/dag-engine.ts";
import { MockAIProvider, createMockSection } from "./setup.ts";
import { ProviderRegistry } from "../src/providers/registry.ts";
import { Plugin } from "../src/plugin.ts";
import type { PromptContext, ProviderSelection } from "../src/types.ts";

describe("Integration Tests", () => {
	test("should handle complete workflow", async () => {
		class CompletePlugin extends Plugin {
			constructor() {
				super("complete", "Complete", "Complete workflow");
				this.dimensions = [
					{ name: "global_scan", scope: "global" as const },
					"sentiment",
					"topics",
					{ name: "global_summary", scope: "global" as const },
				];
			}

			createPrompt(context: PromptContext): string {
				return `${context.dimension}:${context.sections[0]?.content ?? ""}`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return {
					topics: ["sentiment"],
					global_summary: ["sentiment", "topics"],
				};
			}
		}

		const mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("global_scan:Section 1", { themes: ["tech"] });
		mockProvider.setMockResponse("sentiment:Section 1", {
			sentiment: "positive",
		});
		mockProvider.setMockResponse("topics:Section 1", { topics: ["AI"] });
		mockProvider.setMockResponse("global_summary:Section 1", {
			summary: "Good",
		});

		const registry = new ProviderRegistry();
		registry.register(mockProvider);

		const engine = new DagEngine({
			plugin: new CompletePlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Section 1")]);

		expect(result.globalResults.global_scan).toBeDefined();
		expect(result.globalResults.global_summary).toBeDefined();
		expect(result.sections[0]?.results.sentiment).toBeDefined();
		expect(result.sections[0]?.results.topics).toBeDefined();
	});

	test("should handle multiple sections with dependencies", async () => {
		class MultiSectionPlugin extends Plugin {
			constructor() {
				super("multi", "Multi Section", "Multi section workflow");
				this.dimensions = ["analyze", "summarize"];
			}

			createPrompt(context: PromptContext): string {
				return `${context.dimension}:${context.sections[0]?.content ?? ""}`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return {
					summarize: ["analyze"],
				};
			}
		}

		const mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("analyze:Section 1", { score: 85 });
		mockProvider.setMockResponse("analyze:Section 2", { score: 90 });
		mockProvider.setMockResponse("summarize:Section 1", { summary: "Good" });
		mockProvider.setMockResponse("summarize:Section 2", { summary: "Excellent" });

		const registry = new ProviderRegistry();
		registry.register(mockProvider);

		const engine = new DagEngine({
			plugin: new MultiSectionPlugin(),
			registry,
		});

		const result = await engine.process([
			createMockSection("Section 1"),
			createMockSection("Section 2"),
		]);

		expect(result.sections).toHaveLength(2);
		expect(result.sections[0]?.results.analyze).toBeDefined();
		expect(result.sections[0]?.results.summarize).toBeDefined();
		expect(result.sections[1]?.results.analyze).toBeDefined();
		expect(result.sections[1]?.results.summarize).toBeDefined();
	});

	test("should handle mixed global and section dimensions", async () => {
		class MixedPlugin extends Plugin {
			constructor() {
				super("mixed", "Mixed", "Mixed dimensions");
				this.dimensions = [
					{ name: "global_init", scope: "global" as const },
					"section_process",
					{ name: "global_finalize", scope: "global" as const },
				];
			}

			createPrompt(context: PromptContext): string {
				return `${context.dimension}:${context.sections[0]?.content ?? ""}`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return {
					section_process: ["global_init"],
					global_finalize: ["section_process"],
				};
			}
		}

		const mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("global_init:Test", { initialized: true });
		mockProvider.setMockResponse("section_process:Test", { processed: true });
		mockProvider.setMockResponse("global_finalize:Test", { finalized: true });

		const registry = new ProviderRegistry();
		registry.register(mockProvider);

		const engine = new DagEngine({
			plugin: new MixedPlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(result.globalResults.global_init).toBeDefined();
		expect(result.globalResults.global_finalize).toBeDefined();
		expect(result.sections[0]?.results.section_process).toBeDefined();
	});

	test("should handle complex dependency chains", async () => {
		class ComplexDepsPlugin extends Plugin {
			constructor() {
				super("complex", "Complex", "Complex dependencies");
				this.dimensions = ["a", "b", "c", "d", "e"];
			}

			createPrompt(context: PromptContext): string {
				return `${context.dimension}:${context.sections[0]?.content ?? ""}`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return {
					b: ["a"],
					c: ["a"],
					d: ["b", "c"],
					e: ["d"],
				};
			}
		}

		const mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("a:Test", { result: "a" });
		mockProvider.setMockResponse("b:Test", { result: "b" });
		mockProvider.setMockResponse("c:Test", { result: "c" });
		mockProvider.setMockResponse("d:Test", { result: "d" });
		mockProvider.setMockResponse("e:Test", { result: "e" });

		const registry = new ProviderRegistry();
		registry.register(mockProvider);

		const engine = new DagEngine({
			plugin: new ComplexDepsPlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(result.sections[0]?.results.a).toBeDefined();
		expect(result.sections[0]?.results.b).toBeDefined();
		expect(result.sections[0]?.results.c).toBeDefined();
		expect(result.sections[0]?.results.d).toBeDefined();
		expect(result.sections[0]?.results.e).toBeDefined();
	});

	test("should handle workflow with error recovery", async () => {
		class ErrorRecoveryPlugin extends Plugin {
			constructor() {
				super("error-recovery", "Error Recovery", "Error recovery workflow");
				this.dimensions = ["step1", "step2", "step3"];
			}

			createPrompt(context: PromptContext): string {
				return `${context.dimension}:${context.sections[0]?.content ?? ""}`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("step1:Test", { result: "success" });
		// step2 will fail (no mock response)
		mockProvider.setMockResponse("step3:Test", { result: "success" });

		const registry = new ProviderRegistry();
		registry.register(mockProvider);

		const engine = new DagEngine({
			plugin: new ErrorRecoveryPlugin(),
			registry,
			continueOnError: true,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(result.sections[0]?.results.step1).toBeDefined();
		expect(result.sections[0]?.results.step3).toBeDefined();
	});
});