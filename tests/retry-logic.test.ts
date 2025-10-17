import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../src/core/engine/dag-engine.ts";
import { Plugin } from "../src/plugin.ts";
import { ProviderRegistry } from "../src/providers/registry.ts";
import { MockAIProvider, createMockSection } from "./setup.ts";
import type {
	PromptContext,
	ProviderRequest,
	ProviderResponse,
} from "../src/types.ts";

/**
 * Attempt tracking for retry tests
 */
interface AttemptTracking {
	[dimension: string]: number;
}

describe("DagEngine - Retry Logic", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should retry failed requests up to maxRetries", async () => {
		class RetryPlugin extends Plugin {
			constructor() {
				super("retry", "Retry", "Test retry");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		let attemptCount = 0;
		const originalExecute = mockProvider.execute.bind(mockProvider);

		mockProvider.execute = async (request: ProviderRequest): Promise<ProviderResponse> => {
			attemptCount++;
			if (attemptCount < 3) {
				throw new Error("Simulated failure");
			}
			return originalExecute(request);
		};

		const engine = new DagEngine({
			plugin: new RetryPlugin(),
			registry,
			maxRetries: 3,
			continueOnError: false,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(attemptCount).toBe(3);
		expect(result.sections[0]?.results.test?.data).toBeDefined();
	});

	test("should use exponential backoff", async () => {
		class BackoffPlugin extends Plugin {
			constructor() {
				super("backoff", "Backoff", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		const timestamps: number[] = [];
		let attemptCount = 0;
		const originalExecute = mockProvider.execute.bind(mockProvider);

		mockProvider.execute = async (request: ProviderRequest): Promise<ProviderResponse> => {
			timestamps.push(Date.now());
			attemptCount++;
			if (attemptCount < 3) {
				throw new Error("Fail");
			}
			return originalExecute(request);
		};

		const engine = new DagEngine({
			plugin: new BackoffPlugin(),
			registry,
			maxRetries: 3,
			retryDelay: 100,
			continueOnError: false,
		});

		await engine.process([createMockSection("Test")]);

		// Check exponential backoff: delays should be ~100ms, ~200ms
		const firstTimestamp = timestamps[0];
		const secondTimestamp = timestamps[1];
		const thirdTimestamp = timestamps[2];

		if (firstTimestamp && secondTimestamp && thirdTimestamp) {
			const delay1 = secondTimestamp - firstTimestamp;
			const delay2 = thirdTimestamp - secondTimestamp;

			expect(delay1).toBeGreaterThanOrEqual(90); // ~100ms
			expect(delay2).toBeGreaterThanOrEqual(180); // ~200ms (2^1 * 100)
		}
	});

	test("should respect custom retryDelay", async () => {
		class DelayPlugin extends Plugin {
			constructor() {
				super("delay", "Delay", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		const timestamps: number[] = [];
		let attemptCount = 0;
		const originalExecute = mockProvider.execute.bind(mockProvider);

		mockProvider.execute = async (request: ProviderRequest): Promise<ProviderResponse> => {
			timestamps.push(Date.now());
			attemptCount++;
			if (attemptCount < 2) {
				throw new Error("Fail");
			}
			return originalExecute(request);
		};

		const engine = new DagEngine({
			plugin: new DelayPlugin(),
			registry,
			maxRetries: 2,
			retryDelay: 500,
			continueOnError: false,
		});

		await engine.process([createMockSection("Test")]);

		const firstTimestamp = timestamps[0];
		const secondTimestamp = timestamps[1];

		if (firstTimestamp && secondTimestamp) {
			const delay = secondTimestamp - firstTimestamp;
			expect(delay).toBeGreaterThanOrEqual(450); // ~500ms
		}
	});

	test("should succeed on final retry attempt", async () => {
		class FinalRetryPlugin extends Plugin {
			constructor() {
				super("final", "Final", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		let attemptCount = 0;
		const originalExecute = mockProvider.execute.bind(mockProvider);

		mockProvider.execute = async (request: ProviderRequest): Promise<ProviderResponse> => {
			attemptCount++;
			if (attemptCount <= 3) {
				// Fail 3 times, succeed on 4th
				throw new Error("Fail");
			}
			return originalExecute(request);
		};

		mockProvider.setMockResponse("test", { success: true });

		const engine = new DagEngine({
			plugin: new FinalRetryPlugin(),
			registry,
			maxRetries: 3, // Will try 4 times total (initial + 3 retries)
			retryDelay: 10,
			continueOnError: false,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(attemptCount).toBe(4);
		expect(result.sections[0]?.results.test?.data).toEqual({ success: true });
	});

	test("should throw error after max retries exhausted", async () => {
		class MaxRetriesPlugin extends Plugin {
			constructor() {
				super("max", "Max", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.execute = async (): Promise<ProviderResponse> => {
			throw new Error("Persistent failure");
		};

		const engine = new DagEngine({
			plugin: new MaxRetriesPlugin(),
			registry,
			maxRetries: 2,
			retryDelay: 10,
			continueOnError: true,
		});

		const result = await engine.process([createMockSection("Test")]);

		const testResult = result.sections[0]?.results.test;
		expect(testResult?.error).toBeDefined();
		expect(testResult?.error).toContain(
			'All providers failed for dimension "test". Tried: mock-ai',
		);
	});

	test("should not retry successful requests", async () => {
		class SuccessPlugin extends Plugin {
			constructor() {
				super("success", "Success", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		let attemptCount = 0;
		const originalExecute = mockProvider.execute.bind(mockProvider);

		mockProvider.execute = async (request: ProviderRequest): Promise<ProviderResponse> => {
			attemptCount++;
			return originalExecute(request);
		};

		mockProvider.setMockResponse("test", { success: true });

		const engine = new DagEngine({
			plugin: new SuccessPlugin(),
			registry,
			maxRetries: 3,
			retryDelay: 100,
		});

		await engine.process([createMockSection("Test")]);

		expect(attemptCount).toBe(1); // Only one attempt for success
	});

	test("should retry each dimension independently", async () => {
		class MultiDimensionPlugin extends Plugin {
			constructor() {
				super("multi", "Multi", "Test");
				this.dimensions = ["dim1", "dim2"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		const attempts: AttemptTracking = { dim1: 0, dim2: 0 };
		const originalExecute = mockProvider.execute.bind(mockProvider);

		mockProvider.execute = async (request: ProviderRequest): Promise<ProviderResponse> => {
			const dim = request.input as string;
			attempts[dim] = (attempts[dim] ?? 0) + 1;

			if (dim === "dim1" && attempts[dim]! < 2) {
				throw new Error("Fail dim1");
			}
			if (dim === "dim2" && attempts[dim]! < 3) {
				throw new Error("Fail dim2");
			}

			return originalExecute(request);
		};

		const engine = new DagEngine({
			plugin: new MultiDimensionPlugin(),
			registry,
			maxRetries: 3,
			retryDelay: 10,
		});

		await engine.process([createMockSection("Test")]);

		expect(attempts.dim1).toBe(2);
		expect(attempts.dim2).toBe(3);
	});
});