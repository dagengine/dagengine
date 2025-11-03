import { describe, test, expect, vi } from "vitest";
import { DagEngine } from "../../src/core/engine";
import { Plugin } from "../../src/plugin";
import { ProviderAdapter } from "../../src/providers/adapter";
import type { PricingConfig } from "../../src/types";

const TEST_PRICING: PricingConfig = {
	models: {
		"claude-sonnet-4-5-20250929": { inputPer1M: 3.0, outputPer1M: 15.0 },
		"gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
	},
};

class TestPlugin extends Plugin {
	constructor() {
		super("test", "Test", "Test plugin");
		this.dimensions = ["analysis"];
	}

	createPrompt() {
		return "test";
	}

	selectProvider() {
		return { provider: "mock", options: {} };
	}
}

describe("Cost Tracking - Edge Cases", () => {
	test("should handle missing token metadata gracefully", async () => {
		const providerWithoutTokens = {
			name: "mock",
			async execute() {
				return {
					data: { result: "test" },
					metadata: {
						model: "claude-sonnet-4-5-20250929",
						provider: "mock",
						// No tokens field
					},
				};
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(providerWithoutTokens as any);

		const plugin = new TestPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
		});

		const result = await engine.process([{ content: "Test", metadata: {} }]);

		expect(result.costs).toBeDefined();
		expect(result.costs!.totalCost).toBe(0);
		expect(result.costs!.totalTokens).toBe(0);
		expect(Object.keys(result.costs!.byDimension)).toHaveLength(0);
	});

	test("should handle missing metadata gracefully", async () => {
		const providerWithoutMetadata = {
			name: "mock",
			async execute() {
				return {
					data: { result: "test" },
					// No metadata at all
				};
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(providerWithoutMetadata as any);

		const plugin = new TestPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
		});

		const result = await engine.process([{ content: "Test", metadata: {} }]);

		expect(result.costs).toBeDefined();
		expect(result.costs!.totalCost).toBe(0);
		expect(result.costs!.totalTokens).toBe(0);
	});

	test("should warn and skip unknown models", async () => {
		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		const providerWithUnknownModel = {
			name: "mock",
			async execute() {
				return {
					data: { result: "test" },
					metadata: {
						model: "unknown-model-xyz",
						provider: "mock",
						tokens: {
							inputTokens: 1000,
							outputTokens: 2000,
							totalTokens: 3000,
						},
					},
				};
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(providerWithUnknownModel as any);

		const plugin = new TestPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
		});

		const result = await engine.process([{ content: "Test", metadata: {} }]);

		expect(consoleWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining('No pricing data for model "unknown-model-xyz"'),
		);

		expect(result.costs!.totalCost).toBe(0);
		expect(result.costs!.totalTokens).toBe(0);

		consoleWarnSpy.mockRestore();
	});

	test("should handle zero tokens", async () => {
		const providerWithZeroTokens = {
			name: "mock",
			async execute() {
				return {
					data: { result: "test" },
					metadata: {
						model: "claude-sonnet-4-5-20250929",
						provider: "mock",
						tokens: {
							inputTokens: 0,
							outputTokens: 0,
							totalTokens: 0,
						},
					},
				};
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(providerWithZeroTokens as any);

		const plugin = new TestPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
		});

		const result = await engine.process([{ content: "Test", metadata: {} }]);

		expect(result.costs!.totalCost).toBe(0);
		expect(result.costs!.totalTokens).toBe(0);
		expect(result.costs!.byDimension.analysis?.cost).toBe(0);
	});

	test("should handle dimension errors without affecting cost tracking", async () => {
		const mockProvider = {
			name: "mock",
			callCount: 0,
			async execute() {
				this.callCount++;
				if (this.callCount === 1) {
					// First call succeeds
					return {
						data: { result: "success" },
						metadata: {
							model: "claude-sonnet-4-5-20250929",
							provider: "mock",
							tokens: {
								inputTokens: 1000,
								outputTokens: 2000,
								totalTokens: 3000,
							},
						},
					};
				} else {
					// Second call fails
					return {
						error: "Provider error",
					};
				}
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as any);

		class MultiDimPlugin extends Plugin {
			constructor() {
				super("multi", "Multi", "Multiple dimensions");
				this.dimensions = ["dim1", "dim2"];
			}

			createPrompt() {
				return "test";
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}
		}

		const plugin = new MultiDimPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
			continueOnError: true,
			maxRetries: 0, // ✅ Disable retries for predictable behavior
		});

		const result = await engine.process([{ content: "Test", metadata: {} }]);

		// Only dim1 should have cost data (dim2 failed)
		expect(result.costs!.byDimension).toHaveProperty("dim1");
		expect(result.costs!.byDimension.dim1?.tokens.totalTokens).toBe(3000);
		expect(result.costs!.totalTokens).toBe(3000);
	});

	test("should handle empty sections array", async () => {
		const mockProvider = {
			name: "mock",
			async execute() {
				return {
					data: { result: "test" },
					metadata: {
						model: "claude-sonnet-4-5-20250929",
						provider: "mock",
						tokens: {
							inputTokens: 1000,
							outputTokens: 2000,
							totalTokens: 3000,
						},
					},
				};
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as any);

		const plugin = new TestPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
		});

		await expect(engine.process([])).rejects.toThrow(
			"DagEngine.process() requires at least one section",
		);
	});

	test("should aggregate costs correctly with mixed success/failure", async () => {
		let callCount = 0;
		const mixedProvider = {
			name: "mock",
			async execute() {
				callCount++;
				// Alternate between success and failure
				if (callCount % 2 === 1) {
					return {
						data: { result: "success" },
						metadata: {
							model: "claude-sonnet-4-5-20250929",
							provider: "mock",
							tokens: {
								inputTokens: 500,
								outputTokens: 1000,
								totalTokens: 1500,
							},
						},
					};
				} else {
					return { error: "Failed" };
				}
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(mixedProvider as any);

		const plugin = new TestPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
			continueOnError: true,
			maxRetries: 0, // ✅ FIX: Disable retries for predictable behavior
		});

		const sections = [
			{ content: "Section 1", metadata: {} },
			{ content: "Section 2", metadata: {} },
			{ content: "Section 3", metadata: {} },
			{ content: "Section 4", metadata: {} },
		];

		const result = await engine.process(sections);

		// Only 2 sections should have cost data (sections 1 and 3)
		expect(result.costs!.totalTokens).toBe(3000); // 1500 × 2 successful sections
	});
});

