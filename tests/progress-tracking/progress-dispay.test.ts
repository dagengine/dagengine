import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { ProgressDisplay } from "../../src/core/execution/progress-display.js";
import type { ProgressUpdate } from "../../src/types.js";

// ============================================================================
// TEST HELPERS
// ============================================================================

function createProgressUpdate(overrides: Partial<ProgressUpdate> = {}): ProgressUpdate {
	return {
		completed: 5,
		total: 10,
		percent: 50,
		cost: 0.05,
		estimatedCost: 0.10,
		elapsedSeconds: 30,
		etaSeconds: 30,
		currentDimension: "testDim",
		currentSection: 2,
		dimensions: {
			dim1: {
				completed: 3,
				total: 5,
				percent: 60,
				cost: 0.03,
				estimatedCost: 0.05,
				failed: 0,
				etaSeconds: 10,
			},
			dim2: {
				completed: 2,
				total: 5,
				percent: 40,
				cost: 0.02,
				estimatedCost: 0.05,
				failed: 0,
				etaSeconds: 20,
			},
		},
		...overrides,
	};
}

// Mock stdout.write
const originalWrite = process.stdout.write;
let stdoutOutput: string[] = [];

function captureStdout() {
	stdoutOutput = [];
	process.stdout.write = vi.fn((chunk: string | Uint8Array) => {
		if (typeof chunk === "string") {
			stdoutOutput.push(chunk);
		}
		return true;
	}) as typeof process.stdout.write;
}

function restoreStdout() {
	process.stdout.write = originalWrite;
}

// Mock cli-progress module
vi.mock("cli-progress", () => {
	const mockBar = {
		start: vi.fn(),
		update: vi.fn(),
		stop: vi.fn(),
		isActive: false,
	};

	const mockMultiBar = {
		create: vi.fn(() => ({
			start: vi.fn(),
			update: vi.fn(),
			stop: vi.fn(),
			isActive: false,
		})),
		stop: vi.fn(),
	};

	return {
		SingleBar: vi.fn(() => mockBar),
		MultiBar: vi.fn(() => mockMultiBar),
	};
});

// ============================================================================
// BASIC INITIALIZATION TESTS
// ============================================================================

describe("ProgressDisplay - Initialization", () => {
	test("should create with default options", () => {
		const display = new ProgressDisplay();
		expect(display).toBeDefined();
	});

	test("should create with simple display", () => {
		const display = new ProgressDisplay({ display: "simple" });
		expect(display).toBeDefined();
	});

	test("should create with bar display", () => {
		const display = new ProgressDisplay({ display: "bar" });
		expect(display).toBeDefined();
	});

	test("should create with multi display", () => {
		const display = new ProgressDisplay({ display: "multi" });
		expect(display).toBeDefined();
	});

	test("should create with none display", () => {
		const display = new ProgressDisplay({ display: "none" });
		expect(display).toBeDefined();
	});

	test("should accept custom format", () => {
		const display = new ProgressDisplay({
			display: "bar",
			format: "Custom {bar} {percentage}%",
		});
		expect(display).toBeDefined();
	});

	test("should accept showDimensions option", () => {
		const display = new ProgressDisplay({
			display: "simple",
			showDimensions: false,
		});
		expect(display).toBeDefined();
	});

	test("should accept throttleMs option", () => {
		const display = new ProgressDisplay({
			display: "simple",
			throttleMs: 200,
		});
		expect(display).toBeDefined();
	});

	test("should accept all options together", () => {
		const display = new ProgressDisplay({
			display: "bar",
			format: "Custom format",
			showDimensions: false,
			throttleMs: 500,
		});
		expect(display).toBeDefined();
	});
});

// ============================================================================
// SIMPLE DISPLAY TESTS
// ============================================================================

