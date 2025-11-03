import { describe, test, expect, beforeEach, vi } from "vitest";
import { ProviderRegistry } from "../src/providers/registry";
import { MockAIProvider, createMockSection } from "./setup";
import {
	serializeState,
	deserializeState,
	createProcessState,
} from "../src/core/engine/state-manager";
import type { ProcessState } from "../src/core/shared/types";

// ============================================================================
// TEST TYPES & HELPERS
// ============================================================================

/**
 * Test metadata shape
 */
interface TestMetadata {
	custom?: string;
	userId?: string;
	requestId?: string;
	timestamp?: number | string;
	nested?: {
		config?: { key: string };
		deep?: { value: number };
	};
	[key: string]: unknown;
}

/**
 * Test dimension data shape
 */
interface TestData {
	result?: string;
	value?: string | number;
	step?: number;
	[key: string]: unknown;
}

/**
 * Helper to safely get dimension data
 */
function getDimensionData(
	state: ProcessState,
	dimension: string,
): TestData | undefined {
	return state.globalResults[dimension]?.data as TestData | undefined;
}

/**
 * Helper to safely get section dimension data
 */
function getSectionDimensionData(
	state: ProcessState,
	sectionIndex: number,
	dimension: string,
): TestData | undefined {
	return state.sectionResultsMap.get(sectionIndex)?.[dimension]?.data as
		| TestData
		| undefined;
}

/**
 * Helper to get typed metadata
 */
function getMetadata(state: ProcessState): TestMetadata | undefined {
	return state.metadata as TestMetadata | undefined;
}

// ============================================================================
// TESTS
// ============================================================================

