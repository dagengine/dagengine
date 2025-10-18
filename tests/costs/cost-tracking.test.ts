import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../../src/core/engine";
import { Plugin } from "../../src/plugin";
import { ProviderAdapter } from "../../src/providers/adapter";
import type { PricingConfig, SectionData } from "../../src/types";

// Test pricing configuration
const TEST_PRICING: PricingConfig = {
	models: {
		"claude-sonnet-4-5-20250929": { inputPer1M: 3.0, outputPer1M: 15.0 },
		"claude-opus-4": { inputPer1M: 15.0, outputPer1M: 75.0 },
		"gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
		"gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
		"gemini-1.5-pro": { inputPer1M: 1.25, outputPer1M: 5.0 },
		"gemini-2.5-flash": { inputPer1M: 0.075, outputPer1M: 0.3 },
	},
	lastUpdated: "2025-01-01",
};

// Mock plugin for testing
class TestPlugin extends Plugin {
	constructor(dimensions: string[] = ["analysis"]) {
		super("test-plugin", "Test Plugin", "Plugin for testing cost tracking");
		this.dimensions = dimensions;
	}

	createPrompt(): string {
		return "Analyze this text";
	}

	selectProvider() {
		return {
			provider: "mock",
			options: { model: "claude-sonnet-4-5-20250929" },
		};
	}
}

// Mock provider that returns token usage
class MockProvider {
	name = "mock";

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
	}
}

describe("Cost Tracking - Basic Functionality", () => {
	let adapter: ProviderAdapter;
	let sections: SectionData[];

	beforeEach(() => {
		adapter = new ProviderAdapter({});
		adapter.registerProvider(new MockProvider() as any);

		sections = [
			{ content: "Test content 1", metadata: {} },
			{ content: "Test content 2", metadata: {} },
		];
	});

	test("should calculate costs when pricing is provided", async () => {
		const plugin = new TestPlugin(["analysis"]);
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
		});

		const result = await engine.process(sections);

		expect(result.costs).toBeDefined();
		expect(result.costs!.totalCost).toBeGreaterThan(0);
		expect(result.costs!.totalTokens).toBe(6000); // 3000 per section × 2 sections
		expect(result.costs!.currency).toBe("USD");
	});

	test("should NOT calculate costs when pricing is not provided", async () => {
		const plugin = new TestPlugin(["analysis"]);
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			// No pricing provided
		});

		const result = await engine.process(sections);

		expect(result.costs).toBeUndefined();
	});

	test("should calculate accurate costs for Claude Sonnet", async () => {
		const plugin = new TestPlugin(["analysis"]);
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
		});

		const result = await engine.process(sections);

		// Expected: (1000 input × $3 + 2000 output × $15) / 1M × 2 sections
		// = (3000 + 30000) / 1M × 2 = 0.033 × 2 = 0.066
		const expectedCost = ((1000 * 3.0 + 2000 * 15.0) / 1_000_000) * 2;

		expect(result.costs!.totalCost).toBeCloseTo(expectedCost, 6);
	});

	test("should track costs by dimension", async () => {
		const plugin = new TestPlugin(["analysis"]);
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
		});

		const result = await engine.process(sections);

		expect(result.costs!.byDimension).toHaveProperty("analysis");
		expect(result.costs!.byDimension.analysis?.cost).toBeGreaterThan(0);
		expect(result.costs!.byDimension.analysis?.tokens.totalTokens).toBe(6000);
		expect(result.costs!.byDimension.analysis?.model).toBe(
			"claude-sonnet-4-5-20250929",
		);
		expect(result.costs!.byDimension.analysis?.provider).toBe("mock");
	});

	test("should track costs by provider", async () => {
		const plugin = new TestPlugin(["analysis"]);
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
		});

		const result = await engine.process(sections);

		expect(result.costs!.byProvider).toHaveProperty("mock");
		expect(result.costs!.byProvider.mock?.cost).toBeGreaterThan(0);
		expect(result.costs!.byProvider.mock?.tokens.totalTokens).toBe(6000);
		expect(result.costs!.byProvider.mock?.models).toContain(
			"claude-sonnet-4-5-20250929",
		);
	});

	test("should aggregate costs across multiple dimensions", async () => {
		// Mock provider for multiple dimensions
		let callCount = 0;
		const multiDimProvider = {
			name: "mock",
			async execute() {
				callCount++;
				return {
					data: { result: "test" },
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
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(multiDimProvider as any);

		const plugin = new TestPlugin(["analysis", "summary"]);
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
		});

		const result = await engine.process(sections);

		expect(result.costs!.byDimension).toHaveProperty("analysis");
		expect(result.costs!.byDimension).toHaveProperty("summary");
		expect(result.costs!.totalTokens).toBe(6000); // 1500 × 2 dimensions × 2 sections
	});
});

