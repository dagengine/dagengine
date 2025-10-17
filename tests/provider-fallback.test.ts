import { describe, test, expect, beforeEach, vi } from "vitest";
import { DagEngine } from "../src/core/engine/dag-engine.ts";
import { Plugin } from "../src/plugin.ts";
import { ProviderRegistry } from "../src/providers/registry.ts";
import { BaseProvider } from "../src/providers/types.ts";
import { createMockSection } from "./setup.ts";
import type {
	ProviderRequest,
	ProviderResponse,
	ProviderSelection,
	PromptContext,
} from "../src/types.ts";

/**
 * Provider test response structure
 */
interface ProviderTestResponse {
	provider: string;
	result: string;
}

/**
 * Mock primary provider for testing fallback scenarios
 */
class PrimaryProvider extends BaseProvider {
	public callCount = 0;
	public shouldFail = true;

	constructor() {
		super("primary", {});
	}

	protected getNativeBaseUrl(): string {
		return "";
	}

	async execute(_request: ProviderRequest): Promise<ProviderResponse> {
		this.callCount++;
		if (this.shouldFail) {
			return { error: "Primary provider failed" };
		}
		return { data: { provider: "primary", result: "success" } };
	}
}

/**
 * Mock fallback provider
 */
class FallbackProvider extends BaseProvider {
	public callCount = 0;
	public shouldFail = false;

	constructor() {
		super("fallback", {});
	}

	protected getNativeBaseUrl(): string {
		return "";
	}

	async execute(_request: ProviderRequest): Promise<ProviderResponse> {
		this.callCount++;
		if (this.shouldFail) {
			return { error: "Fallback provider failed" };
		}
		return { data: { provider: "fallback", result: "success" } };
	}
}

/**
 * Mock second fallback provider
 */
class SecondFallbackProvider extends BaseProvider {
	public callCount = 0;
	public shouldFail = false;

	constructor() {
		super("second-fallback", {});
	}

	protected getNativeBaseUrl(): string {
		return "";
	}

	async execute(_request: ProviderRequest): Promise<ProviderResponse> {
		this.callCount++;
		if (this.shouldFail) {
			return { error: "Second fallback provider failed" };
		}
		return { data: { provider: "second-fallback", result: "success" } };
	}
}

