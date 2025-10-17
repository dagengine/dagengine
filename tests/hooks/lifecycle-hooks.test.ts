import { describe, test, expect, beforeEach, vi } from "vitest";
import { DagEngine } from "../../src/core/engine";
import { TestPlugin } from "../helpers/test-plugin";

import { ProviderAdapter } from "../../src/providers/adapter";
import type {
	BeforeProcessStartContext,
	AfterProcessCompleteContext,
	ProcessFailureContext,
	ProcessStartResult,
	ProcessResult,
} from "../../src/types";

class MockProvider {
	name = "mock";
	async execute() {
		await new Promise((resolve) => setTimeout(resolve, 10));

		return {
			data: { result: "test" },
			metadata: {
				model: "test-model",
				provider: "mock",
				tokens: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
			},
		};
	}
}

describe("Lifecycle Hooks", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as any);
	});

	describe("beforeProcessStart", () => {
		test("should be called before process starts", async () => {
			let hookCalled = false;
			let capturedContext: BeforeProcessStartContext | null = null;

			class BeforeStartPlugin extends TestPlugin {
				constructor() {
					super("before-start", "Before Start", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				beforeProcessStart(
					context: BeforeProcessStartContext,
				): ProcessStartResult {
					hookCalled = true;
					capturedContext = context;
					return {};
				}
			}

			const engine = new DagEngine({
				plugin: new BeforeStartPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(hookCalled).toBe(true);
			expect(capturedContext).toBeDefined();
			expect(capturedContext!.processId).toBeDefined();
			expect(capturedContext!.timestamp).toBeGreaterThan(0);
			expect(capturedContext!.sections).toHaveLength(1);
			expect(capturedContext!.options).toBeDefined();
		});

		test("should modify sections before processing", async () => {
			class ModifySectionsPlugin extends TestPlugin {
				constructor() {
					super("modify-sections", "Modify Sections", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				beforeProcessStart(
					context: BeforeProcessStartContext,
				): ProcessStartResult {
					return {
						sections: [
							...context.sections,
							{ content: "Added section", metadata: { added: true } },
						],
					};
				}
			}

			const engine = new DagEngine({
				plugin: new ModifySectionsPlugin(),
				providers: adapter,
			});

			const result = await engine.process([
				{ content: "Original", metadata: {} },
			]);

			expect(result.sections).toHaveLength(2);
			expect(result.sections[0]?.section.content).toBe("Original");
			expect(result.sections[1]?.section.content).toBe("Added section");
			expect(result.sections[1]?.section.metadata.added).toBe(true);
		});

		test("should add metadata to process", async () => {
			let processMetadata: any = null;

			class MetadataPlugin extends TestPlugin {
				constructor() {
					super("metadata", "Metadata", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				beforeProcessStart(): ProcessStartResult {
					return {
						metadata: { customData: "test-value", startTime: Date.now() },
					};
				}

				afterProcessComplete(context: AfterProcessCompleteContext) {
					processMetadata = context.metadata;
					return context.result;
				}
			}

			const engine = new DagEngine({
				plugin: new MetadataPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(processMetadata).toBeDefined();
			expect(processMetadata.customData).toBe("test-value");
			expect(processMetadata.startTime).toBeGreaterThan(0);
		});

		test("should handle async beforeProcessStart", async () => {
			let asyncCompleted = false;

			class AsyncBeforePlugin extends TestPlugin {
				constructor() {
					super("async-before", "Async Before", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				async beforeProcessStart(
					context: BeforeProcessStartContext,
				): Promise<ProcessStartResult> {
					await new Promise((resolve) => setTimeout(resolve, 50));
					asyncCompleted = true;
					return {
						sections: context.sections.map((s) => ({
							...s,
							metadata: { ...s.metadata, processed: true },
						})),
					};
				}
			}

			const engine = new DagEngine({
				plugin: new AsyncBeforePlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }]);

			expect(asyncCompleted).toBe(true);
			expect(result.sections[0]?.section.metadata.processed).toBe(true);
		});

		test("should handle errors in beforeProcessStart", async () => {
			const errors: string[] = [];

			class ErrorPlugin extends TestPlugin {
				constructor() {
					super("error", "Error", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				beforeProcessStart() {
					throw new Error("beforeProcessStart failed");
				}
			}

			const engine = new DagEngine({
				plugin: new ErrorPlugin(),
				providers: adapter,
			});

			await expect(
				engine.process([{ content: "Test", metadata: {} }], {
					onError: (context, error) => errors.push(error.message),
				}),
			).rejects.toThrow("beforeProcessStart failed");

			expect(errors).toContain("beforeProcessStart failed");
		});

		test("should allow returning void/undefined", async () => {
			class VoidReturnPlugin extends TestPlugin {
				constructor() {
					super("void-return", "Void Return", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				beforeProcessStart() {
					// Return nothing
				}
			}

			const engine = new DagEngine({
				plugin: new VoidReturnPlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }]);
			expect(result).toBeDefined();
			expect(result.sections).toHaveLength(1);
		});
	});

	describe("afterProcessComplete", () => {
		test("should be called after process completes", async () => {
			let hookCalled = false;
			let capturedContext: AfterProcessCompleteContext | null = null;

			class AfterCompletePlugin extends TestPlugin {
				constructor() {
					super("after-complete", "After Complete", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				afterProcessComplete(context: AfterProcessCompleteContext) {
					hookCalled = true;
					capturedContext = context;
					return context.result;
				}
			}

			const engine = new DagEngine({
				plugin: new AfterCompletePlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(hookCalled).toBe(true);
			expect(capturedContext).toBeDefined();
			expect(capturedContext!.processId).toBeDefined();
			expect(capturedContext!.result.sections).toBeDefined();
			expect(capturedContext!.duration).toBeGreaterThan(0);
			expect(capturedContext!.totalDimensions).toBe(1);
			expect(capturedContext!.successfulDimensions).toBe(1);
			expect(capturedContext!.failedDimensions).toBe(0);
		});

		test("should modify final result", async () => {
			class ModifyResultPlugin extends TestPlugin {
				constructor() {
					super("modify-result", "Modify Result", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				afterProcessComplete(
					context: AfterProcessCompleteContext,
				): ProcessResult {
					return {
						...context.result,
						customData: { processed: true, timestamp: Date.now() },
					} as any;
				}
			}

			const engine = new DagEngine({
				plugin: new ModifyResultPlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }]);

			expect((result as any).customData).toBeDefined();
			expect((result as any).customData.processed).toBe(true);
			expect((result as any).customData.timestamp).toBeGreaterThan(0);
		});

		test("should access all dimension results", async () => {
			let allResults: any = null;

			class InspectPlugin extends TestPlugin {
				constructor() {
					super("inspect", "Inspect", "Test");
					this.dimensions = ["dim1", "dim2", "dim3"];
				}

				createPrompt(context: any) {
					return context.dimension;
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				afterProcessComplete(context: AfterProcessCompleteContext) {
					allResults = context.result.sections[0]?.results;
					return context.result;
				}
			}

			const engine = new DagEngine({
				plugin: new InspectPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(allResults).toBeDefined();
			expect(allResults.dim1).toBeDefined();
			expect(allResults.dim2).toBeDefined();
			expect(allResults.dim3).toBeDefined();
		});

		test("should handle async afterProcessComplete", async () => {
			let asyncCompleted = false;

			class AsyncAfterPlugin extends TestPlugin {
				constructor() {
					super("async-after", "Async After", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				async afterProcessComplete(
					context: AfterProcessCompleteContext,
				): Promise<ProcessResult> {
					await new Promise((resolve) => setTimeout(resolve, 50));
					asyncCompleted = true;
					return context.result;
				}
			}

			const engine = new DagEngine({
				plugin: new AsyncAfterPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);
			expect(asyncCompleted).toBe(true);
		});

		test("should handle errors gracefully in afterProcessComplete", async () => {
			const errors: string[] = [];

			class ErrorAfterPlugin extends TestPlugin {
				constructor() {
					super("error-after", "Error After", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				afterProcessComplete() {
					throw new Error("afterProcessComplete failed");
				}
			}

			const engine = new DagEngine({
				plugin: new ErrorAfterPlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }], {
				onError: (context, error) => errors.push(error.message),
			});

			// Should still return original result despite error
			expect(result).toBeDefined();
			expect(result.sections).toBeDefined();
			expect(errors).toContain("afterProcessComplete failed");
		});

		test("should allow returning void/undefined", async () => {
			class VoidReturnPlugin extends TestPlugin {
				constructor() {
					super("void-return", "Void Return", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				afterProcessComplete(context: AfterProcessCompleteContext) {
					// Inspect but don't return anything
					expect(context.result).toBeDefined();
				}
			}

			const engine = new DagEngine({
				plugin: new VoidReturnPlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }]);
			expect(result).toBeDefined();
		});
	});

	describe("handleProcessFailure", () => {
		test("should be called when process fails", async () => {
			let hookCalled = false;
			let capturedContext: ProcessFailureContext | null = null;

			class FailurePlugin extends TestPlugin {
				constructor() {
					super("failure", "Failure", "Test");
					this.dimensions = ["failing"];
				}

				createPrompt() {
					throw new Error("Intentional failure");
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				handleProcessFailure(
					context: ProcessFailureContext,
				): ProcessResult | null {
					hookCalled = true;
					capturedContext = context;
					return null;
				}
			}

			const engine = new DagEngine({
				plugin: new FailurePlugin(),
				providers: adapter,
				continueOnError: false,
			});

			await expect(
				engine.process([{ content: "Test", metadata: {} }]),
			).rejects.toThrow();

			expect(hookCalled).toBe(true);
			expect(capturedContext).toBeDefined();
			expect(capturedContext!.error).toBeDefined();
			expect(capturedContext!.error.message).toContain("Intentional failure");
			expect(capturedContext!.sections).toHaveLength(1);
			expect(capturedContext!.duration).toBeGreaterThan(0);
		});

		test("should recover from process failure", async () => {
			let failureHandled = false;

			class RecoveryPlugin extends TestPlugin {
				constructor() {
					super("recovery", "Recovery", "Test");
					this.dimensions = ["failing"];
				}

				createPrompt() {
					throw new Error("Intentional failure");
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				handleProcessFailure(context: ProcessFailureContext): ProcessResult {
					failureHandled = true;

					return {
						sections: context.sections.map((s) => ({
							section: s,
							results: {
								failing: {
									data: {
										recovered: true,
										originalError: context.error.message,
									},
									metadata: { recoveredFromError: true },
								},
							},
						})),
						globalResults: {},
						transformedSections: context.sections,
					};
				}
			}

			const engine = new DagEngine({
				plugin: new RecoveryPlugin(),
				providers: adapter,
				continueOnError: false,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }]);

			expect(failureHandled).toBe(true);
			expect(result.sections[0]?.results.failing?.data).toEqual({
				recovered: true,
				originalError: expect.stringContaining("Intentional failure"),
			});
			expect(
				result.sections[0]?.results.failing?.metadata?.recoveredFromError,
			).toBe(true);
		});

		test("should allow failure to propagate if returns null", async () => {
			class NoRecoveryPlugin extends TestPlugin {
				constructor() {
					super("no-recovery", "No Recovery", "Test");
					this.dimensions = ["failing"];
				}

				createPrompt() {
					throw new Error("Unrecoverable error");
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				handleProcessFailure(): null {
					return null;
				}
			}

			const engine = new DagEngine({
				plugin: new NoRecoveryPlugin(),
				providers: adapter,
				continueOnError: false,
			});

			await expect(
				engine.process([{ content: "Test", metadata: {} }]),
			).rejects.toThrow("Unrecoverable error");
		});

		test("should handle async handleProcessFailure", async () => {
			let asyncCompleted = false;

			class AsyncFailurePlugin extends TestPlugin {
				constructor() {
					super("async-failure", "Async Failure", "Test");
					this.dimensions = ["failing"];
				}

				createPrompt() {
					throw new Error("Test failure");
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				async handleProcessFailure(
					context: ProcessFailureContext,
				): Promise<ProcessResult> {
					await new Promise((resolve) => setTimeout(resolve, 50));
					asyncCompleted = true;

					return {
						sections: context.sections.map((s) => ({
							section: s,
							results: { failing: { data: { recovered: true } } },
						})),
						globalResults: {},
						transformedSections: context.sections,
					};
				}
			}

			const engine = new DagEngine({
				plugin: new AsyncFailurePlugin(),
				providers: adapter,
				continueOnError: false,
			});

			await engine.process([{ content: "Test", metadata: {} }]);
			expect(asyncCompleted).toBe(true);
		});

		test("should access partial results in failure context", async () => {
			let partialResults: any = null;

			class PartialResultsPlugin extends TestPlugin {
				constructor() {
					super("partial", "Partial", "Test");
					this.dimensions = ["success", "failing"];
				}

				createPrompt(context: any) {
					if (context.dimension === "failing") {
						throw new Error("Second dimension fails");
					}
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				defineDependencies() {
					return { failing: ["success"] };
				}

				handleProcessFailure(
					context: ProcessFailureContext,
				): ProcessResult | null {
					partialResults = context.partialResults;
					return null;
				}
			}

			const engine = new DagEngine({
				plugin: new PartialResultsPlugin(),
				providers: adapter,
				continueOnError: false,
			});

			await expect(
				engine.process([{ content: "Test", metadata: {} }]),
			).rejects.toThrow();

			expect(partialResults).toBeDefined();
			// First dimension should have succeeded
			expect(partialResults.sections?.[0]?.results?.success).toBeDefined();
		});

		test("should handle errors in handleProcessFailure gracefully", async () => {
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			class ErrorInHandlerPlugin extends TestPlugin {
				constructor() {
					super("error-handler", "Error Handler", "Test");
					this.dimensions = ["failing"];
				}

				createPrompt() {
					throw new Error("Original failure");
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				handleProcessFailure(): ProcessResult {
					throw new Error("Handler also failed");
				}
			}

			const engine = new DagEngine({
				plugin: new ErrorInHandlerPlugin(),
				providers: adapter,
				continueOnError: false,
			});

			await expect(
				engine.process([{ content: "Test", metadata: {} }]),
			).rejects.toThrow("Original failure");

			consoleErrorSpy.mockRestore();
		});
	});
});
