import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { ProviderExecutor } from "../../src/core/execution/provider-executor.js";
import { ProviderAdapter } from "../../src/providers/adapter.js";
import { Plugin } from "../../src/plugin.js";
import { HookExecutor } from "../../src/core/lifecycle/hook-executor.js";
import { ProviderRegistry } from "../../src/providers/registry.js";
import { MockAIProvider, createMockSection } from "../setup.js";
import {
	ProviderNotFoundError,
	AllProvidersFailed,
} from "../../src/core/shared/errors.js";
import type {
	PromptContext,
	ProviderSelection,
	SectionData,
	DimensionDependencies,
	DimensionContext,
	ProviderRequest,
	ProviderResponse,
	DimensionResult,
} from "../../src/types.js";

// ============================================================================
// TEST HELPERS
// ============================================================================

function createDimensionContext(
	sections: SectionData[],
	dimension: string = "dim1",
	dependencies: DimensionDependencies = {},
	isGlobal: boolean = false
): DimensionContext {
	return {
		timestamp: new Date().getTime(),
		processId: '',
		dimension,
		isGlobal,
		sections,
		dependencies,
		globalResults: {},
	};
}

class TestPlugin extends Plugin {
	public mockPrompt = "Test prompt";
	public mockProvider: ProviderSelection = {
		provider: "mock-ai",
		options: { model: "test-model" },
	};
	public shouldThrowOnPrompt = false;
	public shouldThrowOnProviderSelect = false;

	constructor() {
		super("test", "Test Plugin", "Test");
		this.dimensions = ["dim1", "dim2"];
	}

	createPrompt(context: PromptContext): string {
		if (this.shouldThrowOnPrompt) {
			throw new Error("Prompt creation failed");
		}
		return this.mockPrompt;
	}

	selectProvider(): ProviderSelection {
		if (this.shouldThrowOnProviderSelect) {
			throw new Error("Provider selection failed");
		}
		return this.mockProvider;
	}
}

// ============================================================================
// BASIC EXECUTION TESTS
// ============================================================================

describe("ProviderExecutor - Basic Execution", () => {
	let executor: ProviderExecutor;
	let adapter: ProviderAdapter;
	let plugin: TestPlugin;
	let hookExecutor: HookExecutor;
	let mockProvider: MockAIProvider;

	beforeEach(() => {
		plugin = new TestPlugin();
		mockProvider = new MockAIProvider();
		mockProvider.reset()

		const registry = new ProviderRegistry();
		registry.register(mockProvider);

		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider);

		hookExecutor = new HookExecutor(plugin, {});

		executor = new ProviderExecutor(adapter, plugin, hookExecutor, 3, 100);
	});

	afterEach(() => {
		mockProvider.reset();
	});

	test("should execute dimension successfully", async () => {
		const sections = [createMockSection("Test content")];
		const dimensionContext = createDimensionContext(sections);

		mockProvider.setMockResponse("test-model-Test prompt", {
			result: "success",
		});

		const result = await executor.execute(
			"dim1",
			sections,
			{},
			false,
			dimensionContext
		);

		expect(result.data).toEqual({ result: "mock response" });
		expect(mockProvider.callCount).toBe(1);
	});

	test("should pass correct request to provider", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		await executor.execute("dim1", sections, {}, false, dimensionContext);

		expect(mockProvider.lastRequest).toBeDefined();
		expect(mockProvider.lastRequest?.input).toBe("Test prompt");
		expect(mockProvider.lastRequest?.dimension).toBe("dim1");
		expect(mockProvider.lastRequest?.isGlobal).toBe(false);
	});

	test("should handle global dimension", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections, "dim1", {}, true);

		await executor.execute("dim1", sections, {}, true, dimensionContext);

		expect(mockProvider.lastRequest?.isGlobal).toBe(true);
	});

	test("should throw error when no sections provided", async () => {
		const sections: SectionData[] = [];
		const dimensionContext = createDimensionContext(sections);

		await expect(
			executor.execute("dim1", sections, {}, false, dimensionContext)
		).rejects.toThrow('No sections provided for dimension "dim1"');
	});
});

