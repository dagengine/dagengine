import { describe, test, expect } from "vitest";
import {
	createProcessState,
	serializeState,
	deserializeState,
	type SerializedProcessState,
} from "../../src/core/engine/state-manager";
import { createMockSection } from "../setup";
import type { ProcessState } from "../../src/core/shared/types";

// ============================================================================
// TEST TYPES & HELPERS
// ============================================================================

interface TestResultData {
	result?: string;
	step?: number;
	value?: number;
	timestamp?: number;
	[key: string]: unknown;
}

/**
 * Type-safe helper to get dimension data
 */
function getDimensionData(
	state: ProcessState,
	dimension: string,
): TestResultData | undefined {
	return state.globalResults[dimension]?.data as TestResultData | undefined;
}

/**
 * Type-safe helper to get section dimension data
 */
function getSectionDimensionData(
	state: ProcessState,
	sectionIndex: number,
	dimension: string,
): TestResultData | undefined {
	return state.sectionResultsMap.get(sectionIndex)?.[dimension]?.data as
		| TestResultData
		| undefined;
}

// ============================================================================
// TESTS
// ============================================================================

describe("Checkpoint Recovery - Simulation Tests", () => {
	describe("Partial Completion", () => {
		test("should resume from checkpoint with partial results", () => {
			const sections = [createMockSection("Test")];

			// Simulate checkpoint after completing dim1 and dim2
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

			const s1Data = getSectionDimensionData(resumed, 0, "section1");
			const s2Data = getSectionDimensionData(resumed, 1, "section1");
			expect(s1Data?.result).toBe("s1 result");
			expect(s2Data?.result).toBe("s2 result");
		});
	});

	describe("Multi-Step Checkpointing", () => {
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
			expect(getDimensionData(state, "dim1")?.step).toBe(1);
			expect(getDimensionData(state, "dim2")?.step).toBe(2);
			expect(getDimensionData(state, "dim3")?.step).toBe(3);
		});

		test("should accumulate results across checkpoints", () => {
			const sections = [createMockSection("Test")];
			let state = createProcessState(sections);

			const checkpoints: SerializedProcessState[] = [];

			// Simulate 10 checkpoints
			for (let i = 1; i <= 10; i++) {
				state.globalResults[`dim${i}`] = {
					data: { value: i, timestamp: Date.now() },
				};

				// Checkpoint
				const checkpoint = serializeState(state);
				checkpoints.push(checkpoint);

				// Resume
				state = deserializeState(checkpoint);
			}

			// Final state should have all 10 dimensions
			expect(Object.keys(state.globalResults)).toHaveLength(10);

			// All values preserved
			for (let i = 1; i <= 10; i++) {
				const data = getDimensionData(state, `dim${i}`);
				expect(data?.value).toBe(i);
				expect(data?.timestamp).toBeDefined();
			}
		});
	});

	describe("Crash and Resume Scenarios", () => {
		test("should simulate crash and resume", () => {
			const sections = [createMockSection("Test")];
			let state: ProcessState | null = createProcessState(sections);

			// Complete some dimensions
			state.globalResults["dim1"] = { data: { result: "done" } };
			state.globalResults["dim2"] = { data: { result: "done" } };

			// Checkpoint before crash
			const checkpoint = serializeState(state);

			// CRASH HAPPENS HERE
			// ... (state lost, variables cleared, process restarted)
			state = null;

			// Resume from checkpoint (new process, fresh memory)
			const resumedState = deserializeState(checkpoint);

			// Verify we didn't lose progress
			expect(resumedState.globalResults["dim1"]).toBeDefined();
			expect(resumedState.globalResults["dim2"]).toBeDefined();
			expect(getDimensionData(resumedState, "dim1")?.result).toBe("done");

			// Continue processing
			resumedState.globalResults["dim3"] = { data: { result: "done" } };

			expect(Object.keys(resumedState.globalResults)).toHaveLength(3);
		});

		test("should handle crash at different stages", () => {
			const sections = [createMockSection("Test")];

			// Test crash at each stage
			const stages = [
				{ completed: [], expected: 0 },
				{ completed: ["dim1"], expected: 1 },
				{ completed: ["dim1", "dim2"], expected: 2 },
				{ completed: ["dim1", "dim2", "dim3"], expected: 3 },
			];

			stages.forEach(({ completed, expected }) => {
				let state: ProcessState | null = createProcessState(sections);

				// Complete dimensions
				completed.forEach((dim) => {
					state!.globalResults[dim] = { data: { result: "done" } };
				});

				// Checkpoint
				const checkpoint = serializeState(state);

				// Crash
				state = null;

				// Resume
				const resumed = deserializeState(checkpoint);

				expect(Object.keys(resumed.globalResults)).toHaveLength(expected);
				completed.forEach((dim) => {
					expect(resumed.globalResults[dim]).toBeDefined();
					expect(getDimensionData(resumed, dim)?.result).toBe("done");
				});
			});
		});

		test("should handle crash during section processing", () => {
			const sections = [
				createMockSection("Section 1"),
				createMockSection("Section 2"),
				createMockSection("Section 3"),
			];

			let state: ProcessState | null = createProcessState(sections);

			// Process first 2 sections
			state.sectionResultsMap.set(0, {
				dim1: { data: { result: "section0-done" } },
			});
			state.sectionResultsMap.set(1, {
				dim1: { data: { result: "section1-done" } },
			});

			// Checkpoint
			const checkpoint = serializeState(state);

			// Crash before processing section 3
			state = null;

			// Resume
			const resumed = deserializeState(checkpoint);

			// Verify sections 0 and 1 are complete
			expect(resumed.sectionResultsMap.get(0)?.dim1).toBeDefined();
			expect(resumed.sectionResultsMap.get(1)?.dim1).toBeDefined();
			expect(getSectionDimensionData(resumed, 0, "dim1")?.result).toBe(
				"section0-done",
			);
			expect(getSectionDimensionData(resumed, 1, "dim1")?.result).toBe(
				"section1-done",
			);

			// Section 2 should be empty (not processed yet)
			expect(resumed.sectionResultsMap.get(2)).toEqual({});

			// Continue with section 2
			resumed.sectionResultsMap.set(2, {
				dim1: { data: { result: "section2-done" } },
			});

			expect(resumed.sectionResultsMap.get(2)?.dim1).toBeDefined();
			expect(getSectionDimensionData(resumed, 2, "dim1")?.result).toBe(
				"section2-done",
			);
		});
	});

	describe("Error Handling in Checkpoints", () => {
		test("should preserve errors in checkpoints", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			// Some dimensions succeed, some fail
			state.globalResults["dim1"] = {
				data: { result: "success" },
			};
			state.globalResults["dim2"] = {
				error: "Dimension failed",
				metadata: { attempts: 3 },
			};
			state.globalResults["dim3"] = {
				data: { result: "success" },
			};

			// Checkpoint
			const checkpoint = serializeState(state);

			// Resume
			const resumed = deserializeState(checkpoint);

			// Verify errors preserved
			expect(resumed.globalResults["dim1"]?.data).toBeDefined();
			expect(resumed.globalResults["dim2"]?.error).toBe("Dimension failed");
			expect(resumed.globalResults["dim2"]?.metadata?.attempts).toBe(3);
			expect(resumed.globalResults["dim3"]?.data).toBeDefined();

			expect(getDimensionData(resumed, "dim1")?.result).toBe("success");
			expect(getDimensionData(resumed, "dim3")?.result).toBe("success");
		});

		test("should handle partial failures across checkpoints", () => {
			const sections = [createMockSection("Test")];
			let state = createProcessState(sections);

			// Checkpoint 1: dim1 succeeds
			state.globalResults["dim1"] = { data: { result: "ok" } };
			state = deserializeState(serializeState(state));

			// Checkpoint 2: dim2 fails
			state.globalResults["dim2"] = { error: "failed" };
			state = deserializeState(serializeState(state));

			// Checkpoint 3: dim3 succeeds despite dim2 failure
			state.globalResults["dim3"] = { data: { result: "ok" } };
			state = deserializeState(serializeState(state));

			// Final state has mix of success and failure
			expect(getDimensionData(state, "dim1")?.result).toBe("ok");
			expect(state.globalResults["dim2"]?.error).toBe("failed");
			expect(getDimensionData(state, "dim3")?.result).toBe("ok");
		});
	});

	describe("Large-Scale Checkpointing", () => {
		test("should handle checkpointing with many sections", () => {
			const sections = Array.from({ length: 100 }, (_, i) =>
				createMockSection(`Section ${i}`),
			);

			let state: ProcessState | null = createProcessState(sections);

			// Process half the sections
			for (let i = 0; i < 50; i++) {
				state.sectionResultsMap.set(i, {
					dim1: { data: { result: `s${i}-done` } },
				});
			}

			// Checkpoint
			const checkpoint = serializeState(state);

			// Crash
			state = null;

			// Resume
			const resumed = deserializeState(checkpoint);

			// Verify first 50 are complete
			for (let i = 0; i < 50; i++) {
				expect(resumed.sectionResultsMap.get(i)?.dim1).toBeDefined();
				expect(getSectionDimensionData(resumed, i, "dim1")?.result).toBe(
					`s${i}-done`,
				);
			}

			// Verify last 50 are empty
			for (let i = 50; i < 100; i++) {
				expect(resumed.sectionResultsMap.get(i)).toEqual({});
			}

			// Continue processing remaining sections
			for (let i = 50; i < 100; i++) {
				resumed.sectionResultsMap.set(i, {
					dim1: { data: { result: `s${i}-done` } },
				});
			}

			// All sections now complete
			expect(resumed.sectionResultsMap.size).toBe(100);

			// Spot check
			for (let i = 0; i < 100; i++) {
				expect(getSectionDimensionData(resumed, i, "dim1")?.result).toBe(
					`s${i}-done`,
				);
			}
		});

		test("should handle checkpointing with many dimensions", () => {
			const sections = [createMockSection("Test")];
			let state = createProcessState(sections);

			// Add 50 dimensions
			for (let i = 0; i < 50; i++) {
				state.globalResults[`dim${i}`] = {
					data: { value: i },
				};

				// Checkpoint every 10 dimensions
				if ((i + 1) % 10 === 0) {
					state = deserializeState(serializeState(state));
				}
			}

			// Verify all 50 dimensions preserved
			expect(Object.keys(state.globalResults)).toHaveLength(50);
			for (let i = 0; i < 50; i++) {
				expect(getDimensionData(state, `dim${i}`)?.value).toBe(i);
			}
		});
	});
});