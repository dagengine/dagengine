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
// TEST TYPES
// ============================================================================

/**
 * Test data shape - flexible interface for test assertions
 */
interface TestData {
	value?: string | number;
	result?: string;
	nested?: {
		array?: number[];
		object?: { key: string };
		null?: null;
		boolean?: boolean;
		number?: number;
	};
	level1?: {
		level2?: {
			level3?: {
				level4?: {
					level5?: { value: string };
				};
			};
		};
	};
	unicode?: string;
	escaped?: string;
	quotes?: string;
	[key: string]: unknown;
}

/**
 * Helper to safely get data from dimension result
 */
function getData(state: ProcessState, dimension: string): TestData | undefined {
	return state.globalResults[dimension]?.data as TestData | undefined;
}

/**
 * Helper to safely get data from section dimension result
 */
function getSectionData(
	state: ProcessState,
	sectionIndex: number,
	dimension: string,
): TestData | undefined {
	return state.sectionResultsMap.get(sectionIndex)?.[dimension]?.data as
		| TestData
		| undefined;
}

// ============================================================================
// TESTS
// ============================================================================

describe("Checkpoint Serialization - Unit Tests", () => {
	describe("Basic Serialization", () => {
		test("should serialize empty state", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			const serialized = serializeState(state);

			expect(serialized.id).toBeDefined();
			expect(serialized.startTime).toBeDefined();
			expect(serialized.sections).toHaveLength(1);
			expect(serialized.globalResults).toEqual({});
			expect(Array.isArray(serialized.sectionResultsMap)).toBe(true);
		});

		test("should serialize state with global results", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			state.globalResults["dim1"] = {
				data: { value: "result1" },
				metadata: { totalTokens: 100 },
			};
			state.globalResults["dim2"] = {
				data: { value: "result2" },
			};

			const serialized = serializeState(state);

			expect(serialized.globalResults).toEqual({
				dim1: {
					data: { value: "result1" },
					metadata: { totalTokens: 100 },
				},
				dim2: {
					data: { value: "result2" },
				},
			});
		});

		test("should serialize state with section results", () => {
			const sections = [
				createMockSection("Section 1"),
				createMockSection("Section 2"),
			];
			const state = createProcessState(sections);

			state.sectionResultsMap.set(0, {
				dim1: { data: { value: "section0-dim1" } },
			});
			state.sectionResultsMap.set(1, {
				dim1: { data: { value: "section1-dim1" } },
			});

			const serialized = serializeState(state);

			expect(serialized.sectionResultsMap).toHaveLength(2);
			expect(serialized.sectionResultsMap[0]).toEqual([
				0,
				{ dim1: { data: { value: "section0-dim1" } } },
			]);
			expect(serialized.sectionResultsMap[1]).toEqual([
				1,
				{ dim1: { data: { value: "section1-dim1" } } },
			]);
		});

		test("should serialize complex nested data structures", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			state.globalResults["complex"] = {
				data: {
					nested: {
						array: [1, 2, 3],
						object: { key: "value" },
						null: null,
						boolean: true,
						number: 42.5,
					},
				},
				metadata: {
					totalTokens: 1000,
					cost: 0.05,
					model: "gpt-4",
				},
			};

			const serialized = serializeState(state);

			expect(serialized.globalResults["complex"]).toEqual({
				data: {
					nested: {
						array: [1, 2, 3],
						object: { key: "value" },
						null: null,
						boolean: true,
						number: 42.5,
					},
				},
				metadata: {
					totalTokens: 1000,
					cost: 0.05,
					model: "gpt-4",
				},
			});
		});

		test("should serialize state with metadata", () => {
			const sections = [createMockSection("Test")];
			const metadata = {
				userId: "user-123",
				requestId: "req-456",
				timestamp: Date.now(),
				config: { parallel: true },
			};

			const state = createProcessState(sections, metadata);

			const serialized = serializeState(state);

			expect(serialized.metadata).toEqual(metadata);
		});

		test("should serialize state with errors", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			state.globalResults["failed"] = {
				error: "Dimension failed",
				metadata: { attempts: 3 },
			};

			const serialized = serializeState(state);

			expect(serialized.globalResults["failed"]).toEqual({
				error: "Dimension failed",
				metadata: { attempts: 3 },
			});
		});
	});

	describe("Deserialization", () => {
		test("should deserialize empty state", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			const serialized = serializeState(state);
			const deserialized = deserializeState(serialized);

			expect(deserialized.id).toBe(state.id);
			expect(deserialized.startTime).toBe(state.startTime);
			expect(deserialized.sections).toEqual(state.sections);
			expect(deserialized.globalResults).toEqual({});
			expect(deserialized.sectionResultsMap instanceof Map).toBe(true);
		});

		test("should deserialize state with results", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			state.globalResults["dim1"] = { data: { value: "test" } };
			state.sectionResultsMap.set(0, { dim2: { data: { value: "test2" } } });

			const serialized = serializeState(state);
			const deserialized = deserializeState(serialized);

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
			deserialized.sectionResultsMap.set(1, { dim2: { data: "value2" } });
			expect(deserialized.sectionResultsMap.size).toBe(2);
		});
	});

	describe("Round-Trip Consistency", () => {
		test("should maintain data integrity through round-trip", () => {
			const sections = [
				createMockSection("Section 1"),
				createMockSection("Section 2"),
			];
			const metadata = { userId: "test-user", timestamp: Date.now() };
			const state = createProcessState(sections, metadata);

			state.globalResults["dim1"] = { data: { result: "global1" } };
			state.globalResults["dim2"] = { data: { result: "global2" } };
			state.sectionResultsMap.set(0, { dim3: { data: { result: "s0" } } });
			state.sectionResultsMap.set(1, { dim3: { data: { result: "s1" } } });

			const serialized = serializeState(state);
			const deserialized = deserializeState(serialized);

			expect(deserialized.id).toBe(state.id);
			expect(deserialized.startTime).toBe(state.startTime);
			expect(deserialized.metadata).toEqual(metadata);
			expect(deserialized.sections).toEqual(sections);
			expect(deserialized.globalResults).toEqual(state.globalResults);
			expect(deserialized.sectionResultsMap.get(0)).toEqual(
				state.sectionResultsMap.get(0),
			);
			expect(deserialized.sectionResultsMap.get(1)).toEqual(
				state.sectionResultsMap.get(1),
			);
		});

		test("should handle multiple round-trips", () => {
			const sections = [createMockSection("Test")];
			let state = createProcessState(sections);

			state.globalResults["dim1"] = { data: { value: 1 } };

			// First round-trip
			state = deserializeState(serializeState(state));
			expect(getData(state, "dim1")?.value).toBe(1);

			// Second round-trip
			state.globalResults["dim2"] = { data: { value: 2 } };
			state = deserializeState(serializeState(state));
			expect(getData(state, "dim2")?.value).toBe(2);

			// Third round-trip
			state.globalResults["dim3"] = { data: { value: 3 } };
			state = deserializeState(serializeState(state));
			expect(getData(state, "dim3")?.value).toBe(3);

			// All results preserved
			expect(Object.keys(state.globalResults)).toHaveLength(3);
		});
	});

	describe("JSON Compatibility", () => {
		test("should survive JSON.stringify and JSON.parse", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections, { meta: "data" });

			state.globalResults["test"] = { data: { value: 42 } };
			state.sectionResultsMap.set(0, { dim: { data: "result" } });

			const serialized = serializeState(state);
			const json = JSON.stringify(serialized);
			const parsed = JSON.parse(json) as SerializedProcessState;
			const restored = deserializeState(parsed);

			expect(restored.id).toBe(state.id);
			expect(restored.metadata).toEqual({ meta: "data" });
			expect(getData(restored, "test")?.value).toBe(42);
			expect(getSectionData(restored, 0, "dim")).toBe("result");
		});

		test("should handle large state through JSON", () => {
			const sections = Array.from({ length: 50 }, (_, i) =>
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
			const json = JSON.stringify(serialized);
			const parsed = JSON.parse(json) as SerializedProcessState;
			const restored = deserializeState(parsed);

			expect(restored.sectionResultsMap.size).toBe(50);
			expect(getSectionData(restored, 25, "dim1")?.value).toBe("result-25");
		});
	});

	describe("Edge Cases", () => {
		test("should handle empty sectionResultsMap", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			const serialized = serializeState(state);
			const deserialized = deserializeState(serialized);

			expect(deserialized.sectionResultsMap.get(0)).toEqual({});
		});

		test("should handle missing optional fields", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);
			// No metadata

			const serialized = serializeState(state);
			const deserialized = deserializeState(serialized);

			expect(deserialized.metadata).toBeUndefined();
		});

		test("should handle special characters in data", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			state.globalResults["special"] = {
				data: {
					unicode: "你好 🎉 مرحبا",
					escaped: "Line1\nLine2\tTab",
					quotes: 'He said "hello"',
				},
			};

			const serialized = serializeState(state);
			const json = JSON.stringify(serialized);
			const parsed = JSON.parse(json) as SerializedProcessState;
			const restored = deserializeState(parsed);

			const specialData = getData(restored, "special");
			expect(specialData?.unicode).toBe("你好 🎉 مرحبا");
			expect(specialData?.escaped).toBe("Line1\nLine2\tTab");
			expect(specialData?.quotes).toBe('He said "hello"');
		});

		test("should handle very deep nesting", () => {
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			state.globalResults["deep"] = {
				data: {
					level1: {
						level2: {
							level3: {
								level4: {
									level5: { value: "deep" },
								},
							},
						},
					},
				},
			};

			const serialized = serializeState(state);
			const deserialized = deserializeState(serialized);

			const deepData = getData(deserialized, "deep");
			expect(deepData?.level1?.level2?.level3?.level4?.level5?.value).toBe(
				"deep",
			);
		});
	});
});