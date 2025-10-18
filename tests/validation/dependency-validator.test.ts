import { describe, test, expect, beforeEach } from "vitest";
import { DependencyValidator } from "../../src/core/validation/dependency-validator.js";
import { Plugin } from "../../src/plugin.js";
import {
	CircularDependencyError,
	DependencyNotFoundError,
	ValidationError,
} from "../../src/core/shared/errors.js";
import type { PromptContext, ProviderSelection } from "../../src/types.js";

// ============================================================================
// TEST HELPERS
// ============================================================================

class TestPlugin extends Plugin {
	private globalDims: Set<string>;

	constructor(
		dimensions: string[] | Array<{ name: string; scope: "global" }>,
		globalDimensionNames: string[] = []
	) {
		super("test", "Test Plugin", "Test");
		this.dimensions = dimensions;
		this.globalDims = new Set(globalDimensionNames);
	}

	createPrompt(context: PromptContext): string {
		return `Process: ${context.dimension}`;
	}

	selectProvider(): ProviderSelection {
		return { provider: "mock", options: {} };
	}

	isGlobalDimension(dimension: string): boolean {
		return this.globalDims.has(dimension);
	}
}

// ============================================================================
// BASIC VALIDATION TESTS
// ============================================================================

describe("DependencyValidator - Basic Validation", () => {
	test("should validate valid dependency graph", () => {
		const dimensions = ["a", "b", "c"];
		const dependencyGraph = {
			b: ["a"],
			c: ["b"],
		};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).not.toThrow();
	});

	test("should validate empty dependency graph", () => {
		const dimensions = ["a", "b", "c"];
		const dependencyGraph = {};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).not.toThrow();
	});

	test("should validate graph with no dependencies", () => {
		const dimensions = ["a", "b", "c"];
		const dependencyGraph = {
			a: [],
			b: [],
			c: [],
		};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).not.toThrow();
	});

	test("should validate linear dependency chain", () => {
		const dimensions = ["a", "b", "c", "d"];
		const dependencyGraph = {
			b: ["a"],
			c: ["b"],
			d: ["c"],
		};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).not.toThrow();
	});

	test("should validate tree structure", () => {
		const dimensions = ["root", "left", "right", "leaf1", "leaf2"];
		const dependencyGraph = {
			left: ["root"],
			right: ["root"],
			leaf1: ["left"],
			leaf2: ["right"],
		};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).not.toThrow();
	});
});

// ============================================================================
// MISSING DEPENDENCY TESTS
// ============================================================================

describe("DependencyValidator - Missing Dependencies", () => {
	test("should throw error for missing dependency", () => {
		const dimensions = ["a", "b"];
		const dependencyGraph = {
			b: ["c"], // c doesn't exist
		};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).toThrow(DependencyNotFoundError);
	});

	test("should throw error for multiple missing dependencies", () => {
		const dimensions = ["a"];
		const dependencyGraph = {
			a: ["b", "c", "d"], // All missing
		};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).toThrow(DependencyNotFoundError);
	});

	test("should identify specific missing dependency", () => {
		const dimensions = ["a", "b"];
		const dependencyGraph = {
			b: ["missing"],
		};
		const plugin = new TestPlugin(dimensions);

		try {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
			expect.fail("Should have thrown error");
		} catch (error) {
			expect(error).toBeInstanceOf(DependencyNotFoundError);
			if (error instanceof DependencyNotFoundError) {
				expect(error.message).toContain("missing");
			}
		}
	});
});

// ============================================================================
// CYCLE DETECTION TESTS
// ============================================================================

