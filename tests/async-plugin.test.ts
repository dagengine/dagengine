import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../src/core/engine";
import { Plugin, type PromptContext, type ProviderSelection } from "../src/plugin";
import { ProviderRegistry } from "../src/providers/registry";
import { MockAIProvider, createMockSection } from "./setup";
import type { DimensionResult } from "../src/types";

// ============================================================================
// TEST TYPES
// ============================================================================

/**
 * Type for stored results in tests
 */
interface StoredResult {
	results: Record<string, DimensionResult>;
	stored_at: string;
	[key: string]: unknown;
}

/**
 * Type-safe helper to access dimension result
 */
function isDimensionResult(value: unknown): value is DimensionResult {
	return (
		typeof value === "object" &&
		value !== null &&
		("data" in value || "error" in value)
	);
}

// ============================================================================
// TESTS
// ============================================================================

describe("DagEngine - Async Plugin Methods", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("test", { result: "ok" });
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	describe("Async createPrompt()", () => {
		test("should handle async createPrompt with external API call", async () => {
			class AsyncPromptPlugin extends Plugin {
				constructor() {
					super("async-prompt", "Async Prompt", "Test");
					this.dimensions = ["fetch_and_analyze"];
				}

				async createPrompt(context: PromptContext): Promise<string> {
					// Simulate API call
					await new Promise((resolve) => setTimeout(resolve, 50));
					const externalData = { status: "fetched", timestamp: Date.now() };

					return `Analyze with context: ${JSON.stringify(externalData)}\n${context.sections[0]?.content}`;
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			const engine = new DagEngine({
				plugin: new AsyncPromptPlugin(),
				registry,
			});

			const result = await engine.process([createMockSection("Test content")]);

			expect(result.sections[0]?.results.fetch_and_analyze).toBeDefined();
			expect(result.sections[0]?.results.fetch_and_analyze?.data).toBeDefined();
		});

		test("should handle sync createPrompt (backward compatibility)", async () => {
			class SyncPromptPlugin extends Plugin {
				constructor() {
					super("sync-prompt", "Sync Prompt", "Test");
					this.dimensions = ["simple"];
				}

				createPrompt(context: PromptContext): string {
					return `Simple: ${context.sections[0]?.content}`;
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			const engine = new DagEngine({
				plugin: new SyncPromptPlugin(),
				registry,
			});

			const result = await engine.process([createMockSection("Test")]);

			expect(result.sections[0]?.results.simple).toBeDefined();
		});

		test("should handle async createPrompt with database query simulation", async () => {
			const queryLog: string[] = [];

			class DatabasePromptPlugin extends Plugin {
				constructor() {
					super("db-prompt", "DB Prompt", "Test");
					this.dimensions = ["enrich"];
				}

				async createPrompt(context: PromptContext): Promise<string> {
					// Simulate database query
					queryLog.push("db-query-start");
					await new Promise((resolve) => setTimeout(resolve, 30));
					const dbResult = { userId: 123, preferences: ["tech", "science"] };
					queryLog.push("db-query-end");

					return `User context: ${JSON.stringify(dbResult)}\nContent: ${context.sections[0]?.content}`;
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			const engine = new DagEngine({
				plugin: new DatabasePromptPlugin(),
				registry,
			});

			await engine.process([createMockSection("Analyze this")]);

			expect(queryLog).toEqual(["db-query-start", "db-query-end"]);
		});

		test("should handle async createPrompt with Promise.all for parallel calls", async () => {
			class ParallelPromptPlugin extends Plugin {
				constructor() {
					super("parallel-prompt", "Parallel Prompt", "Test");
					this.dimensions = ["multi_source"];
				}

				async createPrompt(context: PromptContext): Promise<string> {
					// Simulate multiple parallel API calls
					const [data1, data2, data3] = await Promise.all([
						this.fetchData("source1"),
						this.fetchData("source2"),
						this.fetchData("source3"),
					]);

					return `Sources: ${data1}, ${data2}, ${data3}\nContent: ${context.sections[0]?.content}`;
				}

				private async fetchData(source: string): Promise<string> {
					await new Promise((resolve) => setTimeout(resolve, 20));
					return `data-from-${source}`;
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			const engine = new DagEngine({
				plugin: new ParallelPromptPlugin(),
				registry,
			});

			const startTime = Date.now();
			await engine.process([createMockSection("Test")]);
			const duration = Date.now() - startTime;

			// Should take ~20ms (parallel), not ~60ms (sequential)
			expect(duration).toBeLessThan(100);
		});
	});

	describe("Async selectProvider()", () => {
		test("should handle async provider selection with health check", async () => {
			const healthChecks: string[] = [];

			class AsyncProviderPlugin extends Plugin {
				constructor() {
					super("async-provider", "Async Provider", "Test");
					this.dimensions = ["analyze"];
				}

				createPrompt(context: PromptContext): string {
					return context.sections[0]?.content ?? "invalid result";
				}

				async selectProvider(): Promise<ProviderSelection> {
					// Simulate health check
					healthChecks.push("checking-mock-ai");
					await new Promise((resolve) => setTimeout(resolve, 20));
					const isHealthy = true;
					healthChecks.push("mock-ai-healthy");

					return {
						provider: isHealthy ? "mock-ai" : "fallback",
						options: {},
					};
				}
			}

			const engine = new DagEngine({
				plugin: new AsyncProviderPlugin(),
				registry,
			});

			await engine.process([createMockSection("Test")]);

			expect(healthChecks).toEqual(["checking-mock-ai", "mock-ai-healthy"]);
		});

		test("should handle sync selectProvider (backward compatibility)", async () => {
			class SyncProviderPlugin extends Plugin {
				constructor() {
					super("sync-provider", "Sync Provider", "Test");
					this.dimensions = ["simple"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			const engine = new DagEngine({
				plugin: new SyncProviderPlugin(),
				registry,
			});

			const result = await engine.process([createMockSection("Test")]);

			expect(result.sections[0]?.results.simple).toBeDefined();
		});

		test("should handle async provider selection with rate limit check", async () => {
			const rateLimits = new Map<string, number>([
				["mock-ai", 100],
				["fallback", 50],
			]);

			class RateLimitProviderPlugin extends Plugin {
				constructor() {
					super("rate-limit", "Rate Limit", "Test");
					this.dimensions = ["process"];
				}

				createPrompt(): string {
					return "test";
				}

				async selectProvider(): Promise<ProviderSelection> {
					// Check rate limits
					await new Promise((resolve) => setTimeout(resolve, 10));

					const mockAiLimit = rateLimits.get("mock-ai") || 0;
					if (mockAiLimit > 0) {
						rateLimits.set("mock-ai", mockAiLimit - 1);
						return { provider: "mock-ai", options: {} };
					}

					return { provider: "fallback", options: {} };
				}
			}

			const engine = new DagEngine({
				plugin: new RateLimitProviderPlugin(),
				registry,
			});

			await engine.process([createMockSection("Test")]);

			expect(rateLimits.get("mock-ai")).toBe(99);
		});
	});

	describe("Async defineDependencies()", () => {
		test("should handle async defineDependencies from config file", async () => {
			class AsyncDependenciesPlugin extends Plugin {
				constructor() {
					super("async-deps", "Async Deps", "Test");
					this.dimensions = ["step1", "step2", "step3"];
				}

				async defineDependencies(): Promise<Record<string, string[]>> {
					// Simulate loading from config file
					await new Promise((resolve) => setTimeout(resolve, 30));
					return {
						step2: ["step1"],
						step3: ["step2"],
					};
				}

				createPrompt(context: PromptContext): string {
					return context.dimension;
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			const executionOrder: string[] = [];
			mockProvider.execute = async (request) => {
				executionOrder.push(request.input as string);
				return { data: { result: "ok" } };
			};

			const engine = new DagEngine({
				plugin: new AsyncDependenciesPlugin(),
				registry,
			});

			await engine.process([createMockSection("Test")]);

			expect(executionOrder).toEqual(["step1", "step2", "step3"]);
		});

		test("should handle sync defineDependencies (backward compatibility)", async () => {
			class SyncDependenciesPlugin extends Plugin {
				constructor() {
					super("sync-deps", "Sync Deps", "Test");
					this.dimensions = ["a", "b"];
				}

				defineDependencies(): Record<string, string[]> {
					return { b: ["a"] };
				}

				createPrompt(context: PromptContext): string {
					return context.dimension;
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			const engine = new DagEngine({
				plugin: new SyncDependenciesPlugin(),
				registry,
			});

			const result = await engine.process([createMockSection("Test")]);

			expect(result.sections[0]?.results.a).toBeDefined();
			expect(result.sections[0]?.results.b).toBeDefined();
		});
	});

	describe("Handle getDimensionNames()", () => {
		test("should handle sync getDimensionNames", async () => {
			class SyncDimensionNamesPlugin extends Plugin {
				constructor() {
					super("sync-dims", "Sync Dims", "Test");
					this.dimensions = ["dim1", "dim2"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			const engine = new DagEngine({
				plugin: new SyncDimensionNamesPlugin(),
				registry,
			});

			const result = await engine.process([createMockSection("Test")]);

			expect(result.sections[0]?.results.dim1).toBeDefined();
			expect(result.sections[0]?.results.dim2).toBeDefined();
		});
	});

	describe("Async finalizeResults()", () => {
		test("should handle async finalizeResults with database storage", async () => {
			const storedResults: StoredResult[] = [];

			class AsyncProcessResultsPlugin extends Plugin {
				constructor() {
					super("async-process", "Async Process", "Test");
					this.dimensions = ["test"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}

				async finalizeResults(
					context: { results: Record<string, DimensionResult> },
				): Promise<Record<string, DimensionResult>> {
					const { results } = context;

					// Simulate async database storage
					await new Promise((resolve) => setTimeout(resolve, 10));

					// Store results
					storedResults.push({
						results,
						stored_at: new Date().toISOString(),
					});

					const finalizedResults: Record<string, DimensionResult> = {};

					Object.entries(results).forEach(([key, result]) => {
						if (!isDimensionResult(result)) return;

						finalizedResults[key] = {
							data: result.data,
							error: result.error,
							metadata: {
								...(result.metadata || {}),
								stored: true,
								stored_at: new Date().toISOString(),
							},
						};
					});

					return finalizedResults;
				}
			}

			const engine = new DagEngine({
				plugin: new AsyncProcessResultsPlugin(),
				registry,
			});

			await engine.process([createMockSection("Test")]);

			expect(storedResults).toHaveLength(1);
			expect(storedResults[0]).toHaveProperty("stored_at");
		});

		test("should handle sync finalizeResults (backward compatibility)", async () => {
			class SyncProcessResultsPlugin extends Plugin {
				constructor() {
					super("sync-process", "Sync Process", "Test");
					this.dimensions = ["test"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}

				finalizeResults(context: {
					results: Record<string, DimensionResult>;
				}): Record<string, DimensionResult> {
					const { results } = context;

					const finalizedResults: Record<string, DimensionResult> = {};

					Object.entries(results).forEach(([key, result]) => {
						if (!isDimensionResult(result)) return;

						finalizedResults[key] = {
							data: result.data,
							error: result.error,
							metadata: {
								...(result.metadata || {}),
								processed_sync: true,
							},
						};
					});

					return finalizedResults;
				}
			}

			const engine = new DagEngine({
				plugin: new SyncProcessResultsPlugin(),
				registry,
			});

			const result = await engine.process([createMockSection("Test")]);

			expect(result.sections[0]?.results.test?.metadata?.processed_sync).toBe(
				true,
			);
		});
	});

	describe("Async transform()", () => {
		test("should handle async transform with external enrichment", async () => {
			const enrichmentCalls: string[] = [];

			class AsyncTransformPlugin extends Plugin {
				constructor() {
					super("async-transform", "Async Transform", "Test");
					this.dimensions = [
						{
							name: "enrich",
							scope: "global" as const,
							transform: async (result, sections) => {
								// Simulate enrichment API calls
								const enriched = await Promise.all(
									sections.map(async (section) => {
										enrichmentCalls.push(`enriching-${section.content}`);
										await new Promise((resolve) => setTimeout(resolve, 20));
										return {
											content: section.content,
											metadata: {
												...section.metadata,
												enriched: true,
												timestamp: Date.now(),
											},
										};
									}),
								);
								return enriched;
							},
						},
					];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			const engine = new DagEngine({
				plugin: new AsyncTransformPlugin(),
				registry,
			});

			const result = await engine.process([
				createMockSection("Section1"),
				createMockSection("Section2"),
			]);

			expect(enrichmentCalls).toHaveLength(2);
			expect(result.transformedSections[0]?.metadata.enriched).toBe(true);
			expect(result.transformedSections[1]?.metadata.enriched).toBe(true);
		});

		test("should handle sync transform (backward compatibility)", async () => {
			class SyncTransformPlugin extends Plugin {
				constructor() {
					super("sync-transform", "Sync Transform", "Test");
					this.dimensions = [
						{
							name: "merge",
							scope: "global" as const,
							transform: (result, sections) => {
								return [
									{
										content: sections.map((s) => s.content).join(" "),
										metadata: { merged: true },
									},
								];
							},
						},
					];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			const engine = new DagEngine({
				plugin: new SyncTransformPlugin(),
				registry,
			});

			const result = await engine.process([
				createMockSection("A"),
				createMockSection("B"),
			]);

			expect(result.transformedSections).toHaveLength(1);
			expect(result.transformedSections[0]?.content).toBe("A B");
		});
	});
});