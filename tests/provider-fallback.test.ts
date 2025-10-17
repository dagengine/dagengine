import { describe, test, expect, beforeEach, vi } from "vitest";
import { DagEngine } from "../src/core/engine";
import { Plugin } from "../src/plugin";
import { ProviderRegistry } from "../src/providers/registry";
import {
	BaseProvider,
	ProviderConfig,
	type ProviderRequest,
	type ProviderResponse,
} from "../src/providers/types";
import { createMockSection } from "./setup";

interface ProviderTestResponse {
	provider: string;
	result: string;
}

// Mock providers for testing
class PrimaryProvider extends BaseProvider {
	public callCount = 0;
	public shouldFail = true;

	constructor() {
		super("primary", {});
	}

	async execute(request: ProviderRequest): Promise<ProviderResponse> {
		this.callCount++;
		if (this.shouldFail) {
			return { error: "Primary provider failed" };
		}
		return { data: { provider: "primary", result: "success" } };
	}

	getNativeBaseUrl() {
		return '';
	}
}

class FallbackProvider extends BaseProvider {
	public callCount = 0;
	public shouldFail = false;

	constructor() {
		super("fallback", {});
	}

	getNativeBaseUrl() {
		return '';
	}

	async execute(request: ProviderRequest): Promise<ProviderResponse> {
		this.callCount++;
		if (this.shouldFail) {
			return { error: "Fallback provider failed" };
		}
		return { data: { provider: "fallback", result: "success" } };
	}
}

class SecondFallbackProvider extends BaseProvider {
	public callCount = 0;
	public shouldFail = false;

	constructor() {
		super("second-fallback", {});
	}

	async execute(request: ProviderRequest): Promise<ProviderResponse> {
		this.callCount++;
		if (this.shouldFail) {
			return { error: "Second fallback provider failed" };
		}
		return { data: { provider: "second-fallback", result: "success" } };
	}
	getNativeBaseUrl() {
		return '';
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

			selectProvider(): any {
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

		// ✅ Type-safe access
		const analysisData = result.sections[0]?.results?.analysis
			?.data as ProviderTestResponse;
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

			selectProvider(): any {
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

		const analysisData = result.sections[0]?.results?.analysis
			?.data as ProviderTestResponse;
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

			selectProvider(): any {
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

		const analysisData = result.sections[0]?.results?.analysis
			?.data as ProviderTestResponse;
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

			selectProvider(): any {
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

		expect(result.sections[0]?.results?.analysis?.error).toBeDefined();
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

			selectProvider(): any {
				return {
					provider: "primary",
					options: {},
					fallbacks: [
						{
							provider: "fallback",
							options: {},
							retryAfter: 100, // 100ms delay
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

		expect(duration).toBeGreaterThanOrEqual(90); // Allow small margin
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

			selectProvider(): any {
				return {
					provider: "primary",
					options: {},
					// No fallbacks specified
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

		const analysisData = result.sections[0]?.results?.analysis
			?.data as ProviderTestResponse;
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

			selectProvider(): any {
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

		// Should skip nonexistent and use fallback
		expect(fallbackProvider.callCount).toBeGreaterThan(0);

		// ✅ Type-safe access
		const analysisData = result.sections[0]?.results?.analysis
			?.data as ProviderTestResponse;
		expect(analysisData?.provider).toBe("fallback");
	});

	test("should handle per-dimension different fallback strategies", async () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test plugin");
				this.dimensions = ["analysis1", "analysis2"];
			}

			createPrompt(context: any): string {
				return context.dimension;
			}

			selectProvider(dimension: string): any {
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
						// No fallback for analysis2
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

		const analysis1Data = result.sections[0]?.results?.analysis1
			?.data as ProviderTestResponse;
		const analysis2Data = result.sections[0]?.results?.analysis2
			?.data as ProviderTestResponse;

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

			selectProvider(): any {
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
			maxRetries: 2, // 2 retries per provider
		});

		await engine.process([createMockSection("Test")]);

		// Primary should be called multiple times due to retries
		// Then fallback should be called
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

			selectProvider(): any {
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
			?.data as ProviderTestResponse;
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

			selectProvider(): any {
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

		expect(result.sections[0]?.results?.analysis?.error).toBeDefined();
		expect(result.sections[0]?.results?.analysis?.error).toContain("failed");
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

			selectProvider(): any {
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

		// Should have logged fallback warning
		expect(consoleWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining("failed"),
		);

		consoleWarnSpy.mockRestore();
	});
});