// ============================================================================
// RETRY LOGIC TESTS
// ============================================================================

describe("ProviderExecutor - Retry Logic", () => {
	let executor: ProviderExecutor;
	let adapter: ProviderAdapter;
	let plugin: TestPlugin;
	let hookExecutor: HookExecutor;
	let mockProvider: MockAIProvider;

	beforeEach(() => {
		plugin = new TestPlugin();
		mockProvider = new MockAIProvider();

		const registry = new ProviderRegistry();
		registry.register(mockProvider);

		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider);

		hookExecutor = new HookExecutor(plugin, {});

		executor = new ProviderExecutor(adapter, plugin, hookExecutor, 3, 100);
	});

	afterEach(() => {
		mockProvider.reset();
	});


	test("should throw AllProvidersFailed after max retries", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		mockProvider.shouldFail = true;

		await expect(
			executor.execute("dim1", sections, {}, false, dimensionContext)
		).rejects.toThrow(AllProvidersFailed);
	});

	test("should call retry hook on failure", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		const retryHook = vi.fn(async () => ({
			shouldRetry: true,
		}));
		plugin.handleRetry = retryHook;

		mockProvider.shouldFail = true;

		await expect(
			executor.execute("dim1", sections, {}, false, dimensionContext)
		).rejects.toThrow();

		expect(retryHook).toHaveBeenCalled();
	});


	test("should modify request from retry hook", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		const modifiedRequest: ProviderRequest = {
			input: "Modified prompt",
			options: { model: "modified-model" },
			dimension: "dim1",
			isGlobal: false,
			metadata: { totalSections: 1 },
		};

		plugin.handleRetry = vi.fn(async () => ({
			shouldRetry: true,
			modifiedRequest,
		}));

		let attemptCount = 0;
		mockProvider.execute = vi.fn(async (req: ProviderRequest) => {
			attemptCount++;
			if (attemptCount < 2) {
				throw new Error("Fail once");
			}
			expect(req.input).toBe("Modified prompt");
			return {
				content: "success",
				metadata: {
					model: "test-model",
					custom: "data",
				},
				usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
				model: "test",
				finishReason: "stop",
			};
		});

		await executor.execute("dim1", sections, {}, false, dimensionContext);

		expect(attemptCount).toBe(2);
	});
});

// ============================================================================
// FALLBACK TESTS
// ============================================================================

