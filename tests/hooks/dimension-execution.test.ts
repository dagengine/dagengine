import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { DagEngine } from "../../src/core/engine";
import { TestPlugin } from "../helpers/test-plugin";
import { ProviderAdapter } from "../../src/providers/adapter";
import type {
	BeforeProviderExecuteContext,
	AfterProviderExecuteContext,
	ProviderRequest,
	ProviderResponse,
} from "../../src/types";

class MockProvider {
	name = "mock";
	receivedRequests: ProviderRequest[] = [];
	requestModifications: any[] = [];

	async execute(request: ProviderRequest) {
		this.receivedRequests.push(request);
		return {
			data: { result: "test", requestInput: request.input },
			metadata: {
				model: "test-model",
				provider: "mock",
				tokens: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
			},
		};
	}

	reset() {
		this.receivedRequests = [];
		this.requestModifications = [];
	}
}

describe("Provider Execution Hooks", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;
	let consoleWarnSpy: any;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as any);
		consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleWarnSpy.mockRestore();
	});

	describe("beforeProviderExecute", () => {
		test("should be called before provider execution", async () => {
			let hookCalled = false;
			let capturedRequest: ProviderRequest | null = null;

			class BeforeProviderPlugin extends TestPlugin {
				constructor() {
					super("before-provider", "Before Provider", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "original prompt";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				beforeProviderExecute(
					context: BeforeProviderExecuteContext,
				): ProviderRequest {
					hookCalled = true;
					capturedRequest = context.request;
					return context.request;
				}
			}

			const engine = new DagEngine({
				plugin: new BeforeProviderPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(hookCalled).toBe(true);
			expect(capturedRequest).toBeDefined();
			expect(capturedRequest!.input).toBe("original prompt");
		});

		test("should modify request before provider execution", async () => {
			class ModifyRequestPlugin extends TestPlugin {
				constructor() {
					super("modify-request", "Modify Request", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "original prompt";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				beforeProviderExecute(
					context: BeforeProviderExecuteContext,
				): ProviderRequest {
					return {
						...context.request,
						input: "modified prompt",
						options: {
							...context.request.options,
							temperature: 0.9,
							customFlag: true,
						},
					};
				}
			}

			const engine = new DagEngine({
				plugin: new ModifyRequestPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(mockProvider.receivedRequests).toHaveLength(1);
			expect(mockProvider.receivedRequests[0]?.input).toBe("modified prompt");
			expect(mockProvider.receivedRequests[0]?.options?.temperature).toBe(0.9);
			expect(mockProvider.receivedRequests[0]?.options?.customFlag).toBe(true);
		});

		test("should add metadata to request", async () => {
			class MetadataRequestPlugin extends TestPlugin {
				constructor() {
					super("metadata-request", "Metadata Request", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				beforeProviderExecute(
					context: BeforeProviderExecuteContext,
				): ProviderRequest {
					return {
						...context.request,
						metadata: {
							...context.request.metadata,
							customId: "req-123",
							timestamp: Date.now(),
						},
					};
				}
			}

			const engine = new DagEngine({
				plugin: new MetadataRequestPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(mockProvider.receivedRequests[0]?.metadata?.customId).toBe(
				"req-123",
			);
			expect(
				mockProvider.receivedRequests[0]?.metadata?.timestamp,
			).toBeDefined();
		});

		test("should handle async beforeProviderExecute", async () => {
			let asyncCompleted = false;

			class AsyncBeforeProviderPlugin extends TestPlugin {
				constructor() {
					super("async-before-provider", "Async Before Provider", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				async beforeProviderExecute(
					context: BeforeProviderExecuteContext,
				): Promise<ProviderRequest> {
					await new Promise((resolve) => setTimeout(resolve, 50));
					asyncCompleted = true;
					return {
						...context.request,
						input: "async modified",
					};
				}
			}

			const engine = new DagEngine({
				plugin: new AsyncBeforeProviderPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(asyncCompleted).toBe(true);
			expect(mockProvider.receivedRequests[0]?.input).toBe("async modified");
		});

		test("should receive complete context", async () => {
			let capturedContext: BeforeProviderExecuteContext | null = null;

			class ContextProviderPlugin extends TestPlugin {
				constructor() {
					super("context-provider", "Context Provider", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test prompt";
				}

				selectProvider() {
					return { provider: "mock", options: { temperature: 0.7 } };
				}

				beforeProviderExecute(
					context: BeforeProviderExecuteContext,
				): ProviderRequest {
					capturedContext = context;
					return context.request;
				}
			}

			const engine = new DagEngine({
				plugin: new ContextProviderPlugin(),
				providers: adapter,
			});

			await engine.process([
				{ content: "Test content", metadata: { id: "123" } },
			]);

			expect(capturedContext).toBeDefined();
			expect(capturedContext!.dimension).toBe("test");
			expect(capturedContext!.provider).toBe("mock");
			expect(capturedContext!.request.input).toBe("test prompt");
			expect(capturedContext!.providerOptions.temperature).toBe(0.7);
			expect(capturedContext!.section.content).toBe("Test content");
		});

		test("should handle errors gracefully", async () => {
			const errors: string[] = [];

			class ErrorBeforeProviderPlugin extends TestPlugin {
				constructor() {
					super("error-before-provider", "Error Before Provider", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				beforeProviderExecute(): ProviderRequest {
					throw new Error("beforeProviderExecute error");
				}
			}

			const engine = new DagEngine({
				plugin: new ErrorBeforeProviderPlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }], {
				onError: (context, error) => errors.push(error.message),
			});

			// Should continue with original request
			expect(result.sections[0]?.results.test).toBeDefined();
			expect(consoleWarnSpy).toHaveBeenCalled();
		});

		test("should be called for multiple dimensions", async () => {
			const callLog: string[] = [];

			class MultiDimProviderPlugin extends TestPlugin {
				constructor() {
					super("multi-dim-provider", "Multi Dim Provider", "Test");
					this.dimensions = ["dim1", "dim2", "dim3"];
				}

				createPrompt(context: any) {
					return context.dimension;
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				beforeProviderExecute(
					context: BeforeProviderExecuteContext,
				): ProviderRequest {
					callLog.push(context.dimension);
					return context.request;
				}
			}

			const engine = new DagEngine({
				plugin: new MultiDimProviderPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(callLog).toContain("dim1");
			expect(callLog).toContain("dim2");
			expect(callLog).toContain("dim3");
		});
	});

	describe("afterProviderExecute", () => {
		test("should be called after provider execution", async () => {
			let hookCalled = false;
			let capturedResponse: ProviderResponse | null = null;

			class AfterProviderPlugin extends TestPlugin {
				constructor() {
					super("after-provider", "After Provider", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				afterProviderExecute(
					context: AfterProviderExecuteContext,
				): ProviderResponse {
					hookCalled = true;
					capturedResponse = context.result;
					return context.result;
				}
			}

			const engine = new DagEngine({
				plugin: new AfterProviderPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(hookCalled).toBe(true);
			expect(capturedResponse).toBeDefined();
			expect(capturedResponse!.data).toBeDefined();
		});

		test("should modify response after provider execution", async () => {
			class ModifyResponsePlugin extends TestPlugin {
				constructor() {
					super("modify-response", "Modify Response", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				afterProviderExecute(
					context: AfterProviderExecuteContext,
				): ProviderResponse {
					return {
						...context.result,
						data: {
							...context.result.data,
							enhanced: true,
							timestamp: Date.now(),
							originalResult: context.result.data,
						},
					};
				}
			}

			const engine = new DagEngine({
				plugin: new ModifyResponsePlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }]);

			expect(result.sections[0]?.results.test?.data?.enhanced).toBe(true);
			expect(result.sections[0]?.results.test?.data?.timestamp).toBeDefined();
			expect(
				result.sections[0]?.results.test?.data?.originalResult,
			).toBeDefined();
		});

		test("should modify metadata in response", async () => {
			class MetadataResponsePlugin extends TestPlugin {
				constructor() {
					super("metadata-response", "Metadata Response", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				afterProviderExecute(
					context: AfterProviderExecuteContext,
				): ProviderResponse {
					return {
						...context.result,
						metadata: {
							...context.result.metadata,
							enhanced: true,
							processingTime: context.duration,
						},
					};
				}
			}

			const engine = new DagEngine({
				plugin: new MetadataResponsePlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }]);

			expect(result.sections[0]?.results.test?.metadata?.enhanced).toBe(true);
			expect(
				result.sections[0]?.results.test?.metadata?.processingTime,
			).toBeDefined();
		});

		test("should handle async afterProviderExecute", async () => {
			let asyncCompleted = false;

			class AsyncAfterProviderPlugin extends TestPlugin {
				constructor() {
					super("async-after-provider", "Async After Provider", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				async afterProviderExecute(
					context: AfterProviderExecuteContext,
				): Promise<ProviderResponse> {
					await new Promise((resolve) => setTimeout(resolve, 50));
					asyncCompleted = true;
					return context.result;
				}
			}

			const engine = new DagEngine({
				plugin: new AsyncAfterProviderPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(asyncCompleted).toBe(true);
		});

		test("should receive complete context", async () => {
			let capturedContext: AfterProviderExecuteContext | null = null;

			class ContextAfterProviderPlugin extends TestPlugin {
				constructor() {
					super("context-after-provider", "Context After Provider", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test prompt";
				}

				selectProvider() {
					return { provider: "mock", options: { temperature: 0.5 } };
				}

				afterProviderExecute(
					context: AfterProviderExecuteContext,
				): ProviderResponse {
					capturedContext = context;
					return context.result;
				}
			}

			const engine = new DagEngine({
				plugin: new ContextAfterProviderPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(capturedContext).toBeDefined();
			expect(capturedContext!.dimension).toBe("test");
			expect(capturedContext!.provider).toBe("mock");
			expect(capturedContext!.request.input).toBe("test prompt");
			expect(capturedContext!.result.data).toBeDefined();
			expect(capturedContext!.result.metadata).toBeDefined();
			expect(capturedContext!.duration).toBeGreaterThanOrEqual(0);
		});

		test("should handle errors gracefully", async () => {
			const errors: string[] = [];

			class ErrorAfterProviderPlugin extends TestPlugin {
				constructor() {
					super("error-after-provider", "Error After Provider", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				afterProviderExecute(): ProviderResponse {
					throw new Error("afterProviderExecute error");
				}
			}

			const engine = new DagEngine({
				plugin: new ErrorAfterProviderPlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }], {
				onError: (context, error) => errors.push(error.message),
			});

			// Should use original response
			expect(result.sections[0]?.results.test?.data).toBeDefined();
			expect(consoleWarnSpy).toHaveBeenCalled();
		});

		test("should filter response data", async () => {
			class FilterResponsePlugin extends TestPlugin {
				constructor() {
					super("filter-response", "Filter Response", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				afterProviderExecute(
					context: AfterProviderExecuteContext,
				): ProviderResponse {
					// Filter out certain fields
					const { requestInput, ...filteredData } = context.result.data || {};
					return {
						...context.result,
						data: filteredData,
					};
				}
			}

			const engine = new DagEngine({
				plugin: new FilterResponsePlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }]);

			expect(result.sections[0]?.results.test?.data?.result).toBeDefined();
			expect(
				result.sections[0]?.results.test?.data?.requestInput,
			).toBeUndefined();
		});

		test("should work with both before and after hooks", async () => {
			const executionLog: string[] = [];

			class BothHooksPlugin extends TestPlugin {
				constructor() {
					super("both-hooks", "Both Hooks", "Test");
					this.dimensions = ["test"];
				}

				createPrompt() {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				beforeProviderExecute(
					context: BeforeProviderExecuteContext,
				): ProviderRequest {
					executionLog.push("before");
					return {
						...context.request,
						input: "modified by before",
					};
				}

				afterProviderExecute(
					context: AfterProviderExecuteContext,
				): ProviderResponse {
					executionLog.push("after");
					return {
						...context.result,
						data: {
							...context.result.data,
							modifiedBy: "after",
						},
					};
				}
			}

			const engine = new DagEngine({
				plugin: new BothHooksPlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }]);

			expect(executionLog).toEqual(["before", "after"]);
			expect(mockProvider.receivedRequests[0]?.input).toBe(
				"modified by before",
			);
			expect(result.sections[0]?.results.test?.data?.modifiedBy).toBe("after");
		});
	});
});