describe("ProgressDisplay - Simple Display", () => {
	beforeEach(() => {
		captureStdout();
		vi.useFakeTimers();
	});

	afterEach(() => {
		restoreStdout();
		vi.restoreAllMocks();
	});

	test("should display progress in simple format", () => {
		const display = new ProgressDisplay({ display: "simple" });
		const progress = createProgressUpdate();

		display.update(progress);

		expect(stdoutOutput.length).toBeGreaterThan(0);
		const output = stdoutOutput.join("");
		expect(output).toContain("50.0%");
		expect(output).toContain("5/10");
		expect(output).toContain("$0.05");
		expect(output).toContain("ETA: 30s");
	});

	test("should show dimension name when enabled", () => {
		const display = new ProgressDisplay({
			display: "simple",
			showDimensions: true,
		});
		const progress = createProgressUpdate({
			currentDimension: "myDimension",
		});

		display.update(progress);

		const output = stdoutOutput.join("");
		expect(output).toContain("myDimension");
	});

	test("should not show dimension name when disabled", () => {
		const display = new ProgressDisplay({
			display: "simple",
			showDimensions: false,
		});
		const progress = createProgressUpdate({
			currentDimension: "myDimension",
		});

		display.update(progress);

		const output = stdoutOutput.join("");
		expect(output).not.toContain("myDimension");
	});

	test("should handle zero progress", () => {
		const display = new ProgressDisplay({ display: "simple" });
		const progress = createProgressUpdate({
			completed: 0,
			total: 10,
			percent: 0,
			cost: 0,
		});

		display.update(progress);

		const output = stdoutOutput.join("");
		expect(output).toContain("0.0%");
		expect(output).toContain("0/10");
	});

	test("should handle complete progress", () => {
		const display = new ProgressDisplay({ display: "simple" });
		const progress = createProgressUpdate({
			completed: 10,
			total: 10,
			percent: 100,
		});

		display.update(progress);

		const output = stdoutOutput.join("");
		expect(output).toContain("100.0%");
		expect(output).toContain("10/10");
	});

	test("should write newline on stop", () => {
		const display = new ProgressDisplay({ display: "simple" });

		display.stop();

		const output = stdoutOutput.join("");
		expect(output).toContain("\n");
	});
});

// ============================================================================
// THROTTLE TESTS
// ============================================================================

describe("ProgressDisplay - Throttling", () => {
	beforeEach(() => {
		captureStdout();
		vi.useFakeTimers();
	});

	afterEach(() => {
		restoreStdout();
		vi.restoreAllMocks();
	});

	test("should throttle updates based on throttleMs", () => {
		const display = new ProgressDisplay({
			display: "simple",
			throttleMs: 100,
		});
		const progress = createProgressUpdate();

		// First update should go through
		display.update(progress);
		expect(stdoutOutput.length).toBeGreaterThan(0);

		// Clear output
		stdoutOutput = [];

		// Second update immediately should be throttled
		display.update(progress);
		expect(stdoutOutput.length).toBe(0);

		// Advance time past throttle
		vi.advanceTimersByTime(100);

		// Third update should go through
		display.update(progress);
		expect(stdoutOutput.length).toBeGreaterThan(0);
	});

	test("should respect custom throttle time", () => {
		const display = new ProgressDisplay({
			display: "simple",
			throttleMs: 200,
		});
		const progress = createProgressUpdate();

		display.update(progress);
		stdoutOutput = [];

		// 100ms - should still be throttled
		vi.advanceTimersByTime(100);
		display.update(progress);
		expect(stdoutOutput.length).toBe(0);

		// Another 100ms (total 200ms) - should go through
		vi.advanceTimersByTime(100);
		display.update(progress);
		expect(stdoutOutput.length).toBeGreaterThan(0);
	});

	test("should allow immediate first update", () => {
		const display = new ProgressDisplay({
			display: "simple",
			throttleMs: 1000,
		});
		const progress = createProgressUpdate();

		display.update(progress);

		expect(stdoutOutput.length).toBeGreaterThan(0);
	});
});

// ============================================================================
// NONE DISPLAY TESTS
// ============================================================================

