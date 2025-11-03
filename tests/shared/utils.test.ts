import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
	hasFailedDependencies,
	getFailedDependencies,
	countSuccessful,
	countFailed,
	resetSectionResultsMap,
	applyFinalizedResults,
	createTimeoutPromise,
	executeWithTimeout,
} from "../../src/core/shared/utils.js";
import { DimensionTimeoutError } from "../../src/core/shared/errors.js";
import type {
	DimensionDependencies,
	DimensionResult,
	SectionData,
} from "../../src/types.js";

// ============================================================================
// DEPENDENCY UTILITIES TESTS
// ============================================================================

describe("Utils - Dependency Utilities", () => {
	test("hasFailedDependencies should return false for empty dependencies", () => {
		const deps: DimensionDependencies = {};
		expect(hasFailedDependencies(deps)).toBe(false);
	});

	test("hasFailedDependencies should return false when all deps successful", () => {
		const deps: DimensionDependencies = {
			dep1: { data: "value1" },
			dep2: { data: "value2" },
		};
		expect(hasFailedDependencies(deps)).toBe(false);
	});

	test("hasFailedDependencies should return true when any dep has error", () => {
		const deps: DimensionDependencies = {
			dep1: { data: "value1" },
			dep2: { error: "Failed" },
		};
		expect(hasFailedDependencies(deps)).toBe(true);
	});

	test("hasFailedDependencies should return true when all deps have errors", () => {
		const deps: DimensionDependencies = {
			dep1: { error: "Error 1" },
			dep2: { error: "Error 2" },
		};
		expect(hasFailedDependencies(deps)).toBe(true);
	});

	test("getFailedDependencies should return empty array for no failures", () => {
		const deps: DimensionDependencies = {
			dep1: { data: "value1" },
			dep2: { data: "value2" },
		};
		expect(getFailedDependencies(deps)).toEqual([]);
	});

	test("getFailedDependencies should return names of failed dependencies", () => {
		const deps: DimensionDependencies = {
			dep1: { data: "value1" },
			dep2: { error: "Failed" },
			dep3: { error: "Also failed" },
		};
		const failed = getFailedDependencies(deps);
		expect(failed).toContain("dep2");
		expect(failed).toContain("dep3");
		expect(failed).toHaveLength(2);
	});
});

// ============================================================================
// RESULT UTILITIES TESTS
// ============================================================================

describe("Utils - Result Utilities", () => {
	test("countSuccessful should count zero when all failed", () => {
		const globalResults: Record<string, DimensionResult> = {
			dim1: { error: "Failed" },
		};
		const sectionResults: Array<{
			section: SectionData;
			results: Record<string, DimensionResult>;
		}> = [
			{
				section: { content: "test", metadata: {} },
				results: { dim2: { error: "Failed" } },
			},
		];

		const count = countSuccessful(globalResults, sectionResults);
		expect(count).toBe(0);
	});

	test("countSuccessful should count global and section successes", () => {
		const globalResults: Record<string, DimensionResult> = {
			dim1: { data: "success" },
			dim2: { data: "success" },
		};
		const sectionResults: Array<{
			section: SectionData;
			results: Record<string, DimensionResult>;
		}> = [
			{
				section: { content: "test", metadata: {} },
				results: {
					dim3: { data: "success" },
					dim4: { data: "success" },
				},
			},
		];

		const count = countSuccessful(globalResults, sectionResults);
		expect(count).toBe(4); // 2 global + 2 section dimensions
	});

	test("countSuccessful should not double count section dimensions across sections", () => {
		const globalResults: Record<string, DimensionResult> = {};
		const sectionResults: Array<{
			section: SectionData;
			results: Record<string, DimensionResult>;
		}> = [
			{
				section: { content: "test1", metadata: {} },
				results: { dim1: { data: "success" } },
			},
			{
				section: { content: "test2", metadata: {} },
				results: { dim1: { data: "success" } },
			},
		];

		const count = countSuccessful(globalResults, sectionResults);
		expect(count).toBe(1); // dim1 counted once even though it's in 2 sections
	});

	test("countSuccessful should exclude failed section dimensions", () => {
		const globalResults: Record<string, DimensionResult> = {
			dim1: { data: "success" },
		};
		const sectionResults: Array<{
			section: SectionData;
			results: Record<string, DimensionResult>;
		}> = [
			{
				section: { content: "test", metadata: {} },
				results: {
					dim2: { data: "success" },
					dim3: { error: "Failed" },
				},
			},
		];

		const count = countSuccessful(globalResults, sectionResults);
		expect(count).toBe(2); // dim1 and dim2
	});

	test("countFailed should count global and section failures", () => {
		const globalResults: Record<string, DimensionResult> = {
			dim1: { error: "Failed" },
		};
		const sectionResults: Array<{
			section: SectionData;
			results: Record<string, DimensionResult>;
		}> = [
			{
				section: { content: "test", metadata: {} },
				results: {
					dim2: { error: "Failed" },
					dim3: { error: "Failed" },
				},
			},
		];

		const count = countFailed(globalResults, sectionResults);
		expect(count).toBe(3); // 1 global + 2 section dimensions
	});

	test("countFailed should not double count section dimensions", () => {
		const globalResults: Record<string, DimensionResult> = {};
		const sectionResults: Array<{
			section: SectionData;
			results: Record<string, DimensionResult>;
		}> = [
			{
				section: { content: "test1", metadata: {} },
				results: { dim1: { error: "Failed" } },
			},
			{
				section: { content: "test2", metadata: {} },
				results: { dim1: { error: "Failed" } },
			},
		];

		const count = countFailed(globalResults, sectionResults);
		expect(count).toBe(1); // dim1 counted once
	});

	test("countFailed should exclude successful dimensions", () => {
		const globalResults: Record<string, DimensionResult> = {
			dim1: { data: "success" },
			dim2: { error: "Failed" },
		};
		const sectionResults: Array<{
			section: SectionData;
			results: Record<string, DimensionResult>;
		}> = [
			{
				section: { content: "test", metadata: {} },
				results: {
					dim3: { data: "success" },
					dim4: { error: "Failed" },
				},
			},
		];

		const count = countFailed(globalResults, sectionResults);
		expect(count).toBe(2); // dim2 and dim4
	});
});