describe("DependencyValidator - Cycle Detection", () => {
	test("should detect simple cycle (A -> B -> A)", () => {
		const dimensions = ["a", "b"];
		const dependencyGraph = {
			a: ["b"],
			b: ["a"],
		};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).toThrow(CircularDependencyError);
	});

	test("should detect self-referential cycle (A -> A)", () => {
		const dimensions = ["a"];
		const dependencyGraph = {
			a: ["a"],
		};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).toThrow(CircularDependencyError);
	});

	test("should detect three-node cycle (A -> B -> C -> A)", () => {
		const dimensions = ["a", "b", "c"];
		const dependencyGraph = {
			a: ["b"],
			b: ["c"],
			c: ["a"],
		};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).toThrow(CircularDependencyError);
	});

	test("should detect cycle with multiple paths", () => {
		const dimensions = ["a", "b", "c", "d"];
		const dependencyGraph = {
			a: ["b", "c"],
			b: ["d"],
			c: ["d"],
			d: ["a"], // Creates cycle
		};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).toThrow(CircularDependencyError);
	});

	test("should detect cycle in disconnected graph", () => {
		const dimensions = ["a", "b", "c", "d"];
		const dependencyGraph = {
			a: ["b"],
			b: ["a"], // Cycle in first component
			c: ["d"], // Second component is fine
		};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).toThrow(CircularDependencyError);
	});

	test("should include cycle path in error", () => {
		const dimensions = ["a", "b", "c"];
		const dependencyGraph = {
			a: ["b"],
			b: ["c"],
			c: ["a"],
		};
		const plugin = new TestPlugin(dimensions);

		try {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
			expect.fail("Should have thrown error");
		} catch (error) {
			expect(error).toBeInstanceOf(CircularDependencyError);
			if (error instanceof CircularDependencyError) {
				expect(error.cycle).toContain("a");
				expect(error.cycle).toContain("b");
				expect(error.cycle).toContain("c");
			}
		}
	});
});

// ============================================================================
// FIND ALL CYCLES TESTS
// ============================================================================

describe("DependencyValidator - findAllCycles", () => {
	test("should find no cycles in acyclic graph", () => {
		const dependencyGraph = {
			a: [],
			b: ["a"],
			c: ["b"],
		};

		const cycles = DependencyValidator.findAllCycles(dependencyGraph);

		expect(cycles).toHaveLength(0);
	});

	test("should find single cycle", () => {
		const dependencyGraph = {
			a: ["b"],
			b: ["a"],
		};

		const cycles = DependencyValidator.findAllCycles(dependencyGraph);

		expect(cycles.length).toBeGreaterThan(0);
		expect(cycles[0]).toContain("a");
		expect(cycles[0]).toContain("b");
	});

	test("should find self-referential cycle", () => {
		const dependencyGraph = {
			a: ["a"],
		};

		const cycles = DependencyValidator.findAllCycles(dependencyGraph);

		expect(cycles.length).toBeGreaterThan(0);
		expect(cycles[0]).toContain("a");
	});

	test("should find multiple independent cycles", () => {
		const dependencyGraph = {
			a: ["b"],
			b: ["a"],
			c: ["d"],
			d: ["c"],
		};

		const cycles = DependencyValidator.findAllCycles(dependencyGraph);

		expect(cycles.length).toBeGreaterThan(0);
	});
});

// ============================================================================
// ACYCLICITY TESTS
// ============================================================================

describe("DependencyValidator - isAcyclic", () => {
	test("should return true for acyclic graph", () => {
		const dependencyGraph = {
			a: [],
			b: ["a"],
			c: ["b"],
		};

		expect(DependencyValidator.isAcyclic(dependencyGraph)).toBe(true);
	});

	test("should return false for cyclic graph", () => {
		const dependencyGraph = {
			a: ["b"],
			b: ["a"],
		};

		expect(DependencyValidator.isAcyclic(dependencyGraph)).toBe(false);
	});

	test("should return true for empty graph", () => {
		const dependencyGraph = {};

		expect(DependencyValidator.isAcyclic(dependencyGraph)).toBe(true);
	});

	test("should return false for self-referential cycle", () => {
		const dependencyGraph = {
			a: ["a"],
		};

		expect(DependencyValidator.isAcyclic(dependencyGraph)).toBe(false);
	});
});

// ============================================================================
// GET ALL DEPENDENCIES TESTS
// ============================================================================

