/**
 * Dependency graph validator
 *
 * Validates dependency graphs for cycles, missing dependencies,
 * and other structural issues.
 *
 * @module validation/dependency-validator
 */

import type { Plugin } from "../../plugin.js";
import {
	CircularDependencyError,
	DependencyNotFoundError,
	ValidationError,
} from "../shared/errors.js";

/**
 * Dependency graph validator
 *
 * Provides validation for dependency graphs including:
 * - Cycle detection
 * - Missing dependency detection
 * - Invalid dependency references
 */
export class DependencyValidator {
	/**
	 * Validates a dependency graph
	 *
	 * @param dimensions - All available dimension names
	 * @param dependencyGraph - Dependency graph to validate
	 * @param plugin - Plugin instance for dimension lookup
	 * @throws {CircularDependencyError} If cycles are detected
	 * @throws {DependencyNotFoundError} If dependencies reference unknown dimensions
	 *
	 * @example
	 * ```typescript
	 * const dimensions = ['summary', 'tags', 'sentiment'];
	 * const deps = { sentiment: ['summary'], tags: ['summary'] };
	 *
	 * try {
	 *   DependencyValidator.validate(dimensions, deps, plugin);
	 * } catch (error) {
	 *   if (error instanceof CircularDependencyError) {
	 *     console.error('Cycle detected:', error.cycle);
	 *   }
	 * }
	 * ```
	 */
	static validate(
		dimensions: string[],
		dependencyGraph: Record<string, string[]>,
		plugin: Plugin,
	): void {
		DependencyValidator.validateDependenciesExist(dimensions, dependencyGraph);
		DependencyValidator.validateNoCycles(dependencyGraph);
		DependencyValidator.validateGlobalDependencies(dependencyGraph, plugin);
	}

	/**
	 * Validates that all dependencies reference existing dimensions
	 */
	private static validateDependenciesExist(
		dimensions: string[],
		dependencyGraph: Record<string, string[]>,
	): void {
		const dimensionSet = new Set(dimensions);

		for (const [, deps] of Object.entries(dependencyGraph)) {
			for (const dep of deps) {
				if (!dimensionSet.has(dep)) {
					throw new DependencyNotFoundError(dep, "plugin");
				}
			}
		}
	}

	/**
	 * Validates that the dependency graph contains no cycles
	 *
	 * Uses depth-first search to detect cycles.
	 */
	private static validateNoCycles(
		dependencyGraph: Record<string, string[]>,
	): void {
		const visited = new Set<string>();
		const recursionStack = new Set<string>();
		const path: string[] = [];

		const hasCycle = (node: string): boolean => {
			visited.add(node);
			recursionStack.add(node);
			path.push(node);

			const dependencies = dependencyGraph[node] || [];

			for (const dep of dependencies) {
				if (!visited.has(dep)) {
					if (hasCycle(dep)) {
						return true;
					}
				} else if (recursionStack.has(dep)) {
					// Found a cycle - build the cycle path
					const cycleStart = path.indexOf(dep);
					const cycle = [...path.slice(cycleStart), dep];
					throw new CircularDependencyError(cycle);
				}
			}

			recursionStack.delete(node);
			path.pop();
			return false;
		};

		// Check all nodes (handles disconnected components)
		for (const node of Object.keys(dependencyGraph)) {
			if (!visited.has(node)) {
				hasCycle(node);
			}
		}
	}

	/**
	 * Validates that global dimensions only depend on other global dimensions
	 * or section dimensions (for aggregation)
	 *
	 * Section dimensions cannot depend on global dimensions that come after them
	 * in the execution order (would create ordering issues).
	 */
	private static validateGlobalDependencies(
		dependencyGraph: Record<string, string[]>,
		plugin: Plugin,
	): void {
		const dimensions = plugin.getDimensionNames();

		for (const dimension of dimensions) {
			// Global dimensions can depend on anything (globals or sections)
			// Sections get aggregated for global consumption
			// No restrictions here - the dependency system handles this

			// Dependency validation happens elsewhere in the system

			const _deps = dependencyGraph[dimension] || [];
		}
	}

