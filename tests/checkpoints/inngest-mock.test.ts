import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../../src/core/engine/dag-engine";
import { Plugin } from "../../src/plugin";
import { ProviderRegistry } from "../../src/providers/registry";
import { MockAIProvider, createMockSection } from "../setup";
import {
	serializeState,
	deserializeState,
	createProcessState,
} from "../../src/core/engine/state-manager";
import type { DimensionResult, SectionData, } from "../../src/types";

// ============================================================================
// TEST TYPES & HELPERS
// ============================================================================

interface TestResultData {
	result?: string;
	step?: number;
	content?: string;
	longText?: string;
	[key: string]: unknown;
}

interface CheckpointData {
	processId: string;
	sections: SectionData[];
	completedDimensions: string[];
}

/**
 * Type-safe helper to extract dimension data from section results
 */
function getDimensionData<T = TestResultData>(
	map: Map<number, Record<string, DimensionResult>>,
	sectionIndex: number,
	dimension: string,
): T | undefined {
	return map.get(sectionIndex)?.[dimension]?.data as T | undefined;
}

/**
 * Create a test plugin with configurable dimensions and dependencies
 */
/**
 * Create a test plugin with configurable dimensions and dependencies
 */
function createTestPlugin(config: {
	id: string;
	dimensions: Array<string | { name: string; scope: "global" | "section" }>;
	dependencies?: Record<string, string[]>;
}): Plugin {
	return new (class extends Plugin {
		constructor() {
			super(config.id, config.id, "Test Plugin");
			this.dimensions = config.dimensions;
		}

		createPrompt(): string {
			return "test";
		}

		selectProvider() {
			return {
				provider: "mock-ai",
				options: {} // ✅ Add required options property
			};
		}

		defineDependencies(): Record<string, string[]> {
			return config.dependencies || {};
		}
	})();
}

/**
 * Simulate a serialization checkpoint cycle
 */