describe("Inngest Orchestration - Checkpoint Logic", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("test", { result: "ok" });
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	// ============================================================================
	// STATE SERIALIZATION TESTS
	// ============================================================================

	describe("State Serialization", () => {
		test("should serialize process state correctly", () => {
			const sections = [
				createMockSection("Section 1"),
				createMockSection("Section 2"),
			];

			const state = createProcessState(sections, { custom: "metadata" });

			// Add some results
			state.globalResults["dim1"] = { data: { result: "global1" } };
			state.sectionResultsMap.set(0, {
				dim2: { data: { result: "section0" } },
			});
			state.sectionResultsMap.set(1, {
				dim2: { data: { result: "section1" } },
			});

			const serialized = serializeState(state);

			// Check serialized structure
			expect(serialized.id).toBe(state.id);
			expect(serialized.startTime).toBe(state.startTime);
			expect(serialized.metadata).toEqual({ custom: "metadata" });
			expect(serialized.sections).toHaveLength(2);
			expect(serialized.globalResults).toEqual({
				dim1: { data: { result: "global1" } },
			});

			// Check Map is converted to Array
			expect(Array.isArray(serialized.sectionResultsMap)).toBe(true);
			expect(serialized.sectionResultsMap).toHaveLength(2);
			expect(serialized.sectionResultsMap[0]).toEqual([
				0,
				{ dim2: { data: { result: "section0" } } },
			]);
			expect(serialized.sectionResultsMap[1]).toEqual([
				1,
				{ dim2: { data: { result: "section1" } } },
			]);
		});

		test("should handle empty sectionResultsMap", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			const serialized = serializeState(state);

			expect(serialized.sectionResultsMap).toHaveLength(1);
			expect(serialized.sectionResultsMap[0]).toEqual([0, {}]);
		});

		test("should serialize complex dimension results", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			// Complex nested data
			state.globalResults["complex"] = {
				data: {
					nested: {
						array: [1, 2, 3],
						object: { key: "value" },
					},
				},
				metadata: {
					totalTokens: 1000,
					cost: 0.05,
				},
			};

			const serialized = serializeState(state);

			expect(serialized.globalResults["complex"]).toEqual({
				data: {
					nested: {
						array: [1, 2, 3],
						object: { key: "value" },
					},
				},
				metadata: {
					totalTokens: 1000,
					cost: 0.05,
				},
			});
		});
	});

	// ============================================================================
	// STATE DESERIALIZATION TESTS
	// ============================================================================

	describe("State Deserialization", () => {
		test("should deserialize process state correctly", () => {
			const sections = [
				createMockSection("Section 1"),
				createMockSection("Section 2"),
			];

			const originalState = createProcessState(sections, {
				custom: "metadata",
			});
			originalState.globalResults["dim1"] = { data: { result: "global1" } };
			originalState.sectionResultsMap.set(0, {
				dim2: { data: { result: "section0" } },
			});

			const serialized = serializeState(originalState);
			const deserialized = deserializeState(serialized);

			// Check all properties are restored
			expect(deserialized.id).toBe(originalState.id);
			expect(deserialized.startTime).toBe(originalState.startTime);
			expect(deserialized.metadata).toEqual({ custom: "metadata" });
			expect(deserialized.sections).toHaveLength(2);
			expect(deserialized.globalResults).toEqual({
				dim1: { data: { result: "global1" } },
			});

			// Check Map is restored
			expect(deserialized.sectionResultsMap instanceof Map).toBe(true);
			expect(deserialized.sectionResultsMap.size).toBe(2);
			expect(deserialized.sectionResultsMap.get(0)).toEqual({
				dim2: { data: { result: "section0" } },
			});
		});

		test("should handle round-trip serialization", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			state.globalResults["test"] = { data: { value: 42 } };
			state.sectionResultsMap.set(0, {
				test: { data: { value: 100 } },
			});

			// Round trip: serialize -> deserialize
			const serialized = serializeState(state);
			const deserialized = deserializeState(serialized);

			// Should be identical
			expect(deserialized.id).toBe(state.id);
			expect(deserialized.globalResults).toEqual(state.globalResults);
			expect(deserialized.sectionResultsMap.get(0)).toEqual(
				state.sectionResultsMap.get(0),
			);
		});

		test("should preserve Map operations after deserialization", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			state.sectionResultsMap.set(0, { dim1: { data: "value1" } });

			const serialized = serializeState(state);
			const deserialized = deserializeState(serialized);

			// Should be able to use Map methods
			expect(deserialized.sectionResultsMap.has(0)).toBe(true);
			expect(deserialized.sectionResultsMap.get(0)).toEqual({
				dim1: { data: "value1" },
			});

			// Should be able to modify
			deserialized.sectionResultsMap.set(0, { dim2: { data: "value2" } });
			expect(deserialized.sectionResultsMap.get(0)).toEqual({
				dim2: { data: "value2" },
			});
		});
	});

	// ============================================================================
	// CHECKPOINT RECOVERY SIMULATION
	// ============================================================================

	describe("Checkpoint Recovery Simulation", () => {
		test("should resume from checkpoint with partial results", () => {
			const sections = [createMockSection("Test")];

			// Simulate checkpoint at step 2 (after dim1 and dim2 completed)
			const checkpointState = createProcessState(sections);
			checkpointState.globalResults["dim1"] = {
				data: { result: "completed at step 1" },
			};
			checkpointState.globalResults["dim2"] = {
				data: { result: "completed at step 2" },
			};

			// Serialize (simulate Inngest checkpoint)
			const serialized = serializeState(checkpointState);

			// Deserialize (simulate resume from checkpoint)
			const resumedState = deserializeState(serialized);

			// Verify we have the previous results
			expect(resumedState.globalResults["dim1"]).toBeDefined();
			expect(resumedState.globalResults["dim2"]).toBeDefined();

			const dim1Data = getDimensionData(resumedState, "dim1");
			expect(dim1Data?.result).toBe("completed at step 1");

			// Can continue adding new results
			resumedState.globalResults["dim3"] = {
				data: { result: "completed after resume" },
			};

			expect(Object.keys(resumedState.globalResults)).toHaveLength(3);
		});

		test("should handle checkpoint with mixed global and section results", () => {
			const sections = [
				createMockSection("Section 1"),
				createMockSection("Section 2"),
			];

			const checkpointState = createProcessState(sections);

			// Global results
			checkpointState.globalResults["global1"] = {
				data: { result: "global result" },
			};

			// Section results
			checkpointState.sectionResultsMap.set(0, {
				section1: { data: { result: "s1 result" } },
			});
			checkpointState.sectionResultsMap.set(1, {
				section1: { data: { result: "s2 result" } },
			});

			// Round trip
			const serialized = serializeState(checkpointState);
			const resumed = deserializeState(serialized);

			// Verify all results preserved
			expect(resumed.globalResults["global1"]).toBeDefined();
			expect(resumed.sectionResultsMap.get(0)?.section1).toBeDefined();
			expect(resumed.sectionResultsMap.get(1)?.section1).toBeDefined();
		});

		test("should handle multiple checkpoint cycles", () => {
			const sections = [createMockSection("Test")];
			let state = createProcessState(sections);

			// Checkpoint 1: After dim1
			state.globalResults["dim1"] = { data: { step: 1 } };
			state = deserializeState(serializeState(state));
			expect(getDimensionData(state, "dim1")?.step).toBe(1);

			// Checkpoint 2: After dim2
			state.globalResults["dim2"] = { data: { step: 2 } };
			state = deserializeState(serializeState(state));
			expect(getDimensionData(state, "dim2")?.step).toBe(2);

			// Checkpoint 3: After dim3
			state.globalResults["dim3"] = { data: { step: 3 } };
			state = deserializeState(serializeState(state));
			expect(getDimensionData(state, "dim3")?.step).toBe(3);

			// All results should be preserved
			expect(Object.keys(state.globalResults)).toHaveLength(3);
		});
	});

	// ============================================================================
	// EDGE CASES
	// ============================================================================

	describe("Edge Cases", () => {
		test("should handle state with no results", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			const serialized = serializeState(state);
			const deserialized = deserializeState(serialized);

			expect(deserialized.globalResults).toEqual({});
			expect(deserialized.sectionResultsMap.size).toBe(1);
			expect(deserialized.sectionResultsMap.get(0)).toEqual({});
		});

		test("should handle state with errors in results", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			state.globalResults["failed"] = {
				error: "Something went wrong",
			};

			const serialized = serializeState(state);
			const deserialized = deserializeState(serialized);

			expect(deserialized.globalResults["failed"]?.error).toBe(
				"Something went wrong",
			);
		});

		test("should handle very large state", () => {
			// Create many sections
			const sections = Array.from({ length: 100 }, (_, i) =>
				createMockSection(`Section ${i}`),
			);

			const state = createProcessState(sections);

			// Add results to all sections
			sections.forEach((_, idx) => {
				state.sectionResultsMap.set(idx, {
					dim1: { data: { value: `result-${idx}` } },
				});
			});

			const serialized = serializeState(state);
			const deserialized = deserializeState(serialized);

			expect(deserialized.sectionResultsMap.size).toBe(100);

			const section50Data = getSectionDimensionData(deserialized, 50, "dim1");
			expect(section50Data?.value).toBe("result-50");
		});

		test("should preserve metadata through checkpoints", () => {
			const sections = [createMockSection("Test")];
			const metadata: TestMetadata = {
				userId: "user-123",
				requestId: "req-456",
				timestamp: Date.now(),
				nested: {
					config: { key: "value" },
				},
			};

			const state = createProcessState(sections, metadata);

			const serialized = serializeState(state);
			const deserialized = deserializeState(serialized);

			expect(deserialized.metadata).toEqual(metadata);

			const deserializedMetadata = getMetadata(deserialized);
			expect(deserializedMetadata?.nested?.config?.key).toBe("value");
		});

		test("should handle sections with complex metadata", () => {
			const sections = [
				{
					content: "Test",
					metadata: {
						id: "section-1",
						tags: ["tag1", "tag2"],
						nested: {
							deep: {
								value: 42,
							},
						},
					},
				},
			];

			const state = createProcessState(sections);

			const serialized = serializeState(state);
			const deserialized = deserializeState(serialized);

			const sectionMetadata = deserialized.sections[0]?.metadata as {
				tags?: string[];
				nested?: { deep: { value: number } };
			};

			expect(sectionMetadata?.tags).toEqual(["tag1", "tag2"]);
			expect(sectionMetadata?.nested?.deep.value).toBe(42);
		});
	});

	// ============================================================================
	// INTEGRATION WITH INNGEST ORCHESTRATOR (Mock)
	// ============================================================================

	describe("Inngest Integration (Mocked)", () => {
		test("should simulate Inngest step checkpointing", async () => {
			// This simulates what Inngest does internally
			const sections = [createMockSection("Test")];
			let state = createProcessState(sections);

			// Step 1: Initialize (Inngest checkpoint)
			const step1Checkpoint = serializeState(state);
			state = deserializeState(step1Checkpoint);
			expect(state.sections).toHaveLength(1);

			// Step 2: Process dim1 (Inngest checkpoint)
			state.globalResults["dim1"] = { data: { result: "dim1 done" } };
			const step2Checkpoint = serializeState(state);
			state = deserializeState(step2Checkpoint);
			expect(state.globalResults["dim1"]).toBeDefined();

			// Step 3: Process dim2 (Inngest checkpoint)
			state.globalResults["dim2"] = { data: { result: "dim2 done" } };
			const step3Checkpoint = serializeState(state);
			state = deserializeState(step3Checkpoint);
			expect(state.globalResults["dim2"]).toBeDefined();

			// Final state has all results
			expect(Object.keys(state.globalResults)).toHaveLength(2);
		});

		test("should handle crash and resume scenario", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			// Complete some dimensions
			state.globalResults["dim1"] = { data: { result: "done" } };
			state.globalResults["dim2"] = { data: { result: "done" } };

			// Checkpoint before crash
			const checkpoint = serializeState(state);

			// CRASH HAPPENS HERE
			// ... (state lost)

			// Resume from checkpoint
			const resumedState = deserializeState(checkpoint);

			// Verify we didn't lose progress
			expect(resumedState.globalResults["dim1"]).toBeDefined();
			expect(resumedState.globalResults["dim2"]).toBeDefined();

			// Continue processing
			resumedState.globalResults["dim3"] = { data: { result: "done" } };

			expect(Object.keys(resumedState.globalResults)).toHaveLength(3);
		});
	});

	// ============================================================================
	// JSON COMPATIBILITY
	// ============================================================================

	describe("JSON Compatibility", () => {
		test("should survive JSON.stringify and JSON.parse", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections, { meta: "data" });

			state.globalResults["test"] = { data: { value: 42 } };
			state.sectionResultsMap.set(0, { dim: { data: "result" } });

			// Serialize
			const serialized = serializeState(state);

			// Simulate Inngest storing as JSON
			const json = JSON.stringify(serialized);
			const parsed = JSON.parse(json);

			// Deserialize
			const restored = deserializeState(parsed);

			// Check everything survived
			expect(restored.id).toBe(state.id);
			expect(restored.metadata).toEqual({ meta: "data" });

			const testData = getDimensionData(restored, "test");
			expect(testData?.value).toBe(42);

			const sectionData = getSectionDimensionData(restored, 0, "dim");
			expect(sectionData).toBe("result");
		});

		test("should handle Date objects in metadata", () => {
			const sections = [createMockSection("Test")];
			const now = new Date();
			const state = createProcessState(sections, { timestamp: now });

			const serialized = serializeState(state);
			const json = JSON.stringify(serialized);
			const parsed = JSON.parse(json);
			const restored = deserializeState(parsed);

			const metadata = getMetadata(restored);
			// Date becomes string after JSON round-trip
			expect(metadata?.timestamp).toBe(now.toISOString());
		});
	});
});