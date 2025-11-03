import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../../src/core/engine";
import { TestPlugin } from "../helpers/test-plugin";
import { ProviderAdapter } from "../../src/providers/adapter";
import type {
	ProcessContext,
	DimensionContext,
	SectionDimensionContext,
	DimensionDependencies,
	ProviderRequest,
	ProviderResponse,
} from "../../src/types";

// ============================================================================
// TEST TYPES & HELPERS
// ============================================================================

interface TestData {
	result?: string;
	transformed?: boolean;
	sections?: unknown[];
	aggregated?: boolean;
	count?: number;
	externalData?: {
		apiKey?: string;
		config?: { timeout: number };
	};
	[key: string]: unknown;
}

/**
 * Mock provider that implements the minimum interface needed
 */
class MockProvider {
	name = "mock";
	callLog: string[] = [];

	async execute(request: ProviderRequest): Promise<ProviderResponse> {
		this.callLog.push(request.dimension || "unknown");
		return {
			data: { result: `result-${request.dimension}` },
			metadata: {
				model: "test-model",
				provider: "mock",
				tokens: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
			},
		};
	}

	reset(): void {
		this.callLog = [];
	}

	// Stub methods required by BaseProvider interface
	getGatewayApiKey(): string | undefined {
		return undefined;
	}

	getGatewayConfig() {
		return undefined;
	}

	getProviderApiKey(): string | undefined {
		return undefined;
	}

	getBaseUrl(): string | undefined {
		return undefined;
	}

	get config() {
		return {};
	}
}

// ============================================================================
// TESTS
// ============================================================================