describe("ProgressDisplay - None Display", () => {
	beforeEach(() => {
		captureStdout();
	});

	afterEach(() => {
		restoreStdout();
	});

	test("should not output anything with none display", () => {
		const display = new ProgressDisplay({ display: "none" });
		const progress = createProgressUpdate();

		display.update(progress);

		expect(stdoutOutput.length).toBe(0);
	});

	test("should not output on stop with none display", () => {
		const display = new ProgressDisplay({ display: "none" });

		display.stop();

		expect(stdoutOutput.length).toBe(0);
	});
});

// ============================================================================
// BAR DISPLAY TESTS (with mocked cli-progress)
// ============================================================================

describe("ProgressDisplay - Bar Display", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("should initialize bar display", () => {
		const display = new ProgressDisplay({ display: "bar" });
		expect(display).toBeDefined();
	});

	test("should update bar display", () => {
		const display = new ProgressDisplay({ display: "bar" });
		const progress = createProgressUpdate();

		vi.advanceTimersByTime(100);
		display.update(progress);

		// Bar should be updated (mocked, so just verify no errors)
		expect(display).toBeDefined();
	});

	test("should stop bar display", () => {
		const display = new ProgressDisplay({ display: "bar" });

		display.stop();

		// Should stop without errors
		expect(display).toBeDefined();
	});
});

// ============================================================================
// MULTI-BAR DISPLAY TESTS (with mocked cli-progress)
// ============================================================================

describe("ProgressDisplay - Multi-Bar Display", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("should initialize multi-bar display", () => {
		const display = new ProgressDisplay({ display: "multi" });
		expect(display).toBeDefined();
	});

	test("should update multi-bar display with dimensions", () => {
		const display = new ProgressDisplay({ display: "multi" });
		const progress = createProgressUpdate();

		vi.advanceTimersByTime(100);
		display.update(progress);

		// Multi-bar should be updated (mocked, so just verify no errors)
		expect(display).toBeDefined();
	});

	test("should handle multiple dimension updates", () => {
		const display = new ProgressDisplay({ display: "multi" });
		const progress1 = createProgressUpdate({
			dimensions: {
				dim1: {
					completed: 1,
					total: 5,
					percent: 20,
					cost: 0.01,
					estimatedCost: 0.05,
					failed: 0,
					etaSeconds: 40,
				},
			},
		});

		const progress2 = createProgressUpdate({
			dimensions: {
				dim1: {
					completed: 3,
					total: 5,
					percent: 60,
					cost: 0.03,
					estimatedCost: 0.05,
					failed: 0,
					etaSeconds: 20,
				},
				dim2: {
					completed: 2,
					total: 5,
					percent: 40,
					cost: 0.02,
					estimatedCost: 0.05,
					failed: 0,
					etaSeconds: 30,
				},
			},
		});

		vi.advanceTimersByTime(100);
		display.update(progress1);

		vi.advanceTimersByTime(100);
		display.update(progress2);

		// Should handle multiple updates without errors
		expect(display).toBeDefined();
	});

	test("should stop multi-bar display", () => {
		const display = new ProgressDisplay({ display: "multi" });

		display.stop();

		// Should stop without errors
		expect(display).toBeDefined();
	});
});

// ============================================================================
// EDGE CASES AND ERROR HANDLING
// ============================================================================