describe("ProviderExecutor - Fallback Logic", () => {
	let executor: ProviderExecutor;
	let adapter: ProviderAdapter;
	let plugin: TestPlugin;
	let hookExecutor: HookExecutor;
	let mockProvider: MockAIProvider;
	let fallbackProvider: MockAIProvider;

	beforeEach(() => {
		plugin = new TestPlugin();
		mockProvider = new MockAIProvider();
		fallbackProvider = new MockAIProvider({ name: "fallback-provider" });

		const registry = new ProviderRegistry();
		registry.register(mockProvider);
		registry.register(fallbackProvider);

		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider);
		adapter.registerProvider(fallbackProvider);

		hookExecutor = new HookExecutor(plugin, {});

		executor = new ProviderExecutor(adapter, plugin, hookExecutor, 3, 100);
	});

	afterEach(() => {
		mockProvider.reset();
		fallbackProvider.reset();
	});

	test("should stop fallback when hook returns shouldFallback: false", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		plugin.mockProvider = {
			provider: "mock-ai",
			options: {},
			fallbacks: [{ provider: "fallback-provider", options: {} }],
		};

		plugin.handleProviderFallback = vi.fn(async () => ({
			shouldFallback: false,
		}));

		mockProvider.shouldFail = true;

		await expect(
			executor.execute("dim1", sections, {}, false, dimensionContext)
		).rejects.toThrow();

		expect(fallbackProvider.callCount).toBe(0);
	});

	test("should wait retryAfter before fallback", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		plugin.mockProvider = {
			provider: "mock-ai",
			options: {},
			fallbacks: [
				{
					provider: "fallback-provider",
					options: {},
					retryAfter: 200,
				},
			],
		};

		const startTime = Date.now();
		mockProvider.shouldFail = true;
		fallbackProvider.setMockResponse("test-model-Test prompt", "success");

		await executor.execute("dim1", sections, {}, false, dimensionContext);

		const duration = Date.now() - startTime;
		expect(duration).toBeGreaterThanOrEqual(200);
	});

	test("should apply delay from fallback hook", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		plugin.mockProvider = {
			provider: "mock-ai",
			options: {},
			fallbacks: [{ provider: "fallback-provider", options: {} }],
		};

		plugin.handleProviderFallback = vi.fn(async () => ({
			shouldFallback: true,
			delayMs: 200,
		}));

		const startTime = Date.now();
		mockProvider.shouldFail = true;
		fallbackProvider.setMockResponse("test-model-Test prompt", "success");

		await executor.execute("dim1", sections, {}, false, dimensionContext);

		const duration = Date.now() - startTime;
		expect(duration).toBeGreaterThanOrEqual(200);
	});
});

// ============================================================================
// DIMENSION FAILURE HOOK TESTS
// ============================================================================

describe("ProviderExecutor - Dimension Failure Hook", () => {
	let executor: ProviderExecutor;
	let adapter: ProviderAdapter;
	let plugin: TestPlugin;
	let hookExecutor: HookExecutor;
	let mockProvider: MockAIProvider;

	beforeEach(() => {
		plugin = new TestPlugin();
		mockProvider = new MockAIProvider();

		const registry = new ProviderRegistry();
		registry.register(mockProvider);

		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider);

		hookExecutor = new HookExecutor(plugin, {});

		executor = new ProviderExecutor(adapter, plugin, hookExecutor, 3, 100);
	});

	afterEach(() => {
		mockProvider.reset();
	});

	test("should call dimension failure hook when all providers fail", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		const failureHook = vi.fn(async () => undefined);
		plugin.handleDimensionFailure = failureHook;

		mockProvider.shouldFail = true;

		await expect(
			executor.execute("dim1", sections, {}, false, dimensionContext)
		).rejects.toThrow();

		expect(failureHook).toHaveBeenCalled();
	});

	test("should return fallback result from failure hook", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		const fallbackResult: DimensionResult = {
			data: "fallback from hook",
			metadata: { fallback: true },
		};

		plugin.handleDimensionFailure = vi.fn(async () => fallbackResult);

		mockProvider.shouldFail = true;

		const result = await executor.execute(
			"dim1",
			sections,
			{},
			false,
			dimensionContext
		);

		expect(result).toEqual(fallbackResult);
	});

	test("should throw AllProvidersFailed when hook returns undefined", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		plugin.handleDimensionFailure = vi.fn(async () => undefined);

		mockProvider.shouldFail = true;

		await expect(
			executor.execute("dim1", sections, {}, false, dimensionContext)
		).rejects.toThrow(AllProvidersFailed);
	});
});

// ============================================================================
// GATEWAY MODE TESTS
// ============================================================================