describe("DependencyValidator - getAllDependencies", () => {
	test("should get direct dependencies", () => {
		const dependencyGraph = {
			a: ["b", "c"],
		};

		const deps = DependencyValidator.getAllDependencies("a", dependencyGraph);

		expect(deps.size).toBe(2);
		expect(deps.has("b")).toBe(true);
		expect(deps.has("c")).toBe(true);
	});

	test("should get transitive dependencies", () => {
		const dependencyGraph = {
			a: ["b"],
			b: ["c"],
			c: ["d"],
		};

		const deps = DependencyValidator.getAllDependencies("a", dependencyGraph);

		expect(deps.size).toBe(3);
		expect(deps.has("b")).toBe(true);
		expect(deps.has("c")).toBe(true);
		expect(deps.has("d")).toBe(true);
	});

	test("should handle diamond dependencies", () => {
		const dependencyGraph = {
			a: ["b", "c"],
			b: ["d"],
			c: ["d"],
		};

		const deps = DependencyValidator.getAllDependencies("a", dependencyGraph);

		expect(deps.size).toBe(3);
		expect(deps.has("b")).toBe(true);
		expect(deps.has("c")).toBe(true);
		expect(deps.has("d")).toBe(true);
	});

	test("should return empty set for no dependencies", () => {
		const dependencyGraph = {
			a: [],
		};

		const deps = DependencyValidator.getAllDependencies("a", dependencyGraph);

		expect(deps.size).toBe(0);
	});

	test("should return empty set for missing dimension", () => {
		const dependencyGraph = {
			a: ["b"],
		};

		const deps = DependencyValidator.getAllDependencies("missing", dependencyGraph);

		expect(deps.size).toBe(0);
	});
});

// ============================================================================
// GET DEPENDENTS TESTS
// ============================================================================

describe("DependencyValidator - getDependents", () => {
	test("should get direct dependents", () => {
		const dependencyGraph = {
			a: ["b"],
			c: ["b"],
		};

		const dependents = DependencyValidator.getDependents("b", dependencyGraph);

		expect(dependents.size).toBe(2);
		expect(dependents.has("a")).toBe(true);
		expect(dependents.has("c")).toBe(true);
	});

	test("should return empty set for no dependents", () => {
		const dependencyGraph = {
			a: ["b"],
		};

		const dependents = DependencyValidator.getDependents("a", dependencyGraph);

		expect(dependents.size).toBe(0);
	});

	test("should find single dependent", () => {
		const dependencyGraph = {
			a: ["b"],
			c: ["d"],
		};

		const dependents = DependencyValidator.getDependents("b", dependencyGraph);

		expect(dependents.size).toBe(1);
		expect(dependents.has("a")).toBe(true);
	});

	test("should handle missing dimension", () => {
		const dependencyGraph = {
			a: ["b"],
		};

		const dependents = DependencyValidator.getDependents("missing", dependencyGraph);

		expect(dependents.size).toBe(0);
	});
});

// ============================================================================
// DEPENDS ON TESTS
// ============================================================================

describe("DependencyValidator - dependsOn", () => {
	test("should detect direct dependency", () => {
		const dependencyGraph = {
			a: ["b"],
		};

		expect(DependencyValidator.dependsOn("a", "b", dependencyGraph)).toBe(true);
	});

	test("should detect transitive dependency", () => {
		const dependencyGraph = {
			a: ["b"],
			b: ["c"],
		};

		expect(DependencyValidator.dependsOn("a", "c", dependencyGraph)).toBe(true);
	});

	test("should return false for no dependency", () => {
		const dependencyGraph = {
			a: ["b"],
			c: ["d"],
		};

		expect(DependencyValidator.dependsOn("a", "d", dependencyGraph)).toBe(false);
	});

	test("should return false for reverse dependency", () => {
		const dependencyGraph = {
			a: ["b"],
		};

		expect(DependencyValidator.dependsOn("b", "a", dependencyGraph)).toBe(false);
	});

	test("should handle deep dependency chains", () => {
		const dependencyGraph = {
			a: ["b"],
			b: ["c"],
			c: ["d"],
			d: ["e"],
		};

		expect(DependencyValidator.dependsOn("a", "e", dependencyGraph)).toBe(true);
	});
});