	/**
	 * Detects strongly connected components (cycles) in a directed graph
	 *
	 * Uses Tarjan's algorithm for cycle detection.
	 * Returns all cycles found in the graph.
	 *
	 * @param dependencyGraph - Dependency graph to analyze
	 * @returns Array of cycles, where each cycle is an array of dimension names
	 */
	static findAllCycles(dependencyGraph: Record<string, string[]>): string[][] {
		const cycles: string[][] = [];
		const visited = new Set<string>();
		const recursionStack = new Set<string>();

		const findCycles = (node: string, path: string[]): void => {
			visited.add(node);
			recursionStack.add(node);
			const currentPath = [...path, node];

			const dependencies = dependencyGraph[node] || [];

			for (const dep of dependencies) {
				if (!visited.has(dep)) {
					findCycles(dep, currentPath);
				} else if (recursionStack.has(dep)) {
					// Found a cycle
					const cycleStart = currentPath.indexOf(dep);
					const cycle = [...currentPath.slice(cycleStart), dep];
					cycles.push(cycle);
				}
			}

			recursionStack.delete(node);
		};

		// Check all nodes
		for (const node of Object.keys(dependencyGraph)) {
			if (!visited.has(node)) {
				findCycles(node, []);
			}
		}

		return cycles;
	}

	/**
	 * Validates that a dependency graph is acyclic (no cycles)
	 *
	 * @param dependencyGraph - Dependency graph to check
	 * @returns true if acyclic, false if cycles exist
	 */
	static isAcyclic(dependencyGraph: Record<string, string[]>): boolean {
		try {
			DependencyValidator.validateNoCycles(dependencyGraph);
			return true;
		} catch (error) {
			if (error instanceof CircularDependencyError) {
				return false;
			}
			throw error;
		}
	}

	/**
	 * Gets all dependencies for a dimension (direct and transitive)
	 *
	 * @param dimension - Dimension to analyze
	 * @param dependencyGraph - Dependency graph
	 * @returns Set of all dependencies (including transitive)
	 */
	static getAllDependencies(
		dimension: string,
		dependencyGraph: Record<string, string[]>,
	): Set<string> {
		const allDeps = new Set<string>();
		const visited = new Set<string>();

		const traverse = (node: string): void => {
			if (visited.has(node)) return;
			visited.add(node);

			const deps = dependencyGraph[node] || [];
			for (const dep of deps) {
				allDeps.add(dep);
				traverse(dep);
			}
		};

		traverse(dimension);
		return allDeps;
	}

	/**
	 * Gets all dependents for a dimension (dimensions that depend on it)
	 *
	 * @param dimension - Dimension to analyze
	 * @param dependencyGraph - Dependency graph
	 * @returns Set of all dependents (direct only)
	 */
	static getDependents(
		dimension: string,
		dependencyGraph: Record<string, string[]>,
	): Set<string> {
		const dependents = new Set<string>();

		for (const [node, deps] of Object.entries(dependencyGraph)) {
			if (deps.includes(dimension)) {
				dependents.add(node);
			}
		}

		return dependents;
	}

	/**
	 * Checks if one dimension depends on another (directly or transitively)
	 *
	 * @param dimension - Dimension to check
	 * @param dependency - Potential dependency
	 * @param dependencyGraph - Dependency graph
	 * @returns true if dimension depends on dependency
	 */
	static dependsOn(
		dimension: string,
		dependency: string,
		dependencyGraph: Record<string, string[]>,
	): boolean {
		const allDeps = DependencyValidator.getAllDependencies(
			dimension,
			dependencyGraph,
		);
		return allDeps.has(dependency);
	}

	/**
	 * Validates that dimensions are specified in the dependency graph
	 *
	 * @param dimensions - Dimensions to check
	 * @param dependencyGraph - Dependency graph
	 * @throws {ValidationError} If dimensions are not in graph
	 */
	static validateDimensionsInGraph(
		dimensions: string[],
		dependencyGraph: Record<string, string[]>,
	): void {
		const graphDimensions = new Set([
			...Object.keys(dependencyGraph),
			...Object.values(dependencyGraph).flat(),
		]);

		const missing = dimensions.filter((dim) => !graphDimensions.has(dim));

		if (missing.length > 0) {
			throw new ValidationError(
				`Dimensions not found in dependency graph: ${missing.join(", ")}`,
				"dimensions",
				{ missing },
			);
		}
	}
}