describe("Dependency Hooks", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as unknown as import("../../src/providers/types").BaseProvider);
	});

	describe("defineDependencies", () => {
		test("should define dependency graph", async () => {
			let hookCalled = false;
			let capturedContext: ProcessContext | null = null;

			class DepsPlugin extends TestPlugin {
				constructor() {
					super("deps", "Dependencies", "Test");
					this.dimensions = ["base", "dependent", "final"];
				}

				createPrompt(context: { dimension: string }): string {
					return context.dimension;
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				defineDependencies(context: ProcessContext): Record<string, string[]> {
					hookCalled = true;
					capturedContext = context;

					return {
						dependent: ["base"],
						final: ["dependent"],
					};
				}
			}

			const engine = new DagEngine({
				plugin: new DepsPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(hookCalled).toBe(true);
			expect(capturedContext).toBeDefined();
			expect(capturedContext!.processId).toBeDefined();
			expect(capturedContext!.sections).toHaveLength(1);

			// Verify execution order: base -> dependent -> final
			expect(mockProvider.callLog).toEqual(["base", "dependent", "final"]);
		});

		test("should handle async defineDependencies", async () => {
			let asyncCompleted = false;

			class AsyncDepsPlugin extends TestPlugin {
				constructor() {
					super("async-deps", "Async Deps", "Test");
					this.dimensions = ["a", "b"];
				}

				createPrompt(context: { dimension: string }): string {
					return context.dimension;
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				async defineDependencies(): Promise<Record<string, string[]>> {
					await new Promise((resolve) => setTimeout(resolve, 50));
					asyncCompleted = true;
					return { b: ["a"] };
				}
			}

			const engine = new DagEngine({
				plugin: new AsyncDepsPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(asyncCompleted).toBe(true);
			expect(mockProvider.callLog).toEqual(["a", "b"]);
		});

		test("should handle complex dependency graphs", async () => {
			class ComplexDepsPlugin extends TestPlugin {
				constructor() {
					super("complex", "Complex", "Test");
					this.dimensions = ["a", "b", "c", "d", "e"];
				}

				createPrompt(context: { dimension: string }): string {
					return context.dimension;
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return {
						b: ["a"],
						c: ["a"],
						d: ["b", "c"],
						e: ["d"],
					};
				}
			}

			const engine = new DagEngine({
				plugin: new ComplexDepsPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			const aIndex = mockProvider.callLog.indexOf("a");
			const bIndex = mockProvider.callLog.indexOf("b");
			const cIndex = mockProvider.callLog.indexOf("c");
			const dIndex = mockProvider.callLog.indexOf("d");
			const eIndex = mockProvider.callLog.indexOf("e");

			// Verify topological order
			expect(aIndex).toBeLessThan(bIndex);
			expect(aIndex).toBeLessThan(cIndex);
			expect(bIndex).toBeLessThan(dIndex);
			expect(cIndex).toBeLessThan(dIndex);
			expect(dIndex).toBeLessThan(eIndex);
		});

		test("should handle empty dependencies", async () => {
			class NoDepsPlugin extends TestPlugin {
				constructor() {
					super("no-deps", "No Deps", "Test");
					this.dimensions = ["a", "b", "c"];
				}

				createPrompt(context: { dimension: string }): string {
					return context.dimension;
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return {};
				}
			}

			const engine = new DagEngine({
				plugin: new NoDepsPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			// All dimensions should execute (order may vary)
			expect(mockProvider.callLog).toHaveLength(3);
			expect(mockProvider.callLog).toContain("a");
			expect(mockProvider.callLog).toContain("b");
			expect(mockProvider.callLog).toContain("c");
		});

		test("should handle errors in defineDependencies", async () => {
			class ErrorDepsPlugin extends TestPlugin {
				constructor() {
					super("error-deps", "Error Deps", "Test");
					this.dimensions = ["test"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					throw new Error("defineDependencies failed");
				}
			}

			const engine = new DagEngine({
				plugin: new ErrorDepsPlugin(),
				providers: adapter,
			});

			await expect(
				engine.process([{ content: "Test", metadata: {} }]),
			).rejects.toThrow("defineDependencies failed");
		});

		test("should detect circular dependencies", async () => {
			class CircularDepsPlugin extends TestPlugin {
				constructor() {
					super("circular", "Circular", "Test");
					this.dimensions = ["a", "b", "c"];
				}

				createPrompt(context: { dimension: string }): string {
					return context.dimension;
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return {
						a: ["b"],
						b: ["c"],
						c: ["a"], // Circular!
					};
				}
			}

			const engine = new DagEngine({
				plugin: new CircularDepsPlugin(),
				providers: adapter,
			});

			await expect(
				engine.process([{ content: "Test", metadata: {} }]),
			).rejects.toThrow();
		});
	});

	describe("transformDependencies", () => {
		test("should transform dependencies for section dimensions", async () => {
			let transformCalled = false;
			let capturedDeps: DimensionDependencies | null = null;

			class TransformDepsPlugin extends TestPlugin {
				constructor() {
					super("transform", "Transform", "Test");
					this.dimensions = ["base", "dependent"];
				}

				createPrompt(context: { dimension: string }): string {
					return context.dimension;
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return { dependent: ["base"] };
				}

				transformDependencies(
					context: SectionDimensionContext,
				): DimensionDependencies {
					if (context.dimension === "dependent") {
						transformCalled = true;
						capturedDeps = context.dependencies;

						const baseData = context.dependencies.base?.data as TestData | undefined;

						// Add metadata to dependency
						return {
							base: {
								data: {
									...baseData,
									transformed: true,
								},
								error: context.dependencies.base?.error,
								metadata: context.dependencies.base?.metadata,
							},
						};
					}
					return context.dependencies;
				}
			}

			const engine = new DagEngine({
				plugin: new TransformDepsPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(transformCalled).toBe(true);
			expect(capturedDeps).toBeDefined();
			expect(capturedDeps!.base).toBeDefined();
		});

		test("should transform dependencies for global dimensions", async () => {
			let globalTransformCalled = false;

			class GlobalTransformPlugin extends TestPlugin {
				constructor() {
					super("global-transform", "Global Transform", "Test");
					this.dimensions = [
						"section_dim",
						{ name: "global_dim", scope: "global" as const },
					];
				}

				createPrompt(context: { dimension: string }): string {
					return context.dimension;
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return { global_dim: ["section_dim"] };
				}

				transformDependencies(
					context: DimensionContext,
				): DimensionDependencies {
					if (context.dimension === "global_dim") {
						globalTransformCalled = true;

						// Aggregate section results
						const sectionDep = context.dependencies.section_dim;
						const sectionData = sectionDep?.data as TestData | undefined;

						if (sectionData?.sections) {
							return {
								section_dim: {
									data: {
										aggregated: true,
										count: sectionData.sections.length,
									},
								},
							};
						}
					}
					return context.dependencies;
				}
			}

			const engine = new DagEngine({
				plugin: new GlobalTransformPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(globalTransformCalled).toBe(true);
		});

		test("should handle async transformDependencies", async () => {
			let asyncCompleted = false;

			class AsyncTransformPlugin extends TestPlugin {
				constructor() {
					super("async-transform", "Async Transform", "Test");
					this.dimensions = ["a", "b"];
				}

				createPrompt(context: { dimension: string }): string {
					return context.dimension;
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return { b: ["a"] };
				}

				async transformDependencies(
					context: SectionDimensionContext,
				): Promise<DimensionDependencies> {
					if (context.dimension === "b") {
						await new Promise((resolve) => setTimeout(resolve, 50));
						asyncCompleted = true;
					}
					return context.dependencies;
				}
			}

			const engine = new DagEngine({
				plugin: new AsyncTransformPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(asyncCompleted).toBe(true);
		});

		test("should handle errors in transformDependencies gracefully", async () => {
			const errors: string[] = [];

			class ErrorTransformPlugin extends TestPlugin {
				constructor() {
					super("error-transform", "Error Transform", "Test");
					this.dimensions = ["a", "b"];
				}

				createPrompt(context: { dimension: string }): string {
					return context.dimension;
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return { b: ["a"] };
				}

				transformDependencies(
					context: SectionDimensionContext,
				): DimensionDependencies {
					if (context.dimension === "b") {
						throw new Error("transformDependencies failed");
					}
					return context.dependencies;
				}
			}

			const engine = new DagEngine({
				plugin: new ErrorTransformPlugin(),
				providers: adapter,
			});

			const result = await engine.process([{ content: "Test", metadata: {} }], {
				onError: (context, error) => errors.push(error.message),
			});

			// Should continue with original dependencies
			expect(result.sections[0]?.results.b).toBeDefined();
			expect(errors).toContain("transformDependencies failed");
		});

		test("should filter dependencies", async () => {
			let filteredDeps: DimensionDependencies | null = null;

			class FilterDepsPlugin extends TestPlugin {
				constructor() {
					super("filter", "Filter", "Test");
					this.dimensions = ["a", "b", "c"];
				}

				createPrompt(context: { dimension: string; dependencies?: DimensionDependencies }): string {
					if (context.dimension === "c" && context.dependencies) {
						filteredDeps = context.dependencies;
					}
					return context.dimension;
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return { c: ["a", "b"] };
				}

				transformDependencies(
					context: SectionDimensionContext,
				): DimensionDependencies {
					if (context.dimension === "c") {
						// Filter out 'a', keep only 'b'
						const { a, ...rest } = context.dependencies;
						return rest;
					}
					return context.dependencies;
				}
			}

			const engine = new DagEngine({
				plugin: new FilterDepsPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);

			expect(filteredDeps).toBeDefined();
			expect(filteredDeps!.a).toBeUndefined();
			expect(filteredDeps!.b).toBeDefined();
		});

		test("should enrich dependencies with external data", async () => {
			const externalData = { apiKey: "secret123", config: { timeout: 5000 } };

			class EnrichDepsPlugin extends TestPlugin {
				constructor() {
					super("enrich", "Enrich", "Test");
					this.dimensions = ["fetch", "process"];
				}

				createPrompt(context: { dimension: string }): string {
					return context.dimension;
				}

				selectProvider() {
					return { provider: "mock", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return { process: ["fetch"] };
				}

				transformDependencies(
					context: SectionDimensionContext,
				): DimensionDependencies {
					if (context.dimension === "process") {
						const fetchData = context.dependencies.fetch?.data as TestData | undefined;

						return {
							fetch: {
								data: {
									...fetchData,
									externalData,
								},
								error: context.dependencies.fetch?.error,
								metadata: context.dependencies.fetch?.metadata,
							},
						};
					}
					return context.dependencies;
				}
			}

			const engine = new DagEngine({
				plugin: new EnrichDepsPlugin(),
				providers: adapter,
			});

			await engine.process([{ content: "Test", metadata: {} }]);
			// Dependencies are enriched during execution
		});
	});
});