// ============================================================================
// VALIDATE DIMENSIONS IN GRAPH TESTS
// ============================================================================

describe("DependencyValidator - validateDimensionsInGraph", () => {
	test("should validate dimensions present in graph", () => {
		const dimensions = ["a", "b", "c"];
		const dependencyGraph = {
			a: ["b"],
			c: [],
		};

		expect(() => {
			DependencyValidator.validateDimensionsInGraph(dimensions, dependencyGraph);
		}).not.toThrow();
	});

	test("should throw error for missing dimensions", () => {
		const dimensions = ["a", "b", "c"];
		const dependencyGraph = {
			a: [],
		};

		expect(() => {
			DependencyValidator.validateDimensionsInGraph(dimensions, dependencyGraph);
		}).toThrow(ValidationError);
	});

	test("should accept dimensions as dependencies", () => {
		const dimensions = ["a", "b"];
		const dependencyGraph = {
			a: ["b"],
		};

		expect(() => {
			DependencyValidator.validateDimensionsInGraph(dimensions, dependencyGraph);
		}).not.toThrow();
	});

	test("should handle empty dimension list", () => {
		const dimensions: string[] = [];
		const dependencyGraph = {
			a: ["b"],
		};

		expect(() => {
			DependencyValidator.validateDimensionsInGraph(dimensions, dependencyGraph);
		}).not.toThrow();
	});

	test("should throw with descriptive error message", () => {
		const dimensions = ["a", "missing1", "missing2"];
		const dependencyGraph = {
			a: [],
		};

		try {
			DependencyValidator.validateDimensionsInGraph(dimensions, dependencyGraph);
			expect.fail("Should have thrown error");
		} catch (error) {
			expect(error).toBeInstanceOf(ValidationError);
			if (error instanceof ValidationError) {
				expect(error.message).toContain("missing1");
				expect(error.message).toContain("missing2");
			}
		}
	});
});

// ============================================================================
// COMPLEX GRAPH TESTS
// ============================================================================

describe("DependencyValidator - Complex Graphs", () => {
	test("should validate complex multi-level graph", () => {
		const dimensions = ["root", "a1", "a2", "b1", "b2", "c1", "c2"];
		const dependencyGraph = {
			a1: ["root"],
			a2: ["root"],
			b1: ["a1"],
			b2: ["a2"],
			c1: ["b1", "b2"],
			c2: ["b1"],
		};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).not.toThrow();
	});

	test("should detect cycle in complex graph", () => {
		const dimensions = ["a", "b", "c", "d", "e"];
		const dependencyGraph = {
			a: ["b"],
			b: ["c", "d"],
			c: ["e"],
			d: ["e"],
			e: ["a"], // Creates cycle
		};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).toThrow(CircularDependencyError);
	});

	test("should validate graph with isolated nodes", () => {
		const dimensions = ["a", "b", "c", "d"];
		const dependencyGraph = {
			a: ["b"],
			c: [], // Isolated
			d: [], // Isolated
		};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).not.toThrow();
	});
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe("DependencyValidator - Edge Cases", () => {
	test("should handle single dimension with no dependencies", () => {
		const dimensions = ["a"];
		const dependencyGraph = { a: [] };
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).not.toThrow();
	});

	test("should handle dimension depending on multiple others", () => {
		const dimensions = ["a", "b", "c", "d"];
		const dependencyGraph = {
			d: ["a", "b", "c"],
		};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).not.toThrow();
	});

	test("should handle many dimensions with no dependencies", () => {
		const dimensions = Array.from({ length: 100 }, (_, i) => `dim${i}`);
		const dependencyGraph = {};
		const plugin = new TestPlugin(dimensions);

		expect(() => {
			DependencyValidator.validate(dimensions, dependencyGraph, plugin);
		}).not.toThrow();
	});
});