describe("ProviderExecutor - Hook Integration", () => {
	let executor: ProviderExecutor;
	let adapter: ProviderAdapter;
	let plugin: TestPlugin;
	let hookExecutor: HookExecutor;
	let mockProvider: MockAIProvider;

	beforeEach(() => {
		plugin = new TestPlugin();
		mockProvider = new MockAIProvider();

		const registry = new ProviderRegistry();
		registry.register(mockProvider);

		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider);

		hookExecutor = new HookExecutor(plugin, {});

		executor = new ProviderExecutor(adapter, plugin, hookExecutor, 3, 100);
	});

	afterEach(() => {
		mockProvider.reset();
	});

	test("should call beforeProviderExecute hook", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		const beforeHook = vi.fn(async (context: any) => context.request);
		plugin.beforeProviderExecute = beforeHook;

		await executor.execute("dim1", sections, {}, false, dimensionContext);

		expect(beforeHook).toHaveBeenCalled();
	});

	test("should call afterProviderExecute hook", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		const afterHook = vi.fn(async (context: any) => context.result);
		plugin.afterProviderExecute = afterHook;

		await executor.execute("dim1", sections, {}, false, dimensionContext);

		expect(afterHook).toHaveBeenCalled();
	});

	test("should modify request via beforeProviderExecute hook", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		plugin.beforeProviderExecute = vi.fn(async (context: any) => ({
			...context.request,
			input: "Modified by hook",
		}));

		await executor.execute("dim1", sections, {}, false, dimensionContext);

		expect(mockProvider.lastRequest?.input).toBe("Modified by hook");
	});

	test("should modify response via afterProviderExecute hook", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		plugin.afterProviderExecute = vi.fn(async (context: any) => ({
			...context.result,
			data: "Modified by after hook",
		}));

		const result = await executor.execute(
			"dim1",
			sections,
			{},
			false,
			dimensionContext
		);

		expect(result.data).toBe("Modified by after hook");
	});
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe("ProviderExecutor - Edge Cases", () => {
	let executor: ProviderExecutor;
	let adapter: ProviderAdapter;
	let plugin: TestPlugin;
	let hookExecutor: HookExecutor;
	let mockProvider: MockAIProvider;

	beforeEach(() => {
		plugin = new TestPlugin();
		mockProvider = new MockAIProvider();

		const registry = new ProviderRegistry();
		registry.register(mockProvider);

		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider);

		hookExecutor = new HookExecutor(plugin, {});

		executor = new ProviderExecutor(adapter, plugin, hookExecutor, 0, 100);
	});

	afterEach(() => {
		mockProvider.reset();
	});

	test("should handle zero max retries", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		mockProvider.shouldFail = true;

		await expect(
			executor.execute("dim1", sections, {}, false, dimensionContext)
		).rejects.toThrow();

		expect(mockProvider.callCount).toBe(1);
	});

	test("should handle response with metadata", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		mockProvider.execute = vi.fn(async () => ({
			content: "success",
			metadata: {
				model: "test-model",
				custom: "data",
			},
			usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
			model: "test",
			finishReason: "stop",
		}));

		const result = await executor.execute(
			"dim1",
			sections,
			{},
			false,
			dimensionContext
		);

		expect(result.metadata).toBeDefined();
	});

	test("should handle multiple sections", async () => {
		const sections = [
			createMockSection("Section 1"),
			createMockSection("Section 2"),
			createMockSection("Section 3"),
		];
		const dimensionContext = createDimensionContext(sections);

		await executor.execute("dim1", sections, {}, false, dimensionContext);

		expect(mockProvider.lastRequest?.metadata?.totalSections).toBe(3);
	});

	test("should handle dependencies", async () => {
		const sections = [createMockSection("Test")];
		const dependencies: DimensionDependencies = {
			dep1: { data: "value1" },
			dep2: { data: "value2" },
		};
		const dimensionContext = createDimensionContext(sections, "dim1", dependencies);

		await executor.execute("dim1", sections, dependencies, false, dimensionContext);

		expect(mockProvider.callCount).toBe(1);
	});

	test("should handle empty provider options", async () => {
		const sections = [createMockSection("Test")];
		const dimensionContext = createDimensionContext(sections);

		plugin.mockProvider = {
			provider: "mock-ai",
			options: {},
		};

		await executor.execute("dim1", sections, {}, false, dimensionContext);

		expect(mockProvider.lastRequest?.options).toEqual({});
	});
});