function checkpointCycle<T extends { id: string; sections: SectionData[] }>(
	state: T,
): T {
	const serialized = serializeState(state as any);
	const json = JSON.stringify(serialized);
	const parsed = JSON.parse(json);
	return deserializeState(parsed) as unknown as T;
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe("Inngest Checkpoint Flow - Integration Tests", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;
	let plugin: Plugin;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("test", { result: "ok" });

		registry = new ProviderRegistry();
		registry.register(mockProvider);

		plugin = createTestPlugin({
			id: "test",
			dimensions: ["dim1", "dim2", "dim3"],
			dependencies: {
				dim2: ["dim1"],
				dim3: ["dim2"],
			},
		});
	});

	// ========================================================================
	// STEP-BY-STEP CHECKPOINT SIMULATION
	// ========================================================================

	describe("Step-by-Step Checkpoint Simulation", () => {
		test("should execute workflow maintaining dependency order", async () => {
			const engine = new DagEngine({ plugin, registry });
			const sections = [createMockSection("Test")];

			const result = await engine.process(sections);

			// Verify all dimensions executed
			const sectionResults = result.sections[0]?.results;
			expect(sectionResults?.dim1).toBeDefined();
			expect(sectionResults?.dim2).toBeDefined();
			expect(sectionResults?.dim3).toBeDefined();

			// Verify data integrity
			expect(sectionResults?.dim1?.data).toBeDefined();
			expect(sectionResults?.dim2?.data).toBeDefined();
			expect(sectionResults?.dim3?.data).toBeDefined();
		});

		test("should handle execution groups with global and section dimensions", async () => {
			const groupPlugin = createTestPlugin({
				id: "groups",
				dimensions: [
					{ name: "g1", scope: "global" },
					{ name: "g2", scope: "global" },
					"section1",
					"section2",
				],
				dependencies: {
					g2: ["g1"],
					section1: ["g2"],
					section2: ["section1"],
				},
			});

			const engine = new DagEngine({ plugin: groupPlugin, registry });
			const sections = [createMockSection("Test")];
			const result = await engine.process(sections);

			// Verify global dimensions
			expect(result.globalResults.g1).toBeDefined();
			expect(result.globalResults.g2).toBeDefined();

			// Verify section dimensions
			const sectionResults = result.sections[0]?.results;
			expect(sectionResults?.section1).toBeDefined();
			expect(sectionResults?.section2).toBeDefined();
		});

		test("should maintain state consistency throughout workflow", async () => {
			const engine = new DagEngine({ plugin, registry });
			const sections = [createMockSection("Test")];
			const result = await engine.process(sections);

			// Verify complete execution
			const dimensions = ["dim1", "dim2", "dim3"];
			dimensions.forEach((dim) => {
				const dimResult = result.sections[0]?.results[dim];
				expect(dimResult).toBeDefined();
				expect(dimResult?.data).toBeDefined();
			});
		});
	});

	// ========================================================================
	// CRASH AND RESUME SCENARIOS
	// ========================================================================

	describe("Crash and Resume Scenarios", () => {
		test("should simulate Inngest checkpoint behavior", async () => {
			const sections = [createMockSection("Test")];

			// First execution - completes successfully
			const engine1 = new DagEngine({ plugin, registry });
			const result1 = await engine1.process(sections);

			// Simulate checkpoint data (stored by Inngest)
			const checkpoint: CheckpointData = {
				processId: "test-process-123",
				sections,
				completedDimensions: ["dim1", "dim2"],
			};

			// Second execution - simulates resume
			const engine2 = new DagEngine({ plugin, registry });
			const result2 = await engine2.process(sections);

			// Both executions complete successfully
			expect(result1.sections[0]?.results.dim1).toBeDefined();
			expect(result2.sections[0]?.results.dim1).toBeDefined();

			// Verify checkpoint data is serializable
			const checkpointJson = JSON.stringify(checkpoint);
			expect(JSON.parse(checkpointJson)).toEqual(checkpoint);
		});

		test("should handle errors with continueOnError enabled", async () => {
			mockProvider.execute = async (request) => {
				// Fail dim2, succeed others
				if (request.dimension === "dim2") {
					return { error: "dim2 failed" };
				}
				return { data: { result: "ok" } };
			};

			const engine = new DagEngine({
				plugin,
				registry,
				execution: {
					continueOnError: true,
					maxRetries: 0,
				},
			});

			const sections = [createMockSection("Test")];
			const result = await engine.process(sections);

			// dim1 succeeds
			expect(result.sections[0]?.results.dim1?.data).toBeDefined();
			expect(result.sections[0]?.results.dim1?.error).toBeUndefined();

			// dim2 fails
			expect(result.sections[0]?.results.dim2?.error).toBeDefined();
			expect(result.sections[0]?.results.dim2?.data).toBeUndefined();

			// dim3 succeeds (continueOnError: true)
			expect(result.sections[0]?.results.dim3?.data).toBeDefined();
			expect(result.sections[0]?.results.dim3?.error).toBeUndefined();
		});
	});

	// ========================================================================
	// STATE SERIALIZATION CORRECTNESS
	// ========================================================================

	describe("State Serialization Correctness", () => {
		test("should serialize and deserialize initial state", async () => {
			const sections = [createMockSection("Test")];
			const initialState = createProcessState(sections);

			// Serialize
			const serialized = serializeState(initialState);
			const json = JSON.stringify(serialized);
			expect(json).toBeDefined();

			// Deserialize
			const deserialized = deserializeState(JSON.parse(json));

			// Verify identity
			expect(deserialized.id).toBe(initialState.id);
			expect(deserialized.startTime).toBe(initialState.startTime);
			expect(deserialized.sections).toEqual(sections);
			expect(deserialized.sectionResultsMap.size).toBe(sections.length);
		});

		test("should preserve partial results during serialization", async () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			// Add partial results (simulates mid-execution checkpoint)
			state.globalResults.dim1 = {
				data: { result: "completed" },
				metadata: { tokens: { inputTokens: 50, outputTokens: 50, totalTokens: 100 } },
			};

			// Checkpoint cycle
			const deserialized = checkpointCycle(state);

			// Verify results preserved
			const dim1Result = deserialized.globalResults.dim1;
			expect(dim1Result).toBeDefined();
			expect((dim1Result?.data as TestResultData)?.result).toBe("completed");
			expect(dim1Result?.metadata?.tokens?.totalTokens).toBe(100);
		});

		test("should handle multiple checkpoint cycles without data loss", async () => {
			const sections = [createMockSection("Test")];
			let state = createProcessState(sections);

			// Simulate 5 checkpoint cycles
			for (let i = 1; i <= 5; i++) {
				// Add result
				state.globalResults[`dim${i}`] = {
					data: { step: i },
				};

				// Checkpoint cycle
				state = checkpointCycle(state);

				// Verify all previous results still present
				for (let j = 1; j <= i; j++) {
					const result = state.globalResults[`dim${j}`];
					expect(result).toBeDefined();
					expect((result?.data as TestResultData)?.step).toBe(j);
				}
			}

			// Final verification
			expect(Object.keys(state.globalResults)).toHaveLength(5);
		});

		test("should maintain section results across checkpoints", async () => {
			const sections = Array.from({ length: 3 }, (_, i) =>
				createMockSection(`Section ${i}`),
			);
			let state = createProcessState(sections);

			// Add results for each section
			sections.forEach((_, idx) => {
				state.sectionResultsMap.set(idx, {
					dim1: {
						data: { content: `Result for section ${idx}` },
					},
				});
			});

			// Checkpoint cycle
			state = checkpointCycle(state);

			// Verify all section results preserved
			expect(state.sectionResultsMap.size).toBe(3);
			sections.forEach((_, idx) => {
				const data = getDimensionData<TestResultData>(
					state.sectionResultsMap,
					idx,
					"dim1",
				);
				expect(data?.content).toBe(`Result for section ${idx}`);
			});
		});
	});

	// ========================================================================
	// LARGE-SCALE CHECKPOINT TESTING
	// ========================================================================

	describe("Large-Scale Checkpoint Testing", () => {
		test(
			"should handle checkpointing with many sections",
			async () => {
				const sections = Array.from({ length: 50 }, (_, i) =>
					createMockSection(`Section ${i}`),
				);

				const engine = new DagEngine({ plugin, registry });
				const result = await engine.process(sections);

				// Verify all sections processed
				expect(result.sections).toHaveLength(50);

				result.sections.forEach((sectionResult, idx) => {
					expect(sectionResult.results.dim1).toBeDefined();
					expect(sectionResult.section.content).toBe(`Section ${idx}`);
				});
			},
			30000,
		);

		test("should serialize large state efficiently", async () => {
			const sections = Array.from({ length: 100 }, (_, i) =>
				createMockSection(`Section ${i}`),
			);

			const state = createProcessState(sections);

			// Add substantial data to each section
			sections.forEach((_, idx) => {
				state.sectionResultsMap.set(idx, {
					dim1: {
						data: {
							content: `Result for section ${idx}`,
							longText: "x".repeat(1000), // 1KB per section
						},
					},
				});
			});

			// Serialize
			const serialized = serializeState(state);
			const json = JSON.stringify(serialized);

			// Verify large state handling
			expect(json.length).toBeGreaterThan(100_000); // >100KB

			// Deserialize and verify integrity
			const deserialized = deserializeState(JSON.parse(json));

			expect(deserialized.sectionResultsMap.size).toBe(100);

			// Spot-check data integrity
			const section50Data = getDimensionData<TestResultData>(
				deserialized.sectionResultsMap,
				50,
				"dim1",
			);

			expect(section50Data?.content).toBe("Result for section 50");
			expect(section50Data?.longText).toBe("x".repeat(1000));
		});

		test("should handle deep object structures in results", async () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			// Create deeply nested result
			state.globalResults.deepDim = {
				data: {
					level1: {
						level2: {
							level3: {
								level4: {
									value: "deep value",
									array: [1, 2, 3, 4, 5],
								},
							},
						},
					},
				},
			};

			// Checkpoint cycle
			const deserialized = checkpointCycle(state);

			// Verify deep structure preserved
			const deepData = deserialized.globalResults.deepDim?.data as any;
			expect(deepData?.level1?.level2?.level3?.level4?.value).toBe("deep value");
			expect(deepData?.level1?.level2?.level3?.level4?.array).toEqual([
				1, 2, 3, 4, 5,
			]);
		});
	});

	// ========================================================================
	// REAL INNGEST WORKFLOW SIMULATION
	// ========================================================================

	describe("Real Inngest Workflow Simulation", () => {
		test("should simulate complete Inngest workflow with checkpoints", async () => {
			const sections = [createMockSection("Test")];

			// Step 1: Initialize (Inngest checkpoint)
			const state = createProcessState(sections);
			const checkpoint1 = JSON.stringify(serializeState(state));
			expect(checkpoint1).toBeDefined();

			// Step 2: Execute workflow
			const engine = new DagEngine({ plugin, registry });
			const result = await engine.process(sections);

			// Step 3: Create final checkpoint
			const finalCheckpoint = JSON.stringify({
				processId: state.id,
				result,
				timestamp: Date.now(),
			});

			expect(finalCheckpoint).toBeDefined();

			// Verify workflow completion
			const dimensions = ["dim1", "dim2", "dim3"];
			dimensions.forEach((dim) => {
				expect(result.sections[0]?.results[dim]).toBeDefined();
				expect(result.sections[0]?.results[dim]?.data).toBeDefined();
			});
		});

		test("should handle workflow interruption and resume", async () => {
			const sections = [createMockSection("Test")];

			// Initial execution - simulate interruption after dim1
			let state = createProcessState(sections);
			state.globalResults.dim1 = { data: { result: "completed" } };

			// Create checkpoint
			const checkpointJson = JSON.stringify(serializeState(state));

			// Resume from checkpoint
			const resumedState = deserializeState(JSON.parse(checkpointJson));

			// Verify state preserved
			expect(resumedState.id).toBe(state.id);
			expect(resumedState.globalResults.dim1).toBeDefined();
			expect((resumedState.globalResults.dim1?.data as TestResultData)?.result).toBe(
				"completed",
			);

			// Continue execution
			const engine = new DagEngine({ plugin, registry });
			const result = await engine.process(sections);

			// Verify completion
			expect(result.sections[0]?.results.dim1).toBeDefined();
			expect(result.sections[0]?.results.dim2).toBeDefined();
			expect(result.sections[0]?.results.dim3).toBeDefined();
		});
	});
});