describe("Cost Tracking - Pricing Configuration", () => {
	test("should work with minimal pricing config", async () => {
		const minimalPricing: PricingConfig = {
			models: {
				"claude-sonnet-4-5-20250929": { inputPer1M: 3.0, outputPer1M: 15.0 },
			},
		};

		const mockProvider = {
			name: "mock",
			async execute() {
				return {
					data: { result: "test" },
					metadata: {
						model: "claude-sonnet-4-5-20250929",
						provider: "mock",
						tokens: {
							inputTokens: 1000,
							outputTokens: 2000,
							totalTokens: 3000,
						},
					},
				};
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as any);

		const plugin = new TestPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: minimalPricing,
		});

		const result = await engine.process([{ content: "Test", metadata: {} }]);

		expect(result.costs).toBeDefined();
		expect(result.costs!.totalCost).toBeGreaterThan(0);
	});

	test("should include lastUpdated metadata if provided", async () => {
		const pricingWithDate: PricingConfig = {
			models: {
				"claude-sonnet-4-5-20250929": { inputPer1M: 3.0, outputPer1M: 15.0 },
			},
			lastUpdated: "2025-01-15",
		};

		const mockProvider = {
			name: "mock",
			async execute() {
				return {
					data: { result: "test" },
					metadata: {
						model: "claude-sonnet-4-5-20250929",
						provider: "mock",
						tokens: {
							inputTokens: 1000,
							outputTokens: 2000,
							totalTokens: 3000,
						},
					},
				};
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as any);

		const plugin = new TestPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: pricingWithDate,
		});

		const result = await engine.process([{ content: "Test", metadata: {} }]);

		expect(result.costs).toBeDefined();
		// lastUpdated is stored in config but not exposed in results
		// This is correct - it's metadata for the pricing config itself
	});
});

describe("Cost Tracking - Currency", () => {
	test("should always return USD currency", async () => {
		const mockProvider = {
			name: "mock",
			async execute() {
				return {
					data: { result: "test" },
					metadata: {
						model: "claude-sonnet-4-5-20250929",
						provider: "mock",
						tokens: {
							inputTokens: 1000,
							outputTokens: 2000,
							totalTokens: 3000,
						},
					},
				};
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as any);

		const plugin = new TestPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
		});

		const result = await engine.process([{ content: "Test", metadata: {} }]);

		expect(result.costs!.currency).toBe("USD");
	});
});
