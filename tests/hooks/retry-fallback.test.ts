import { describe, test, expect, beforeEach, vi, afterEach, type MockInstance } from "vitest";
import { DagEngine } from "../../src/core/engine/dag-engine.ts";
import { TestPlugin } from "../helpers/test-plugin.ts";
import { ProviderAdapter } from "../../src/providers/adapter.ts";
import type {
	TransformSectionsContext,
	FinalizeContext,
	SectionData,
	DimensionResult,
	ProviderResponse,
	PromptContext,
	ProviderSelection,
} from "../../src/types.ts";

/**
 * Mock provider for testing
 */
class MockProvider {
	name = "mock";

	async execute(request: {
		dimension?: string;
		input?: string;
		[key: string]: unknown;
	}): Promise<ProviderResponse> {
		return {
			data: { result: `result-${request.dimension}`, input: request.input },
			metadata: {
				model: "test-model",
				provider: "mock",
				tokens: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
			},
		};
	}
}

describe("Transformation Hooks", () => {
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

	describe("transformSections", () => {
		test("should transform sections after global dimension", async () => {
			let transformCalled = false;

			class TransformPlugin extends TestPlugin {
				constructor() {
					super("transform", "Transform", "Test");
					this.dimensions = [{ name: "summarize", scope: "global" as const }];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock", options: {} };
				}

				transformSections(context: TransformSectionsContext): SectionData[] {
					transformCalled = true;
					return [
						...context.currentSections,
						{ content: "New section added", metadata: { added: true } },
					];
				}
			}

			const engine = new DagEngine({
				plugin: new TransformPlugin(),
				providers: adapter,
			});

			const result = await engine.process([
				{ content: "Original", metadata: {} },
			]);

			expect(transformCalled).toBe(true);
			expect(result.transformedSections).toHaveLength(2);
			expect(result.transformedSections[1]?.content).toBe("New section added");
		});

		test("should modify existing sections", async () => {
			class ModifySectionsPlugin extends TestPlugin {
				constructor() {
					super("modify", "Modify", "Test");
					this.dimensions = [{ name: "enhance", scope: "global" as const }];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock", options: {} };
				}

				transformSections(context: TransformSectionsContext): SectionData[] {
					return context.currentSections.map((section) => ({
						...section,
						content: `Enhanced: ${section.content}`,
						metadata: { ...section.metadata, enhanced: true },
					}));
				}
			}

			const engine = new DagEngine({
				plugin: new ModifySectionsPlugin(),
				providers: adapter,
			});

			const result = await engine.process([
				{ content: "Section 1", metadata: {} },
				{ content: "Section 2", metadata: {} },
			]);

			expect(result.transformedSections[0]?.content).toBe(
				"Enhanced: Section 1",
			);
			expect(result.transformedSections[1]?.content).toBe(
				"Enhanced: Section 2",
			);

			const metadata0 = result.transformedSections[0]
				?.metadata as { enhanced?: boolean };
			expect(metadata0?.enhanced).toBe(true);
		});

		test("should split sections", async () => {
			class SplitSectionsPlugin extends TestPlugin {
				constructor() {
					super("split", "Split", "Test");
					this.dimensions = [{ name: "splitter", scope: "global" as const }];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock", options: {} };
				}

				transformSections(context: TransformSectionsContext): SectionData[] {
					const newSections: SectionData[] = [];

					context.currentSections.forEach((section) => {
						const sentences = section.content.split(". ");
						sentences.forEach((sentence) => {
							if (sentence.trim()) {
								newSections.push({
									content: sentence.trim(),
									metadata: { ...section.metadata, split: true },
								});
							}
						});
					});

					return newSections;
				}
			}

			const engine = new DagEngine({
				plugin: new SplitSectionsPlugin(),
				providers: adapter,
			});

			const result = await engine.process([
				{
					content: "First sentence. Second sentence. Third sentence",
					metadata: {},
				},
			]);

			expect(result.transformedSections.length).toBeGreaterThan(1);
			expect(
				result.transformedSections.every(
					(s) => (s.metadata as { split?: boolean }).split === true,
				),
			).toBe(true);
		});

		test("should merge sections", async () => {
			class MergeSectionsPlugin extends TestPlugin {
				constructor() {
					super("merge", "Merge", "Test");
					this.dimensions = [{ name: "merger", scope: "global" as const }];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock", options: {} };
				}

				transformSections(context: TransformSectionsContext): SectionData[] {
					const merged = context.currentSections
						.map((s) => s.content)
						.join("\n\n");

					return [
						{
							content: merged,
							metadata: {
								merged: true,
								originalCount: context.currentSections.length,
							},
						},
					];
				}
			}

			const engine = new DagEngine({
				plugin: new MergeSectionsPlugin(),
				providers: adapter,
			});

			const result = await engine.process([
				{ content: "Section 1", metadata: {} },
				{ content: "Section 2", metadata: {} },
				{ content: "Section 3", metadata: {} },
			]);

			expect(result.transformedSections).toHaveLength(1);
			expect(result.transformedSections[0]?.content).toContain("Section 1");
			expect(result.transformedSections[0]?.content).toContain("Section 2");

			const metadata = result.transformedSections[0]
				?.metadata as { originalCount?: number };
			expect(metadata?.originalCount).toBe(3);
		});

		test("should filter sections", async () => {
			class FilterSectionsPlugin extends TestPlugin {
				constructor() {
					super("filter", "Filter", "Test");
					this.dimensions = [{ name: "filter", scope: "global" as const }];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock", options: {} };
				}

				transformSections(context: TransformSectionsContext): SectionData[] {
					return context.currentSections.filter(
						(section) => section.content.length > 10,
					);
				}
			}

			const engine = new DagEngine({
				plugin: new FilterSectionsPlugin(),
				providers: adapter,
			});

			const result = await engine.process([
				{ content: "Short", metadata: {} },
				{ content: "This is a longer section", metadata: {} },
				{ content: "Hi", metadata: {} },
			]);

			expect(result.transformedSections).toHaveLength(1);
			expect(result.transformedSections[0]?.content).toBe(
				"This is a longer section",
			);
		});

		test("should handle async transformSections", async () => {
			let asyncCompleted = false;

			class AsyncTransformPlugin extends TestPlugin {
				constructor() {
					super("async-transform", "Async Transform", "Test");
					this.dimensions = [{ name: "process", scope: "global" as const }];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock", options: {} };
				}

				async transformSections(
					context: TransformSectionsContext,
				): Promise<SectionData[]> {
					await new Promise<void>((resolve) => setTimeout(resolve, 50));
					asyncCompleted = true;
					return context.currentSections;
				}
			}

			const engine = new DagEngine({
				plugin: new AsyncTransformPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(asyncCompleted).toBe(true);
		});

		test("should receive complete context", async () => {
			let capturedContext: TransformSectionsContext | null = null;

			class ContextTransformPlugin extends TestPlugin {
				constructor() {
					super("context-transform", "Context Transform", "Test");
					this.dimensions = [{ name: "process", scope: "global" as const }];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock", options: {} };
				}

				transformSections(context: TransformSectionsContext): SectionData[] {
					capturedContext = context;
					return context.currentSections;
				}
			}

			const engine = new DagEngine({
				plugin: new ContextTransformPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(capturedContext).toBeDefined();
			expect(capturedContext!.dimension).toBe("process");
			expect(capturedContext!.result).toBeDefined();
			expect(capturedContext!.currentSections).toBeDefined();
			expect(capturedContext!.isGlobal).toBe(true);
		});

		test("should handle errors gracefully", async () => {
			const errors: string[] = [];

			class ErrorTransformPlugin extends TestPlugin {
				constructor() {
					super("error-transform", "Error Transform", "Test");
					this.dimensions = [{ name: "process", scope: "global" as const }];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock", options: {} };
				}

				transformSections(): SectionData[] {
					throw new Error("transformSections error");
				}
			}

			const engine = new DagEngine({
				plugin: new ErrorTransformPlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }], {
				onError: (_context: string, error: Error) => errors.push(error.message),
			});

			expect(result.transformedSections).toHaveLength(1);
			expect(consoleErrorSpy).toHaveBeenCalled();
			expect(errors.some((e) => e.includes("transformSections"))).toBe(true);
		});

		test("should apply multiple transformations sequentially", async () => {
			const transformLog: string[] = [];

			class MultiTransformPlugin extends TestPlugin {
				constructor() {
					super("multi-transform", "Multi Transform", "Test");
					this.dimensions = [
						{ name: "transform1", scope: "global" as const },
						{ name: "transform2", scope: "global" as const },
					];
				}

				createPrompt(context: PromptContext): string {
					return context.dimension;
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock", options: {} };
				}

				transformSections(context: TransformSectionsContext): SectionData[] {
					transformLog.push(context.dimension);

					return context.currentSections.map((section) => ({
						...section,
						content: `${context.dimension}: ${section.content}`,
					}));
				}
			}

			const engine = new DagEngine({
				plugin: new MultiTransformPlugin(),
				providers: adapter,
			});

			const result = await engine.process([
				{ content: "Original", metadata: {} },
			]);

			expect(transformLog).toEqual(["transform1", "transform2"]);
			expect(result.transformedSections[0]?.content).toBe(
				"transform2: transform1: Original",
			);
		});
	});

	describe("finalizeResults", () => {
		test("should finalize all results", async () => {
			let finalizeCalled = false;

			class FinalizePlugin extends TestPlugin {
				constructor() {
					super("finalize", "Finalize", "Test");
					this.dimensions = ["dim1", "dim2"];
				}

				createPrompt(context: PromptContext): string {
					return context.dimension;
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock", options: {} };
				}

				finalizeResults(
					context: FinalizeContext,
				): Record<string, DimensionResult> {
					finalizeCalled = true;

					const finalized: Record<string, DimensionResult> = {};

					Object.entries(context.results).forEach(([key, result]) => {
						finalized[key] = {
							...result,
							metadata: {
								...result.metadata,
								finalized: true,
								finalizedAt: Date.now(),
							},
						};
					});

					return finalized;
				}
			}

			const engine = new DagEngine({
				plugin: new FinalizePlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }]);

			expect(finalizeCalled).toBe(true);

			const dim1Metadata = result.sections[0]?.results.dim1
				?.metadata as { finalized?: boolean };
			const dim2Metadata = result.sections[0]?.results.dim2
				?.metadata as { finalized?: boolean };

			expect(dim1Metadata?.finalized).toBe(true);
			expect(dim2Metadata?.finalized).toBe(true);
		});

		test("should aggregate section results in finalize", async () => {
			class AggregatePlugin extends TestPlugin {
				constructor() {
					super("aggregate", "Aggregate", "Test");
					this.dimensions = ["analyze"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock", options: {} };
				}

				finalizeResults(
					context: FinalizeContext,
				): Record<string, DimensionResult> {
					const finalized: Record<string, DimensionResult> = {
						...context.results,
					};

					const sectionKeys = Object.keys(context.results).filter((k) =>
						k.startsWith("analyze_section_"),
					);

					finalized["aggregate_summary"] = {
						data: {
							totalSections: sectionKeys.length,
							processedAt: Date.now(),
						},
					};

					return finalized;
				}
			}

			const engine = new DagEngine({
				plugin: new AggregatePlugin(),
				providers: adapter,
			});

			const result = await engine.process([
				{ content: "Section 1", metadata: {} },
				{ content: "Section 2", metadata: {} },
			]);

			expect(result).toBeDefined();
		});

		test("should receive complete context", async () => {
			let capturedContext: FinalizeContext | null = null;

			class ContextFinalizePlugin extends TestPlugin {
				constructor() {
					super("context-finalize", "Context Finalize", "Test");
					this.dimensions = ["test"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock", options: {} };
				}

				finalizeResults(
					context: FinalizeContext,
				): Record<string, DimensionResult> {
					capturedContext = context;
					return context.results;
				}
			}

			const engine = new DagEngine({
				plugin: new ContextFinalizePlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(capturedContext).toBeDefined();
			expect(capturedContext!.results).toBeDefined();
			expect(capturedContext!.originalSections).toBeDefined();
			expect(capturedContext!.globalResults).toBeDefined();
			expect(capturedContext!.currentSections).toBeDefined();
			expect(capturedContext!.processId).toBeDefined();
			expect(capturedContext!.duration).toBeGreaterThanOrEqual(0);
		});

		test("should handle async finalizeResults", async () => {
			let asyncCompleted = false;

			class AsyncFinalizePlugin extends TestPlugin {
				constructor() {
					super("async-finalize", "Async Finalize", "Test");
					this.dimensions = ["test"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock", options: {} };
				}

				async finalizeResults(
					context: FinalizeContext,
				): Promise<Record<string, DimensionResult>> {
					await new Promise<void>((resolve) => setTimeout(resolve, 50));
					asyncCompleted = true;
					return context.results;
				}
			}

			const engine = new DagEngine({
				plugin: new AsyncFinalizePlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(asyncCompleted).toBe(true);
		});

		test("should handle errors gracefully", async () => {
			const errors: string[] = [];

			class ErrorFinalizePlugin extends TestPlugin {
				constructor() {
					super("error-finalize", "Error Finalize", "Test");
					this.dimensions = ["test"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock", options: {} };
				}

				finalizeResults(): Record<string, DimensionResult> {
					throw new Error("finalizeResults error");
				}
			}

			const engine = new DagEngine({
				plugin: new ErrorFinalizePlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }], {
				onError: (_context: string, error: Error) => errors.push(error.message),
			});

			expect(result.sections[0]?.results.test).toBeDefined();
			expect(consoleErrorSpy).toHaveBeenCalled();
			expect(errors).toContain("finalizeResults error");
		});

		test("should work with global and section dimensions", async () => {
			class MixedDimensionsPlugin extends TestPlugin {
				constructor() {
					super("mixed", "Mixed", "Test");
					this.dimensions = [
						"section_dim",
						{ name: "global_dim", scope: "global" as const },
					];
				}

				createPrompt(context: PromptContext): string {
					return context.dimension;
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock", options: {} };
				}

				finalizeResults(
					context: FinalizeContext,
				): Record<string, DimensionResult> {
					const finalized: Record<string, DimensionResult> = {};

					Object.entries(context.results).forEach(([key, result]) => {
						const isGlobal = !key.includes("_section_");
						finalized[key] = {
							...result,
							metadata: {
								...result.metadata,
								scope: isGlobal ? "global" : "section",
							},
						};
					});

					return finalized;
				}
			}

			const engine = new DagEngine({
				plugin: new MixedDimensionsPlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }]);

			const sectionMetadata = result.sections[0]?.results.section_dim
				?.metadata as { scope?: string };
			const globalMetadata = result.globalResults.global_dim
				?.metadata as { scope?: string };

			expect(sectionMetadata?.scope).toBe("section");
			expect(globalMetadata?.scope).toBe("global");
		});
	});
});