// ============================================================================
// STATE UTILITIES TESTS
// ============================================================================

describe("Utils - State Utilities", () => {
	test("resetSectionResultsMap should clear and reinitialize map", () => {
		const map = new Map<number, Record<string, DimensionResult>>();
		map.set(0, { dim1: { data: "old" } });
		map.set(1, { dim2: { data: "old" } });

		resetSectionResultsMap(map, 3);

		expect(map.size).toBe(3);
		expect(map.get(0)).toEqual({});
		expect(map.get(1)).toEqual({});
		expect(map.get(2)).toEqual({});
	});

	test("resetSectionResultsMap should handle zero length", () => {
		const map = new Map<number, Record<string, DimensionResult>>();
		map.set(0, { dim1: { data: "old" } });

		resetSectionResultsMap(map, 0);

		expect(map.size).toBe(0);
	});

	test("applyFinalizedResults should update section results", () => {
		const sectionResults = [
			{
				section: { content: "test1", metadata: {} },
				results: { dim1: { data: "original" } },
			},
			{
				section: { content: "test2", metadata: {} },
				results: { dim1: { data: "original" } },
			},
		];

		const finalizedResults: Record<string, DimensionResult> = {
			dim1_section_0: { data: "updated0" },
			dim1_section_1: { data: "updated1" },
		};

		const globalResults: Record<string, DimensionResult> = {};

		const updated = applyFinalizedResults(
			sectionResults,
			finalizedResults,
			globalResults
		);

		expect(updated[0]?.results.dim1).toEqual({ data: "updated0" });
		expect(updated[1]?.results.dim1).toEqual({ data: "updated1" });
	});

	test("applyFinalizedResults should preserve results not in finalized", () => {
		const sectionResults = [
			{
				section: { content: "test", metadata: {} },
				results: {
					dim1: { data: "original" },
					dim2: { data: "keep" },
				},
			},
		];

		const finalizedResults: Record<string, DimensionResult> = {
			dim1_section_0: { data: "updated" },
		};

		const globalResults: Record<string, DimensionResult> = {};

		const updated = applyFinalizedResults(
			sectionResults,
			finalizedResults,
			globalResults
		);

		expect(updated[0]?.results.dim1).toEqual({ data: "updated" });
		expect(updated[0]?.results.dim2).toEqual({ data: "keep" });
	});

	test("applyFinalizedResults should update global results", () => {
		const sectionResults: Array<{
			section: SectionData;
			results: Record<string, DimensionResult>;
		}> = [];

		const finalizedResults: Record<string, DimensionResult> = {
			globalDim: { data: "updated" },
		};

		const globalResults: Record<string, DimensionResult> = {
			globalDim: { data: "original" },
		};

		applyFinalizedResults(sectionResults, finalizedResults, globalResults);

		expect(globalResults.globalDim).toEqual({ data: "updated" });
	});

	test("applyFinalizedResults should not add new global results", () => {
		const sectionResults: Array<{
			section: SectionData;
			results: Record<string, DimensionResult>;
		}> = [];

		const finalizedResults: Record<string, DimensionResult> = {
			newDim: { data: "new" },
		};

		const globalResults: Record<string, DimensionResult> = {
			existingDim: { data: "existing" },
		};

		applyFinalizedResults(sectionResults, finalizedResults, globalResults);

		expect(globalResults.newDim).toBeUndefined();
		expect(globalResults.existingDim).toEqual({ data: "existing" });
	});
});

// ============================================================================
// TIMEOUT UTILITIES TESTS
// ============================================================================

describe("Utils - Timeout Utilities", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("createTimeoutPromise should reject after timeout", async () => {
		const promise = createTimeoutPromise(1000, "testDim");

		vi.advanceTimersByTime(1000);

		await expect(promise).rejects.toThrow(DimensionTimeoutError);
		await expect(promise).rejects.toThrow("testDim");
	});

	test("executeWithTimeout should resolve if function completes in time", async () => {
		const fn = vi.fn(async () => "success");

		const promise = executeWithTimeout(fn, "testDim", 1000);

		await vi.runAllTimersAsync();

		await expect(promise).resolves.toBe("success");
	});

	test("executeWithTimeout should reject if timeout reached", async () => {
		const fn = vi.fn(
			() =>
				new Promise((resolve) => {
					setTimeout(() => resolve("too late"), 2000);
				})
		);

		const promise = executeWithTimeout(fn, "testDim", 1000);

		vi.advanceTimersByTime(1000);

		await expect(promise).rejects.toThrow(DimensionTimeoutError);
	});

	test("executeWithTimeout should throw timeout error with correct dimension", async () => {
		const fn = vi.fn(() => new Promise(() => {})); // Never resolves

		const promise = executeWithTimeout(fn, "myDimension", 500);

		vi.advanceTimersByTime(500);

		await expect(promise).rejects.toThrow("myDimension");
		await expect(promise).rejects.toThrow("500");
	});
});


