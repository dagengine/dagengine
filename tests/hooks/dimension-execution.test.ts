import { describe, test, expect, beforeEach, vi, afterEach, type MockInstance } from "vitest";
import { DagEngine } from "../../src/core/engine";
import { TestPlugin } from "../helpers/test-plugin";
import { ProviderAdapter } from "../../src/providers/adapter";
import { BaseProvider } from "../../src/providers/types";
import type {
	BeforeProviderExecuteContext,
	AfterProviderExecuteContext,
	ProviderRequest,
	ProviderResponse,
} from "../../src/types";

import { PromptContext } from "../../src/plugin";


/**
 * Mock provider for testing
 */
class MockProvider extends BaseProvider {
	public receivedRequests: ProviderRequest[] = [];
	public requestModifications: unknown[] = [];

	constructor() {
		super("mock", {});
	}

	protected getNativeBaseUrl(): string {
		return "http://localhost:3000";
	}

	async execute(request: ProviderRequest): Promise<ProviderResponse> {
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

	reset(): void {
		this.receivedRequests = [];
		this.requestModifications = [];
	}
}

describe("Provider Execution Hooks", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;
	let consoleWarnSpy: MockInstance;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider);
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

				createPrompt(): string {
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

				createPrompt(): string {
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

				createPrompt(): string {
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

				createPrompt(): string {
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

				createPrompt(): string {
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

			// Check sections array (BeforeProviderExecuteContext extends DimensionContext)
			expect(capturedContext!.sections).toHaveLength(1);
			expect(capturedContext!.sections[0]?.content).toBe("Test content");
		});

		test("should handle errors gracefully", async () => {
			const errors: string[] = [];

			class ErrorBeforeProviderPlugin extends TestPlugin {
				constructor() {
					super("error-before-provider", "Error Before Provider", "Test");
					this.dimensions = ["test"];
				}

				createPrompt(): string {
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

				createPrompt(context: PromptContext): string {
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

				createPrompt(): string {
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
			interface EnhancedData {
				result?: string;
				requestInput?: string | string[];
				enhanced?: boolean;
				timestamp?: number;
				originalResult?: unknown;
			}

			class ModifyResponsePlugin extends TestPlugin {
				constructor() {
					super("modify-response", "Modify Response", "Test");
					this.dimensions = ["test"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				afterProviderExecute(
					context: AfterProviderExecuteContext,
				): ProviderResponse {
					const currentData = context.result.data as EnhancedData | undefined;

					return {
						...context.result,
						data: {
							...(currentData || {}),
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

			const testData = result.sections[0]?.results.test?.data as
				EnhancedData | undefined;

			expect(testData?.enhanced).toBe(true);
			expect(testData?.timestamp).toBeDefined();
			expect(testData?.originalResult).toBeDefined();
		});

		test("should modify metadata in response", async () => {
			interface EnhancedMetadata {
				model?: string;
				provider?: string;
				tokens?: {
					inputTokens: number;
					outputTokens: number;
					totalTokens: number;
				};
				enhanced?: boolean;
				processingTime?: number;
			}

			class MetadataResponsePlugin extends TestPlugin {
				constructor() {
					super("metadata-response", "Metadata Response", "Test");
					this.dimensions = ["test"];
				}

				createPrompt(): string {
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

			const testMetadata = result.sections[0]?.results.test?.metadata as
				EnhancedMetadata | undefined;

			expect(testMetadata?.enhanced).toBe(true);
			expect(testMetadata?.processingTime).toBeDefined();
		});

		test("should handle async afterProviderExecute", async () => {
			let asyncCompleted = false;

			class AsyncAfterProviderPlugin extends TestPlugin {
				constructor() {
					super("async-after-provider", "Async After Provider", "Test");
					this.dimensions = ["test"];
				}

				createPrompt(): string {
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

				createPrompt(): string {
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

				createPrompt(): string {
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
			interface FilterableData {
				result?: string;
				requestInput?: string | string[];
				[key: string]: unknown;
			}

			class FilterResponsePlugin extends TestPlugin {
				constructor() {
					super("filter-response", "Filter Response", "Test");
					this.dimensions = ["test"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				afterProviderExecute(
					context: AfterProviderExecuteContext,
				): ProviderResponse {
					const data = context.result.data as FilterableData | undefined;

					if (data) {
						const { requestInput, ...filteredData } = data;
						return {
							...context.result,
							data: filteredData,
						};
					}

					return context.result;
				}
			}

			const engine = new DagEngine({
				plugin: new FilterResponsePlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }]);

			const testData = result.sections[0]?.results.test?.data as
				FilterableData | undefined;

			expect(testData?.result).toBeDefined();
			expect(testData?.requestInput).toBeUndefined();
		});

		test("should work with both before and after hooks", async () => {
			const executionLog: string[] = [];

			interface ModifiedData {
				result?: string;
				requestInput?: string | string[];
				modifiedBy?: string;
			}

			class BothHooksPlugin extends TestPlugin {
				constructor() {
					super("both-hooks", "Both Hooks", "Test");
					this.dimensions = ["test"];
				}

				createPrompt(): string {
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
					const currentData = context.result.data as ModifiedData | undefined;

					return {
						...context.result,
						data: {
							...(currentData || {}),
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

			const testData = result.sections[0]?.results.test?.data as
				ModifiedData | undefined;
			expect(testData?.modifiedBy).toBe("after");
		});
	});
});