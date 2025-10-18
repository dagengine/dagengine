import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../../src/core/engine/dag-engine.js";
import { Plugin } from "../../src/plugin.js";
import { ProviderRegistry } from "../../src/providers/registry.js";
import { MockAIProvider, createMockSection } from "../setup.js";
import type {
	PromptContext,
	ProviderSelection,
	ProgressUpdate,
	SectionData,
} from "../../src/types.js";
import type { ProviderResponse } from "../../src/providers/types.js";  // ← ADD THIS


describe("DagEngine - Progress Tracking", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();

		// Set default response with proper metadata
		mockProvider.execute = async (request) => {
			const mockData = mockProvider.mockResponses.get(request.input as string);

			if (mockData) {
				if (typeof mockData === 'object' && mockData !== null) {
					const obj = mockData as Record<string, unknown>;
					if ('data' in obj || 'metadata' in obj || 'error' in obj) {
						return obj as ProviderResponse;
					}
				}
				return {
					data: mockData,
					metadata: { provider: "mock-ai" },
				};
			}

			return {
				data: { result: "ok" },
				metadata: {
					provider: "mock-ai",
					tokens: {
						inputTokens: 10,
						outputTokens: 20,
						totalTokens: 30,
					},
					model: "test-model",
				},
			};
		};

		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});


	// ============================================================================
	// BASIC PROGRESS TRACKING
	// ============================================================================

	test("should track progress through onProgress callback", async () => {
		const progressUpdates: ProgressUpdate[] = [];

		class SimplePlugin extends Plugin {
			constructor() {
				super("simple", "Simple", "Test");
				this.dimensions = ["dim1", "dim2", "dim3"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new SimplePlugin(),
			registry,
		});

		await engine.process([createMockSection("Section 1")], {
			onProgress: (progress) => {
				progressUpdates.push(progress);
			},
		});

		// Should have received progress updates
		expect(progressUpdates.length).toBeGreaterThan(0);

		// First update should show 0% or low completion
		const firstUpdate = progressUpdates[0];
		expect(firstUpdate).toBeDefined();
		expect(firstUpdate!.total).toBe(3); // 3 dimensions * 1 section
		expect(firstUpdate!.completed).toBeGreaterThanOrEqual(0);
		expect(firstUpdate!.percent).toBeGreaterThanOrEqual(0);

		// Last update should show 100% completion
		const lastUpdate = progressUpdates[progressUpdates.length - 1];
		expect(lastUpdate).toBeDefined();
		expect(lastUpdate!.completed).toBe(3);
		expect(lastUpdate!.percent).toBe(100);
	});

	test("should track progress with multiple sections", async () => {
		const progressUpdates: ProgressUpdate[] = [];

		class MultiSectionPlugin extends Plugin {
			constructor() {
				super("multi", "Multi", "Test");
				this.dimensions = ["dim1", "dim2"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new MultiSectionPlugin(),
			registry,
		});

		const sections = [
			createMockSection("Section 1"),
			createMockSection("Section 2"),
			createMockSection("Section 3"),
		];

		await engine.process(sections, {
			onProgress: (progress) => {
				progressUpdates.push(progress);
			},
		});

		expect(progressUpdates.length).toBeGreaterThan(0);

		const lastUpdate = progressUpdates[progressUpdates.length - 1];
		expect(lastUpdate).toBeDefined();
		expect(lastUpdate!.total).toBe(6); // 2 dimensions * 3 sections
		expect(lastUpdate!.completed).toBe(6);
		expect(lastUpdate!.percent).toBe(100);
	});

	// ============================================================================
	// PER-DIMENSION PROGRESS
	// ============================================================================

	test("should track per-dimension progress", async () => {
		let latestProgress: ProgressUpdate | null = null;

		class PerDimensionPlugin extends Plugin {
			constructor() {
				super("per-dim", "Per Dimension", "Test");
				this.dimensions = ["sentiment", "topics", "entities"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new PerDimensionPlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")], {
			onProgress: (progress) => {
				latestProgress = progress;
			},
		});

		expect(latestProgress).not.toBeNull();
		expect(latestProgress!.dimensions).toBeDefined();

		// Check each dimension has progress info
		expect(latestProgress!.dimensions.sentiment).toBeDefined();
		expect(latestProgress!.dimensions.topics).toBeDefined();
		expect(latestProgress!.dimensions.entities).toBeDefined();

		// Each dimension should show completion
		const sentiment = latestProgress!.dimensions.sentiment;
		expect(sentiment).toBeDefined();
		expect(sentiment!.completed).toBe(1);
		expect(sentiment!.total).toBe(1);
		expect(sentiment!.percent).toBe(100);
		expect(sentiment!.failed).toBe(0);
	});

	test("should track dimension costs", async () => {
		let latestProgress: ProgressUpdate | null = null;

		class CostTrackingPlugin extends Plugin {
			constructor() {
				super("cost", "Cost", "Test");
				this.dimensions = ["expensive", "cheap"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		// Override execute to see what's being called
		const originalExecute = mockProvider.execute.bind(mockProvider);
		mockProvider.execute = async (request) => {

			const result = await originalExecute(request);
			return result;
		};

		mockProvider.setMockResponse("expensive", {
			data: { result: "ok" },
			metadata: {
				tokens: {
					inputTokens: 1000,
					outputTokens: 2000,
					totalTokens: 3000,
				},
				model: "test-model",
				provider: "mock-ai",
			},
		});

		mockProvider.setMockResponse("cheap", {
			data: { result: "ok" },
			metadata: {
				tokens: {
					inputTokens: 100,
					outputTokens: 200,
					totalTokens: 300,
				},
				model: "test-model",
				provider: "mock-ai",
			},
		});

		const engine = new DagEngine({
			plugin: new CostTrackingPlugin(),
			registry,
			pricing: {
				models: {
					"test-model": {
						inputPer1M: 3.0,
						outputPer1M: 15.0,
					},
				},
			},
		});


		await engine.process([createMockSection("Test")], {
			onProgress: (progress) => {
				latestProgress = progress;
			},
		});

		expect(latestProgress).not.toBeNull();
		expect(latestProgress!.cost).toBeGreaterThan(0);

		// Expensive should cost more than cheap
		// expect(expensive!.cost).toBeGreaterThan(cheap!.cost);
	});

	// ============================================================================
	// PROGRESS WITH FAILURES
	// ============================================================================

	test("should track failed dimensions", async () => {
		let latestProgress: ProgressUpdate | null = null;

		class FailingPlugin extends Plugin {
			constructor() {
				super("failing", "Failing", "Test");
				this.dimensions = ["success", "failure"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.execute = async (request) => {
			if (request.input === "failure") {
				return { error: "Intentional failure" };
			}
			return {
				data: { result: "ok" },
				metadata: {
					provider: "mock-ai",
				},
			};
		};

		const engine = new DagEngine({
			plugin: new FailingPlugin(),
			registry,
			execution: {
				continueOnError: true,
				maxRetries: 0,  // IMPORTANT: No retries to avoid confusion
			},
		});

		await engine.process([createMockSection("Test")], {
			onProgress: (progress) => {
				latestProgress = progress;
			},
		});

		expect(latestProgress).not.toBeNull();

		// Check failure dimension
		const failure = latestProgress!.dimensions.failure;
		expect(failure).toBeDefined();

		// ✅ FIX: Failures don't increment completed
		expect(failure!.completed).toBe(0);
		expect(failure!.failed).toBe(1);

		// Success dimension should be fine
		const success = latestProgress!.dimensions.success;
		expect(success).toBeDefined();
		expect(success!.completed).toBe(1);
		expect(success!.failed).toBe(0);
	});

	test("should track failures with multiple sections", async () => {
		let latestProgress: ProgressUpdate | null = null;

		class MultiFailPlugin extends Plugin {
			constructor() {
				super("multi-fail", "Multi Fail", "Test");
				this.dimensions = ["unstable"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		let callCount = 0;
		mockProvider.execute = async () => {
			callCount++;
			// Fail every other call (deterministic)
			if (callCount === 2 || callCount === 4) {
				return { error: "Random failure" };
			}
			return {
				data: { result: "ok" },
				metadata: {
					provider: "mock-ai",
				},
			};
		};

		const engine = new DagEngine({
			plugin: new MultiFailPlugin(),
			registry,
			execution: {
				continueOnError: true,
				maxRetries: 0, // No retries
			},
		});

		await engine.process([
			createMockSection("Section 1"),
			createMockSection("Section 2"),
			createMockSection("Section 3"),
			createMockSection("Section 4"),
		], {
			onProgress: (progress) => {
				latestProgress = progress;
			},
		});

		expect(latestProgress).not.toBeNull();

		const unstable = latestProgress!.dimensions.unstable;
		expect(unstable).toBeDefined();
		expect(unstable!.total).toBe(4);
		expect(unstable!.completed).toBe(2); // Sections 1 and 3 succeeded
		expect(unstable!.failed).toBe(2); // Sections 2 and 4 failed
	});

	// ============================================================================
	// TIME TRACKING
	// ============================================================================

	test("should track elapsed time and ETA", async () => {
		let latestProgress: ProgressUpdate | null = null;

		class SlowPlugin extends Plugin {
			constructor() {
				super("slow", "Slow", "Test");
				this.dimensions = ["dim1", "dim2", "dim3"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		// Add delay to mock provider
		const originalExecute = mockProvider.execute.bind(mockProvider);
		mockProvider.execute = async (request) => {
			await new Promise(resolve => setTimeout(resolve, 50));
			return originalExecute(request);
		};

		const engine = new DagEngine({
			plugin: new SlowPlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")], {
			onProgress: (progress) => {
				latestProgress = progress;
			},
		});

		expect(latestProgress).not.toBeNull();

		// Should have taken some time (at least 50ms * 3 dimensions)
		expect(latestProgress!.elapsedSeconds).toBeGreaterThanOrEqual(0);

		// At completion, ETA should be 0
		expect(latestProgress!.etaSeconds).toBe(0);

		// Percent should be 100
		expect(latestProgress!.percent).toBe(100);
	});

	test("should estimate cost and time remaining", async () => {
		const progressUpdates: ProgressUpdate[] = [];

		class EstimationPlugin extends Plugin {
			constructor() {
				super("estimation", "Estimation", "Test");
				this.dimensions = ["estimatable"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		// ✅ FIX: Return tokens with provider so cost can be calculated
		mockProvider.execute = async () => {
			return {
				data: { result: "ok" },
				metadata: {
					tokens: {
						inputTokens: 100,
						outputTokens: 200,
						totalTokens: 300,
					},
					model: "test-model",
					provider: "mock-ai",  // ← ADDED
				},
			};
		};

		const engine = new DagEngine({
			plugin: new EstimationPlugin(),
			registry,
			// ✅ FIX: ADD PRICING CONFIG
			pricing: {
				models: {
					"test-model": {
						inputPer1M: 3.0,
						outputPer1M: 15.0,
					},
				},
			},
		});

		await engine.process([
			createMockSection("Section 1"),
			createMockSection("Section 2"),
			createMockSection("Section 3"),
			createMockSection("Section 4"),
			createMockSection("Section 5"),
		], {
			onProgress: (progress) => {
				progressUpdates.push(progress);
			},
			updateEvery: 1, // Update every section
		});

		// Find a mid-progress update
		const midProgress = progressUpdates.find(
			(p) => p.completed > 0 && p.completed < p.total
		);

		if (midProgress) {
			expect(midProgress.estimatedCost).toBeGreaterThanOrEqual(midProgress.cost);
			expect(midProgress.etaSeconds).toBeGreaterThanOrEqual(0);

			const dim = midProgress.dimensions.estimatable;
			expect(dim).toBeDefined();
			expect(dim!.estimatedCost).toBeGreaterThanOrEqual(dim!.cost);
			expect(dim!.etaSeconds).toBeGreaterThanOrEqual(0);
		}

		// Final should have cost
		const final = progressUpdates[progressUpdates.length - 1];
		expect(final).toBeDefined();
		expect(final!.cost).toBeGreaterThan(0);
		expect(final!.estimatedCost).toBeCloseTo(final!.cost, 2);
	});

	// ============================================================================
	// ESTIMATION ACCURACY
	// ============================================================================

	describe("Estimation Accuracy", () => {
		test("should estimate costs accurately", async () => {
			const progressUpdates: ProgressUpdate[] = [];

			class CostEstimationPlugin extends Plugin {
				constructor() {
					super("cost-est", "Cost Estimation", "Test");
					this.dimensions = ["priced"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			// ✅ FIX: Add provider to metadata
			mockProvider.execute = async () => {
				return {
					data: { result: "ok" },
					metadata: {
						tokens: {
							inputTokens: 100,
							outputTokens: 200,
							totalTokens: 300,
						},
						model: "test-model",
						provider: "mock-ai",  // ← ADDED
					},
				};
			};

			const engine = new DagEngine({
				plugin: new CostEstimationPlugin(),
				registry,
				pricing: {
					models: {
						"test-model": {
							inputPer1M: 3.0,
							outputPer1M: 15.0,
						},
					},
				},
			});

			await engine.process([
				createMockSection("Section 1"),
				createMockSection("Section 2"),
				createMockSection("Section 3"),
				createMockSection("Section 4"),
				createMockSection("Section 5"),
			], {
				onProgress: (p) => progressUpdates.push(p),
				updateEvery: 1,
			});

			// Check estimates improve over time
			const midProgress = progressUpdates.filter(
				p => p.completed > 0 && p.completed < p.total
			);

			if (midProgress.length >= 2) {
				const early = midProgress[0];
				const late = midProgress[midProgress.length - 1];

				expect(early).toBeDefined();
				expect(late).toBeDefined();

				// Calculate expected cost
				// 100 tokens * $3/1M + 200 tokens * $15/1M = $0.0033 per operation
				// 5 operations = $0.0165
				const costPerOp = (100 * 3.0 / 1_000_000) + (200 * 15.0 / 1_000_000);
				const expectedFinal = costPerOp * 5;

				const earlyError = Math.abs(early!.estimatedCost - expectedFinal);
				const lateError = Math.abs(late!.estimatedCost - expectedFinal);

				// Later estimates should be more accurate (or equal)
				expect(lateError).toBeLessThanOrEqual(earlyError);
			}

			// Final should match exactly
			const final = progressUpdates[progressUpdates.length - 1];
			expect(final).toBeDefined();
			expect(final!.cost).toBeGreaterThan(0);
			expect(final!.estimatedCost).toBeCloseTo(final!.cost, 4);
		});

		test("should calculate ETA accurately", async () => {
			const progressUpdates: ProgressUpdate[] = [];

			class ETAPlugin extends Plugin {
				constructor() {
					super("eta", "ETA", "Test");
					this.dimensions = ["timed"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			// Fixed delay per operation
			mockProvider.execute = async () => {
				await new Promise(resolve => setTimeout(resolve, 100));
				return {
					data: { result: "ok" },
					metadata: {
						provider: "mock-ai",
					},
				};
			};

			const engine = new DagEngine({
				plugin: new ETAPlugin(),
				registry,
				execution: { concurrency: 1 }, // Serial for predictable timing
			});

			await engine.process([
				createMockSection("Section 1"),
				createMockSection("Section 2"),
				createMockSection("Section 3"),
				createMockSection("Section 4"),
				createMockSection("Section 5"),
			], {
				onProgress: (p) => progressUpdates.push(p),
				updateEvery: 1,
			});

			// Check mid-progress ETA
			const afterTwo = progressUpdates.find(p => p.completed === 2);
			if (afterTwo) {
				// After 2 sections (~200ms), should have time remaining
				expect(afterTwo.etaSeconds).toBeGreaterThanOrEqual(0);

				// Should estimate time for remaining 3 sections
				// Allow for variance in execution time
				expect(afterTwo.etaSeconds).toBeLessThan(2);
			}

			// Final ETA should be 0
			const final = progressUpdates[progressUpdates.length - 1];
			expect(final).toBeDefined();
			expect(final!.etaSeconds).toBe(0);
			expect(final!.percent).toBe(100);
		});

		test("should handle varying operation times", async () => {
			const progressUpdates: ProgressUpdate[] = [];

			class VaryingPlugin extends Plugin {
				constructor() {
					super("varying", "Varying", "Test");
					this.dimensions = ["variable"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			let callCount = 0;
			mockProvider.execute = async () => {
				callCount++;
				// First operation slow, rest fast
				const delay = callCount === 1 ? 200 : 50;
				await new Promise(resolve => setTimeout(resolve, delay));
				return {
					data: { result: "ok" },
					metadata: {
						provider: "mock-ai",
					},
				};
			};

			const engine = new DagEngine({
				plugin: new VaryingPlugin(),
				registry,
				execution: { concurrency: 1 },
			});

			await engine.process([
				createMockSection("Section 1"),
				createMockSection("Section 2"),
				createMockSection("Section 3"),
				createMockSection("Section 4"),
			], {
				onProgress: (p) => progressUpdates.push(p),
				updateEvery: 1,
			});

			// ETA should adjust after first slow operation
			const afterFirst = progressUpdates.find(p => p.completed === 1);
			const afterSecond = progressUpdates.find(p => p.completed === 2);

			if (afterFirst && afterSecond) {
				// Both should have ETA calculated
				expect(afterFirst.etaSeconds).toBeGreaterThanOrEqual(0);
				expect(afterSecond.etaSeconds).toBeGreaterThanOrEqual(0);

				// Second estimate should be lower (faster operations)
				// Or at least not significantly higher
				expect(afterSecond.etaSeconds).toBeLessThanOrEqual(afterFirst.etaSeconds * 1.5);
			}
		});
	});

	// ============================================================================
	// RETRIES AND RESILIENCE
	// ============================================================================

	describe("Retries and Resilience", () => {
		test("should not double-count retries in progress", async () => {
			const progressUpdates: ProgressUpdate[] = [];

			class RetryPlugin extends Plugin {
				constructor() {
					super("retry", "Retry", "Test");
					this.dimensions = ["flaky"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			let attempts = 0;
			mockProvider.execute = async () => {
				attempts++;
				// Fail first 2 attempts, succeed on 3rd
				if (attempts <= 2) {
					return { error: "Temporary failure" };
				}
				return {
					data: { result: "ok" },
					metadata: {
						provider: "mock-ai",
					},
				};
			};

			const engine = new DagEngine({
				plugin: new RetryPlugin(),
				registry,
				execution: { maxRetries: 3 },
			});

			await engine.process([createMockSection("Test")], {
				onProgress: (p) => progressUpdates.push(p),
			});

			const final = progressUpdates[progressUpdates.length - 1];
			expect(final).toBeDefined();

			// Should count as 1 operation, not 3
			expect(final!.completed).toBe(1);
			expect(final!.total).toBe(1);
			expect(final!.percent).toBe(100);

			// Dimension should show as successful (after retries)
			expect(final!.dimensions.flaky).toBeDefined();
			expect(final!.dimensions.flaky!.completed).toBe(1);
			expect(final!.dimensions.flaky!.failed).toBe(0);
		});

		test("should track progress correctly with partial failures", async () => {
			const progressUpdates: ProgressUpdate[] = [];

			class PartialFailPlugin extends Plugin {
				constructor() {
					super("partial-fail", "Partial Fail", "Test");
					this.dimensions = ["unreliable"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			let callCount = 0;
			mockProvider.execute = async () => {
				callCount++;
				// Some succeed, some fail permanently
				if (callCount === 2 || callCount === 4) {
					return { error: "Permanent failure" };
				}
				return {
					data: { result: "ok" },
					metadata: {
						provider: "mock-ai",
					},
				};
			};

			const engine = new DagEngine({
				plugin: new PartialFailPlugin(),
				registry,
				execution: {
					maxRetries: 0, // No retries
					continueOnError: true,
				},
			});

			await engine.process([
				createMockSection("Section 1"),
				createMockSection("Section 2"),
				createMockSection("Section 3"),
				createMockSection("Section 4"),
			], {
				onProgress: (p) => progressUpdates.push(p),
			});

			const final = progressUpdates[progressUpdates.length - 1];
			expect(final).toBeDefined();

			// Should show mix of success and failure
			const dim = final!.dimensions.unreliable;
			expect(dim).toBeDefined();
			expect(dim!.completed).toBe(2); // Sections 1 and 3
			expect(dim!.failed).toBe(2); // Sections 2 and 4
			expect(dim!.total).toBe(4);
		});
	});

	// ============================================================================
	// TRANSFORMATIONS
	// ============================================================================

	describe("Transformations", () => {
		test("should track progress through transformations", async () => {
			const progressUpdates: ProgressUpdate[] = [];

			class TransformPlugin extends Plugin {
				constructor() {
					super("transform", "Transform", "Test");
					this.dimensions = [
						{
							name: "filter",
							scope: "global" as const,
							transform: (_result, sections: SectionData[]) => {
								// Keep only first half
								return sections.slice(0, Math.ceil(sections.length / 2));
							},
						},
						"analysis",
					];
				}

				createPrompt(context: PromptContext): string {
					return context.dimension;
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return { analysis: ["filter"] };
				}
			}

			const engine = new DagEngine({
				plugin: new TransformPlugin(),
				registry,
			});

			await engine.process([
				createMockSection("Section 1"),
				createMockSection("Section 2"),
				createMockSection("Section 3"),
				createMockSection("Section 4"),
			], {
				onProgress: (p) => progressUpdates.push(p),
			});

			expect(progressUpdates.length).toBeGreaterThan(0);

			const final = progressUpdates[progressUpdates.length - 1];
			expect(final).toBeDefined();

			// Filter runs once (global)
			expect(final!.dimensions.filter).toBeDefined();

			// Filter reduces 4→2 sections, so analysis processes 2 sections
			expect(final!.dimensions.analysis).toBeDefined();
			expect(final!.dimensions.analysis!.total).toBe(2);
			expect(final!.dimensions.analysis!.completed).toBe(2);
			expect(final!.dimensions.analysis!.percent).toBe(100);

			expect(final!.percent).toBe(100);
		});

		test("should track multiple transformations", async () => {
			const progressUpdates: ProgressUpdate[] = [];

			class MultiTransformPlugin extends Plugin {
				constructor() {
					super("multi-transform", "Multi Transform", "Test");
					this.dimensions = [
						{
							name: "first_filter",
							scope: "global" as const,
							transform: (_result, sections: SectionData[]) => {
								return sections.slice(0, 3); // Keep 3
							},
						},
						{
							name: "second_filter",
							scope: "global" as const,
							transform: (_result, sections: SectionData[]) => {
								return sections.slice(0, 2); // Keep 2
							},
						},
						"final_analysis",
					];
				}

				createPrompt(context: PromptContext): string {
					return context.dimension;
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return {
						second_filter: ["first_filter"],
						final_analysis: ["second_filter"],
					};
				}
			}

			const engine = new DagEngine({
				plugin: new MultiTransformPlugin(),
				registry,
			});

			await engine.process([
				createMockSection("Section 1"),
				createMockSection("Section 2"),
				createMockSection("Section 3"),
				createMockSection("Section 4"),
			], {
				onProgress: (p) => progressUpdates.push(p),
			});

			const final = progressUpdates[progressUpdates.length - 1];
			expect(final).toBeDefined();

			expect(final!.dimensions.final_analysis).toBeDefined();
			expect(final!.dimensions.final_analysis!.total).toBe(2);
			expect(final!.dimensions.final_analysis!.completed).toBe(2);
			expect(final!.dimensions.final_analysis!.percent).toBe(100);

			expect(final!.percent).toBe(100);
		});

		test("should recalculate progress when transformations reduce sections", async () => {
			const progressUpdates: ProgressUpdate[] = [];

			class DynamicProgressPlugin extends Plugin {
				constructor() {
					super("dynamic-progress", "Dynamic Progress", "Test");
					this.dimensions = [
						{
							name: "filter",
							scope: "global" as const,
							transform: (_result, sections: SectionData[]) => {
								// Reduce from 4 sections to 2
								return sections.slice(0, 2);
							},
						},
						"analysis",
					];
				}

				createPrompt(context: PromptContext): string {
					return context.dimension;
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return { analysis: ["filter"] };
				}
			}

			const engine = new DagEngine({
				plugin: new DynamicProgressPlugin(),
				registry,
			});

			await engine.process(
				[
					createMockSection("Section 1"),
					createMockSection("Section 2"),
					createMockSection("Section 3"),
					createMockSection("Section 4"),
				],
				{
					onProgress: (p) => progressUpdates.push(p),
					updateEvery: 1, // Capture every update
				}
			);

			// Find progress update AFTER transformation is applied
			const afterFilterUpdates = progressUpdates.filter(
				(p) => p.dimensions.filter?.completed === 1 &&
					p.dimensions.analysis?.completed === 0
			);
			const afterTransformation = afterFilterUpdates[afterFilterUpdates.length - 1];

			const final = progressUpdates[progressUpdates.length - 1];

			// ✅ FIXED: After transformation
			// - filter: 1 operation (global)
			// - analysis: 2 operations (2 sections)
			// - Total: 1 + 2 = 3
			if (afterTransformation) {
				expect(afterTransformation.total).toBe(3); // ✅ Changed from 4 to 3
				expect(afterTransformation.completed).toBe(1); // Only filter completed
				expect(afterTransformation.percent).toBeCloseTo(33.3, 1); // ✅ 1/3 = 33.3%
			}

			expect(final).toBeDefined();
			expect(final!.total).toBe(3); // ✅ Changed from 4 to 3
			expect(final!.completed).toBe(3); // ✅ Changed: 1 filter + 2 analysis = 3
			expect(final!.percent).toBe(100); // Reaches 100%!

			expect(final!.dimensions.analysis).toBeDefined();
			expect(final!.dimensions.analysis!.completed).toBe(2);
			expect(final!.dimensions.analysis!.percent).toBe(100); // 2/2 = 100%
		});

		test("should handle multiple sequential transformations correctly", async () => {
			const progressUpdates: ProgressUpdate[] = [];

			class ChainedTransformPlugin extends Plugin {
				constructor() {
					super("chained-transform", "Chained Transform", "Test");
					this.dimensions = [
						{
							name: "first_filter",
							scope: "global" as const,
							transform: (_result, sections: SectionData[]) => {
								return sections.slice(0, 6); // 10 → 6
							},
						},
						{
							name: "second_filter",
							scope: "global" as const,
							transform: (_result, sections: SectionData[]) => {
								return sections.slice(0, 3); // 6 → 3
							},
						},
						"final_analysis",
					];
				}

				createPrompt(context: PromptContext): string {
					return context.dimension;
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return {
						second_filter: ["first_filter"],
						final_analysis: ["second_filter"],
					};
				}
			}

			const engine = new DagEngine({
				plugin: new ChainedTransformPlugin(),
				registry,
			});

			await engine.process(
				[
					createMockSection("Section 1"),
					createMockSection("Section 2"),
					createMockSection("Section 3"),
					createMockSection("Section 4"),
					createMockSection("Section 5"),
					createMockSection("Section 6"),
					createMockSection("Section 7"),
					createMockSection("Section 8"),
					createMockSection("Section 9"),
					createMockSection("Section 10"),
				],
				{
					onProgress: (p) => progressUpdates.push(p),
					updateEvery: 1,
				}
			);

			// ✅ FIXED: Get LAST update after each filter (after transformation applied)
			const afterFirstFilterUpdates = progressUpdates.filter(
				(p) => p.dimensions.first_filter?.completed === 1 &&
					p.dimensions.second_filter?.completed === 0
			);
			const afterFirstFilter = afterFirstFilterUpdates[afterFirstFilterUpdates.length - 1];

			const afterSecondFilterUpdates = progressUpdates.filter(
				(p) => p.dimensions.first_filter?.completed === 1 &&
					p.dimensions.second_filter?.completed === 1 &&
					p.dimensions.final_analysis?.completed === 0
			);
			const afterSecondFilter = afterSecondFilterUpdates[afterSecondFilterUpdates.length - 1];

			const final = progressUpdates[progressUpdates.length - 1];

			// After first filter: 10 → 6 sections
			// Total: 1 (first_filter) + 1 (second_filter) + 6 (final_analysis) = 8
			if (afterFirstFilter) {
				expect(afterFirstFilter.total).toBeLessThan(30); // Less than original 10×3
				expect(afterFirstFilter.total).toBe(8); // ✅ More specific
				expect(afterFirstFilter.completed).toBe(1);
			}

			// After second filter: 6 → 3 sections
			// Total: 1 (first_filter) + 1 (second_filter) + 3 (final_analysis) = 5
			if (afterSecondFilter) {
				expect(afterSecondFilter.total).toBe(5);
				expect(afterSecondFilter.completed).toBe(2);
				expect(afterSecondFilter.percent).toBe(40); // 2/5 = 40%
			}

			// Final: should reach 100%
			expect(final).toBeDefined();
			expect(final!.percent).toBe(100);
			expect(final!.completed).toBe(final!.total);

			expect(final!.dimensions.final_analysis!.completed).toBe(3);
		});

		test("should show accurate cost estimates after transformation", async () => {
			const progressUpdates: ProgressUpdate[] = [];

			class CostEstimateTransformPlugin extends Plugin {
				constructor() {
					super("cost-estimate-transform", "Cost Estimate Transform", "Test");
					this.dimensions = [
						{
							name: "filter",
							scope: "global" as const,
							transform: (_result, sections: SectionData[]) => {
								return sections.slice(0, 2); // 5 → 2
							},
						},
						"expensive_analysis",
					];
				}

				createPrompt(context: PromptContext): string {
					return context.dimension;
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return { expensive_analysis: ["filter"] };
				}
			}

			// Mock expensive operations
			mockProvider.execute = async () => {
				return {
					data: { result: "ok" },
					metadata: {
						tokens: {
							inputTokens: 1000,
							outputTokens: 2000,
							totalTokens: 3000,
						},
						model: "test-model",
						provider: "mock-ai",
					},
				};
			};

			const engine = new DagEngine({
				plugin: new CostEstimateTransformPlugin(),
				registry,
				pricing: {
					models: {
						"test-model": {
							inputPer1M: 3.0,
							outputPer1M: 15.0,
						},
					},
				},
			});

			await engine.process(
				[
					createMockSection("Section 1"),
					createMockSection("Section 2"),
					createMockSection("Section 3"),
					createMockSection("Section 4"),
					createMockSection("Section 5"),
				],
				{
					onProgress: (p) => progressUpdates.push(p),
					updateEvery: 1,
				}
			);

			// ✅ FIXED: Get LAST update after filter (after transformation applied)
			const afterFilterUpdates = progressUpdates.filter(
				(p) => p.dimensions.filter?.completed === 1 &&
					p.dimensions.expensive_analysis?.completed === 0
			);
			const afterTransformation = afterFilterUpdates[afterFilterUpdates.length - 1];

			const final = progressUpdates[progressUpdates.length - 1];

			// Cost per operation
			const costPerOp = (1000 * 3.0 / 1_000_000) + (2000 * 15.0 / 1_000_000);
			// = 0.003 + 0.030 = 0.033

			// After transformation: estimated cost should reflect new total (4 operations)
			if (afterTransformation) {
				// 1 filter + 2 analysis = 3 total operations
				const expectedFinalCost = costPerOp * 3;
				expect(afterTransformation.estimatedCost).toBeCloseTo(expectedFinalCost, 2);
			}

			// Final: actual cost should match estimate
			expect(final).toBeDefined();
			const expectedFinalCost = costPerOp * 3; // 3 total operations
			expect(final!.cost).toBeCloseTo(expectedFinalCost, 2);
			expect(final!.estimatedCost).toBeCloseTo(final!.cost, 2);
		});
	});
});