describe("Cost Tracking - Global Dimensions", () => {
	let adapter: ProviderAdapter;
	let sections: SectionData[];

	beforeEach(() => {
		const mockProvider = {
			name: "mock",
			async execute() {
				return {
					data: { result: "global result" },
					metadata: {
						model: "claude-opus-4",
						provider: "mock",
						tokens: {
							inputTokens: 5000,
							outputTokens: 10000,
							totalTokens: 15000,
						},
					},
				};
			},
		};

		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as any);

		sections = [{ content: "Test", metadata: {} }];
	});

	test("should track costs for global dimensions", async () => {
		class GlobalPlugin extends Plugin {
			constructor() {
				super("global-test", "Global Test", "Test global dimensions");
				this.dimensions = [{ name: "globalAnalysis", scope: "global" }];
			}

			createPrompt() {
				return "Analyze globally";
			}

			selectProvider() {
				return { provider: "mock", options: {} };
			}
		}

		const plugin = new GlobalPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
		});

		const result = await engine.process(sections);

		expect(result.costs!.byDimension).toHaveProperty("globalAnalysis");
		expect(result.costs!.byDimension.globalAnalysis?.tokens.totalTokens).toBe(
			15000,
		);

		// Expected: (5000 input × $15 + 10000 output × $75) / 1M
		const expectedCost = (5000 * 15.0 + 10000 * 75.0) / 1_000_000;
		expect(result.costs!.totalCost).toBeCloseTo(expectedCost, 6);
	});
});

describe("Cost Tracking - Multiple Providers", () => {
	test("should track costs from different providers separately", async () => {
		// Create providers with different models
		const anthropicProvider = {
			name: "anthropic",
			async execute() {
				return {
					data: { result: "anthropic result" },
					metadata: {
						model: "claude-sonnet-4-5-20250929",
						provider: "anthropic",
						tokens: {
							inputTokens: 1000,
							outputTokens: 2000,
							totalTokens: 3000,
						},
					},
				};
			},
		};

		const openaiProvider = {
			name: "openai",
			async execute() {
				return {
					data: { result: "openai result" },
					metadata: {
						model: "gpt-4o",
						provider: "openai",
						tokens: {
							inputTokens: 1500,
							outputTokens: 2500,
							totalTokens: 4000,
						},
					},
				};
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(anthropicProvider as any);
		adapter.registerProvider(openaiProvider as any);

		// ✅ FIXED: Use dimension-based provider selection
		class MultiProviderPlugin extends Plugin {
			constructor() {
				super("multi", "Multi Provider", "Test multiple providers");
				this.dimensions = ["anthropicDim", "openaiDim"];
			}

			createPrompt() {
				return "test";
			}

			selectProvider(dimension: string) {
				// Select provider based on dimension name
				return dimension === "anthropicDim"
					? { provider: "anthropic", options: {} }
					: { provider: "openai", options: {} };
			}
		}

		const plugin = new MultiProviderPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
		});

		const result = await engine.process([{ content: "Test", metadata: {} }]);

		// Verify both providers were tracked
		expect(result.costs!.byProvider).toHaveProperty("anthropic");
		expect(result.costs!.byProvider).toHaveProperty("openai");

		// Verify costs are calculated correctly for each provider
		const expectedAnthropic = (1000 * 3.0 + 2000 * 15.0) / 1_000_000;
		expect(result.costs!.byProvider.anthropic?.cost).toBeCloseTo(
			expectedAnthropic,
			6,
		);

		const expectedOpenAI = (1500 * 2.5 + 2500 * 10.0) / 1_000_000;
		expect(result.costs!.byProvider.openai?.cost).toBeCloseTo(
			expectedOpenAI,
			6,
		);

		// Verify models are tracked
		expect(result.costs!.byProvider.anthropic?.models).toContain(
			"claude-sonnet-4-5-20250929",
		);
		expect(result.costs!.byProvider.openai?.models).toContain("gpt-4o");

		// Verify total cost
		const expectedTotal = expectedAnthropic + expectedOpenAI;
		expect(result.costs!.totalCost).toBeCloseTo(expectedTotal, 6);
	});
});

describe("Cost Tracking - Token Breakdown", () => {
	test("should track input and output tokens separately", async () => {
		const mockProvider = {
			name: "mock",
			async execute() {
				return {
					data: { result: "test" },
					metadata: {
						model: "claude-sonnet-4-5-20250929",
						provider: "mock",
						tokens: {
							inputTokens: 3000,
							outputTokens: 7000,
							totalTokens: 10000,
						},
					},
				};
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as any);

		const plugin = new TestPlugin(["analysis"]);
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: TEST_PRICING,
		});

		const result = await engine.process([{ content: "Test", metadata: {} }]);

		expect(result.costs!.byDimension.analysis?.tokens.inputTokens).toBe(3000);
		expect(result.costs!.byDimension.analysis?.tokens.outputTokens).toBe(7000);
		expect(result.costs!.byDimension.analysis?.tokens.totalTokens).toBe(10000);

		// Verify cost calculation uses separate rates
		// (3000 × 3 + 7000 × 15) / 1M = 0.114
		const expectedCost = (3000 * 3.0 + 7000 * 15.0) / 1_000_000;
		expect(result.costs!.totalCost).toBeCloseTo(expectedCost, 6);
	});
});