describe("DagEngine - Provider Fallback", () => {
	let primaryProvider: PrimaryProvider;
	let fallbackProvider: FallbackProvider;
	let secondFallbackProvider: SecondFallbackProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		primaryProvider = new PrimaryProvider();
		fallbackProvider = new FallbackProvider();
		secondFallbackProvider = new SecondFallbackProvider();

		registry = new ProviderRegistry();
		registry.register(primaryProvider);
		registry.register(fallbackProvider);
		registry.register(secondFallbackProvider);

		// Reset state
		primaryProvider.callCount = 0;
		fallbackProvider.callCount = 0;
		secondFallbackProvider.callCount = 0;
		primaryProvider.shouldFail = true;
		fallbackProvider.shouldFail = false;
		secondFallbackProvider.shouldFail = false;
	});

	test("should use primary provider when it succeeds", async () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test plugin");
				this.dimensions = ["analysis"];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return {
					provider: "primary",
					options: {},
					fallbacks: [{ provider: "fallback", options: {} }],
				};
			}
		}

		primaryProvider.shouldFail = false;

		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
			maxRetries: 0,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(primaryProvider.callCount).toBeGreaterThan(0);
		expect(fallbackProvider.callCount).toBe(0);

		const analysisData = result.sections[0]?.results.analysis
			?.data as ProviderTestResponse | undefined;
		expect(analysisData?.provider).toBe("primary");
	});

	test("should fallback when primary provider fails", async () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test plugin");
				this.dimensions = ["analysis"];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return {
					provider: "primary",
					options: {},
					fallbacks: [{ provider: "fallback", options: {} }],
				};
			}
		}

		primaryProvider.shouldFail = true;
		fallbackProvider.shouldFail = false;

		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
			maxRetries: 0,
			continueOnError: true,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(primaryProvider.callCount).toBeGreaterThan(0);
		expect(fallbackProvider.callCount).toBeGreaterThan(0);

		const analysisData = result.sections[0]?.results.analysis
			?.data as ProviderTestResponse | undefined;
		expect(analysisData?.provider).toBe("fallback");
	});

	test("should try multiple fallbacks in order", async () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test plugin");
				this.dimensions = ["analysis"];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return {
					provider: "primary",
					options: {},
					fallbacks: [
						{ provider: "fallback", options: {} },
						{ provider: "second-fallback", options: {} },
					],
				};
			}
		}

		primaryProvider.shouldFail = true;
		fallbackProvider.shouldFail = true;
		secondFallbackProvider.shouldFail = false;

		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
			maxRetries: 0,
			continueOnError: true,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(primaryProvider.callCount).toBeGreaterThan(0);
		expect(fallbackProvider.callCount).toBeGreaterThan(0);
		expect(secondFallbackProvider.callCount).toBeGreaterThan(0);

		const analysisData = result.sections[0]?.results.analysis
			?.data as ProviderTestResponse | undefined;
		expect(analysisData?.provider).toBe("second-fallback");
	});

	test("should fail when all providers fail", async () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test plugin");
				this.dimensions = ["analysis"];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return {
					provider: "primary",
					options: {},
					fallbacks: [{ provider: "fallback", options: {} }],
				};
			}
		}

		primaryProvider.shouldFail = true;
		fallbackProvider.shouldFail = true;

		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
			maxRetries: 0,
			continueOnError: true,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(result.sections[0]?.results.analysis?.error).toBeDefined();
		expect(primaryProvider.callCount).toBeGreaterThan(0);
		expect(fallbackProvider.callCount).toBeGreaterThan(0);
	});

	test("should respect retryAfter delay between fallbacks", async () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test plugin");
				this.dimensions = ["analysis"];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return {
					provider: "primary",
					options: {},
					fallbacks: [
						{
							provider: "fallback",
							options: {},
							retryAfter: 100,
						},
					],
				};
			}
		}

		primaryProvider.shouldFail = true;
		fallbackProvider.shouldFail = false;

		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
			maxRetries: 0,
		});

		const startTime = Date.now();
		await engine.process([createMockSection("Test")]);
		const duration = Date.now() - startTime;

		expect(duration).toBeGreaterThanOrEqual(90);
		expect(fallbackProvider.callCount).toBeGreaterThan(0);
	});

	test("should work without fallbacks (backward compatible)", async () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test plugin");
				this.dimensions = ["analysis"];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return {
					provider: "primary",
					options: {},
				};
			}
		}

		primaryProvider.shouldFail = false;

		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
			maxRetries: 0,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(primaryProvider.callCount).toBeGreaterThan(0);

		const analysisData = result.sections[0]?.results.analysis
			?.data as ProviderTestResponse | undefined;
		expect(analysisData?.provider).toBe("primary");
	});

	test("should handle nonexistent fallback provider gracefully", async () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test plugin");
				this.dimensions = ["analysis"];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return {
					provider: "primary",
					options: {},
					fallbacks: [
						{ provider: "nonexistent", options: {} },
						{ provider: "fallback", options: {} },
					],
				};
			}
		}

		primaryProvider.shouldFail = true;
		fallbackProvider.shouldFail = false;

		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
			maxRetries: 0,
			continueOnError: true,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(fallbackProvider.callCount).toBeGreaterThan(0);

		const analysisData = result.sections[0]?.results.analysis
			?.data as ProviderTestResponse | undefined;
		expect(analysisData?.provider).toBe("fallback");
	});

	test("should handle per-dimension different fallback strategies", async () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test plugin");
				this.dimensions = ["analysis1", "analysis2"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(dimension: string): ProviderSelection {
				if (dimension === "analysis1") {
					return {
						provider: "primary",
						options: {},
						fallbacks: [{ provider: "fallback", options: {} }],
					};
				} else {
					return {
						provider: "fallback",
						options: {},
					};
				}
			}
		}

		primaryProvider.shouldFail = true;
		fallbackProvider.shouldFail = false;

		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
			maxRetries: 0,
		});

		const result = await engine.process([createMockSection("Test")]);

		const analysis1Data = result.sections[0]?.results.analysis1
			?.data as ProviderTestResponse | undefined;
		const analysis2Data = result.sections[0]?.results.analysis2
			?.data as ProviderTestResponse | undefined;

		expect(analysis1Data?.provider).toBe("fallback");
		expect(analysis2Data?.provider).toBe("fallback");
	});

	test("should apply retries to each provider attempt", async () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test plugin");
				this.dimensions = ["analysis"];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return {
					provider: "primary",
					options: {},
					fallbacks: [{ provider: "fallback", options: {} }],
				};
			}
		}

		primaryProvider.shouldFail = true;
		fallbackProvider.shouldFail = false;

		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
			maxRetries: 2,
		});

		await engine.process([createMockSection("Test")]);

		expect(primaryProvider.callCount).toBeGreaterThan(1);
		expect(fallbackProvider.callCount).toBeGreaterThan(0);
	});

	test("should work with global dimensions", async () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test plugin");
				this.dimensions = [
					{ name: "global_analysis", scope: "global" as const },
				];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return {
					provider: "primary",
					options: {},
					fallbacks: [{ provider: "fallback", options: {} }],
				};
			}
		}

		primaryProvider.shouldFail = true;
		fallbackProvider.shouldFail = false;

		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
			maxRetries: 0,
		});

		const result = await engine.process([createMockSection("Test")]);

		const globalData = result.globalResults.global_analysis
			?.data as ProviderTestResponse | undefined;
		expect(globalData?.provider).toBe("fallback");
	});

	test("should preserve error context when all fallbacks fail", async () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test plugin");
				this.dimensions = ["analysis"];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return {
					provider: "primary",
					options: {},
					fallbacks: [{ provider: "fallback", options: {} }],
				};
			}
		}

		primaryProvider.shouldFail = true;
		fallbackProvider.shouldFail = true;

		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
			maxRetries: 0,
			continueOnError: true,
		});

		const result = await engine.process([createMockSection("Test")]);

		const error = result.sections[0]?.results.analysis?.error;
		expect(error).toBeDefined();
		expect(error).toContain("failed");
	});

	test("should log warnings when falling back", async () => {
		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test plugin");
				this.dimensions = ["analysis"];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return {
					provider: "primary",
					options: {},
					fallbacks: [{ provider: "fallback", options: {} }],
				};
			}
		}

		primaryProvider.shouldFail = true;
		fallbackProvider.shouldFail = false;

		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
			maxRetries: 0,
		});

		await engine.process([createMockSection("Test")]);

		expect(consoleWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining("failed"),
		);

		consoleWarnSpy.mockRestore();
	});
});