describe("ProgressDisplay - Edge Cases", () => {
	beforeEach(() => {
		captureStdout();
		vi.useFakeTimers();
	});

	afterEach(() => {
		restoreStdout();
		vi.restoreAllMocks();
	});

	test("should handle missing currentDimension", () => {
		const display = new ProgressDisplay({ display: "simple" });
		const progress = createProgressUpdate({
			currentDimension: "",
		});

		display.update(progress);

		// Should not crash
		expect(stdoutOutput.length).toBeGreaterThan(0);
	});

	test("should handle empty dimensions object", () => {
		const display = new ProgressDisplay({ display: "multi" });
		const progress = createProgressUpdate({
			dimensions: {},
		});

		vi.advanceTimersByTime(100);
		display.update(progress);

		// Should not crash
		expect(display).toBeDefined();
	});

	test("should handle very small costs", () => {
		const display = new ProgressDisplay({ display: "simple" });
		const progress = createProgressUpdate({
			cost: 0.0001,
		});

		display.update(progress);

		const output = stdoutOutput.join("");
		expect(output).toContain("$0.00");
	});

	test("should handle very large costs", () => {
		const display = new ProgressDisplay({ display: "simple" });
		const progress = createProgressUpdate({
			cost: 999.99,
		});

		display.update(progress);

		const output = stdoutOutput.join("");
		expect(output).toContain("$999.99");
	});

	test("should handle negative ETA", () => {
		const display = new ProgressDisplay({ display: "simple" });
		const progress = createProgressUpdate({
			etaSeconds: -5,
		});

		display.update(progress);

		// Should display negative value without crashing
		const output = stdoutOutput.join("");
		expect(output).toContain("-5s");
	});

	test("should handle zero total", () => {
		const display = new ProgressDisplay({ display: "simple" });
		const progress = createProgressUpdate({
			completed: 0,
			total: 0,
			percent: 0,
		});

		display.update(progress);

		const output = stdoutOutput.join("");
		expect(output).toContain("0/0");
	});

	test("should handle decimal percentages correctly", () => {
		const display = new ProgressDisplay({ display: "simple" });
		const progress = createProgressUpdate({
			percent: 33.333333,
		});

		display.update(progress);

		const output = stdoutOutput.join("");
		expect(output).toContain("33.3%");
	});

	test("should handle multiple consecutive stops", () => {
		const display = new ProgressDisplay({ display: "simple" });

		display.stop();
		display.stop();
		display.stop();

		// Should not crash
		expect(display).toBeDefined();
	});

	test("should handle update after stop", () => {
		const display = new ProgressDisplay({ display: "simple" });
		const progress = createProgressUpdate();

		display.stop();

		vi.advanceTimersByTime(100);
		display.update(progress);

		// Should not crash
		expect(display).toBeDefined();
	});

	test("should handle very long dimension names", () => {
		const display = new ProgressDisplay({ display: "simple" });
		const longName = "a".repeat(100);
		const progress = createProgressUpdate({
			currentDimension: longName,
		});

		display.update(progress);

		const output = stdoutOutput.join("");
		expect(output).toContain(longName);
	});
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe("ProgressDisplay - Integration", () => {
	beforeEach(() => {
		captureStdout();
		vi.useFakeTimers();
	});

	afterEach(() => {
		restoreStdout();
		vi.restoreAllMocks();
	});

	test("should handle full progress lifecycle", () => {
		const display = new ProgressDisplay({ display: "simple" });

		// Start
		const start = createProgressUpdate({
			completed: 0,
			total: 10,
			percent: 0,
		});
		display.update(start);

		// Middle
		vi.advanceTimersByTime(100);
		const middle = createProgressUpdate({
			completed: 5,
			total: 10,
			percent: 50,
		});
		display.update(middle);

		// End
		vi.advanceTimersByTime(100);
		const end = createProgressUpdate({
			completed: 10,
			total: 10,
			percent: 100,
		});
		display.update(end);

		// Stop
		display.stop();

		expect(stdoutOutput.length).toBeGreaterThan(0);
	});

	test("should maintain state across multiple updates", () => {
		const display = new ProgressDisplay({
			display: "simple",
			throttleMs: 50,
		});

		for (let i = 0; i <= 10; i++) {
			vi.advanceTimersByTime(50);
			const progress = createProgressUpdate({
				completed: i,
				total: 10,
				percent: (i / 10) * 100,
			});
			display.update(progress);
		}

		// Should have multiple outputs
		expect(stdoutOutput.length).toBeGreaterThan(5);
	});

	test("should work with all display types in sequence", () => {
		const displays = [
			new ProgressDisplay({ display: "simple" }),
			new ProgressDisplay({ display: "bar" }),
			new ProgressDisplay({ display: "multi" }),
			new ProgressDisplay({ display: "none" }),
		];

		const progress = createProgressUpdate();

		displays.forEach((display, index) => {
			vi.advanceTimersByTime(100);
			display.update(progress);
			display.stop();
		});

		// All should complete without errors
		expect(displays).toHaveLength(4);
	});
});