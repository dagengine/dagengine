import graphlib, { Graph } from "@dagrejs/graphlib";
const alg = graphlib.alg;

import type { Plugin } from "../plugin.ts";
import {
	CircularDependencyError,
	ExecutionGroupingError,
} from "./shared/errors.ts";

/**
 * Graph analytics interface
 */
export interface GraphAnalytics {
	totalDimensions: number;
	totalDependencies: number;
	maxDepth: number;
	criticalPath: string[];
	parallelGroups: string[][];
	independentDimensions: string[];
	bottlenecks: string[];
}

/**
 * Graph node for JSON export
 */
interface GraphNode {
	id: string;
	label: string;
	type: "global" | "section";
}

/**
 * Graph link for JSON export
 */
interface GraphLink {
	source: string;
	target: string;
}

/**
 * Graph export format
 */
export interface GraphExport {
	nodes: GraphNode[];
	links: GraphLink[];
}

/**
 * Bottleneck information
 */
interface Bottleneck {
	dim: string;
	dependents: number;
}

/**
 * Manages dependency graph operations, analytics, and exports
 */
export class DependencyGraphManager {
	private graph?: Graph;

	constructor(private readonly plugin: Plugin) {}

	/**
	 * Perform topological sort and build dependency graph
	 *
	 * @param dimensions - All dimension names
	 * @param dependencies - Dependency graph
	 * @returns Topologically sorted dimension names
	 * @throws {CircularDependencyError} If cycles detected
	 */
	async buildAndSort(
		dimensions: string[],
		dependencies: Record<string, string[]>,
	): Promise<string[]> {
		const graph = new Graph();

		// Add all nodes
		dimensions.forEach((dim) => graph.setNode(dim));

		// Add edges based on dependencies
		Object.entries(dependencies).forEach(([node, nodeDeps]) => {
			nodeDeps.forEach((dep) => {
				if (dimensions.includes(dep)) {
					graph.setEdge(dep, node);
				}
			});
		});

		// Check for cycles
		this.validateAcyclic(graph);

		// Cache the graph
		this.graph = graph;

		// Return sorted dimensions
		return alg.topsort(graph);
	}

	/**
	 * Group dimensions for parallel execution
	 *
	 * Returns batches where dimensions in each batch can run in parallel.
	 *
	 * @param dimensions - Sorted dimension names
	 * @param dependencies - Dependency graph
	 * @returns Array of execution groups
	 * @throws {ExecutionGroupingError} If grouping fails
	 */
	groupForParallelExecution(
		dimensions: string[],
		dependencies: Record<string, string[]>,
	): string[][] {
		const groups: string[][] = [];
		const processed = new Set<string>();
		const remaining = [...dimensions];
		const validDimensions = new Set(dimensions);

		while (remaining.length > 0) {
			const currentGroup: string[] = [];

			// Find dimensions whose dependencies are all processed
			for (const dim of remaining) {
				const dimDeps = dependencies[dim] ?? [];
				const validDeps = dimDeps.filter((dep) => validDimensions.has(dep));
				const allDepsProcessed = validDeps.every((dep) => processed.has(dep));

				if (allDepsProcessed) {
					currentGroup.push(dim);
				}
			}

			// Ensure progress is being made
			if (currentGroup.length === 0) {
				throw this.createGroupingError(
					remaining,
					dependencies,
					processed,
					validDimensions,
				);
			}

			groups.push(currentGroup);

			// Mark as processed and remove from remaining
			currentGroup.forEach((dim) => {
				processed.add(dim);
				const idx = remaining.indexOf(dim);
				if (idx !== -1) {
					remaining.splice(idx, 1);
				}
			});
		}

		return groups;
	}

	/**
	 * Get comprehensive graph analytics
	 *
	 * @param dimensions - All dimension names
	 * @param dependencies - Dependency graph
	 * @returns Graph analytics
	 */
	async getAnalytics(
		dimensions: string[],
		dependencies: Record<string, string[]>,
	): Promise<GraphAnalytics> {
		// Ensure graph is built
		if (!this.graph) {
			await this.buildAndSort(dimensions, dependencies);
		}

		const graph = this.graph!;

		const totalDependencies = Object.values(dependencies).reduce(
			(sum, depList) => sum + depList.length,
			0,
		);

		const independentDimensions = dimensions.filter((dim) => {
			const dimDeps = dependencies[dim] ?? [];
			return dimDeps.length === 0;
		});

		const { maxDepth, criticalPath } = this.findCriticalPath(graph, dimensions);
		const parallelGroups = this.findParallelGroups(dimensions, dependencies);
		const bottlenecks = this.findBottlenecks(graph, dimensions);

		return {
			totalDimensions: dimensions.length,
			totalDependencies,
			maxDepth,
			criticalPath,
			parallelGroups,
			independentDimensions,
			bottlenecks,
		};
	}

	/**
	 * Export graph as DOT format for visualization
	 *
	 * @param dimensions - All dimension names
	 * @param dependencies - Dependency graph
	 * @returns DOT format string
	 */
	async exportDOT(
		dimensions: string[],
		dependencies: Record<string, string[]>,
	): Promise<string> {
		if (!this.graph) {
			await this.buildAndSort(dimensions, dependencies);
		}

		const graph = this.graph!;
		const lines: string[] = [
			"digraph DagWorkflow {",
			"  rankdir=LR;",
			"  node [shape=box, style=rounded];",
			"",
		];

		// Add nodes with styling
		dimensions.forEach((dim) => {
			const isGlobal = this.plugin.isGlobalDimension(dim);
			const color = isGlobal ? "lightblue" : "lightgreen";
			const shape = isGlobal ? "box" : "ellipse";
			lines.push(
				`  "${dim}" [fillcolor="${color}", style="filled", shape="${shape}"];`,
			);
		});

		lines.push("");

		// Add edges
		graph.edges().forEach((edge) => {
			lines.push(`  "${edge.v}" -> "${edge.w}";`);
		});

		lines.push("}");

		return lines.join("\n");
	}

	/**
	 * Export graph as JSON for programmatic use
	 *
	 * @param dimensions - All dimension names
	 * @param dependencies - Dependency graph
	 * @returns JSON graph export
	 */
	async exportJSON(
		dimensions: string[],
		dependencies: Record<string, string[]>,
	): Promise<GraphExport> {
		if (!this.graph) {
			await this.buildAndSort(dimensions, dependencies);
		}

		const graph = this.graph!;

		const nodes: GraphNode[] = dimensions.map((dim) => ({
			id: dim,
			label: dim,
			type: this.plugin.isGlobalDimension(dim) ? "global" : "section",
		}));

		const links: GraphLink[] = graph.edges().map((edge) => ({
			source: edge.v,
			target: edge.w,
		}));

		return { nodes, links };
	}

	/**
	 * Get the internal graph instance
	 *
	 * @returns Graph instance or undefined if not built yet
	 */
	getGraph(): Graph | undefined {
		return this.graph;
	}

	// ============================================================================
	// PRIVATE HELPER METHODS
	// ============================================================================

	/**
	 * Validate that the graph is acyclic
	 *
	 * @param graph - Graph to validate
	 * @throws {CircularDependencyError} If cycles detected
	 */
	private validateAcyclic(graph: Graph): void {
		if (!alg.isAcyclic(graph)) {
			const cycles = alg.findCycles(graph);
			const cycle = cycles[0];
			if (cycle) {
				throw new CircularDependencyError(cycle);
			}
			// Fallback if no cycle found (shouldn't happen)
			throw new CircularDependencyError([]);
		}
	}

	/**
	 * Create a detailed grouping error
	 *
	 * @param remaining - Dimensions that couldn't be grouped
	 * @param dependencies - Dependency graph
	 * @param processed - Already processed dimensions
	 * @param validDimensions - Valid dimension names
	 * @returns Execution grouping error
	 */
	private createGroupingError(
		remaining: string[],
		dependencies: Record<string, string[]>,
		processed: Set<string>,
		validDimensions: Set<string>,
	): ExecutionGroupingError {
		const stuckDimensions = remaining.map((dim) => {
			const dimDeps = dependencies[dim] ?? [];
			const validDeps = dimDeps.filter((dep) => validDimensions.has(dep));
			const unmetDeps = validDeps.filter((dep) => !processed.has(dep));
			return `${dim} (waiting for: ${unmetDeps.join(", ") || "none"})`;
		});

		return new ExecutionGroupingError(remaining, {
			stuck: stuckDimensions,
			processed: Array.from(processed),
		});
	}

	/**
	 * Find the critical path in the graph
	 *
	 * @param graph - Dependency graph
	 * @param dimensions - All dimension names
	 * @returns Maximum depth and critical path
	 */
	private findCriticalPath(
		graph: Graph,
		dimensions: string[],
	): { maxDepth: number; criticalPath: string[] } {
		let maxDepth = 0;
		let criticalPath: string[] = [];

		dimensions.forEach((dim) => {
			const path = this.getLongestPath(graph, dim);
			if (path.length > maxDepth) {
				maxDepth = path.length;
				criticalPath = path;
			}
		});

		return { maxDepth, criticalPath };
	}

	/**
	 * Get the longest path to a node
	 *
	 * @param graph - Dependency graph
	 * @param endNode - End node to find path to
	 * @returns Longest path as array of dimension names
	 */
	private getLongestPath(graph: Graph, endNode: string): string[] {
		const paths: string[][] = [];

		const findPaths = (node: string, currentPath: string[] = []): void => {
			const newPath = [...currentPath, node];
			const predecessors = graph.predecessors(node) ?? [];

			if (predecessors.length === 0) {
				paths.push(newPath);
				return;
			}

			predecessors.forEach((pred) => {
				findPaths(pred, newPath);
			});
		};

		findPaths(endNode);

		return paths
			.reduce(
				(longest, current) =>
					current.length > longest.length ? current : longest,
				[],
			)
			.reverse();
	}

	/**
	 * Find groups of dimensions with identical dependencies
	 *
	 * @param dimensions - All dimension names
	 * @param dependencies - Dependency graph
	 * @returns Groups of dimensions that can run in parallel
	 */
	private findParallelGroups(
		dimensions: string[],
		dependencies: Record<string, string[]>,
	): string[][] {
		const groups: string[][] = [];
		const processed = new Set<string>();

		for (const dim of dimensions) {
			if (processed.has(dim)) continue;

			const dimDeps = dependencies[dim] ?? [];
			const group = [dim];
			processed.add(dim);

			// Find dimensions with identical dependencies
			for (const other of dimensions) {
				if (processed.has(other)) continue;

				const otherDeps = dependencies[other] ?? [];

				if (this.hasSameDependencies(dimDeps, otherDeps)) {
					group.push(other);
					processed.add(other);
				}
			}

			if (group.length > 1) {
				groups.push(group);
			}
		}

		return groups;
	}

	/**
	 * Check if two dependency arrays are identical
	 *
	 * @param deps1 - First dependency array
	 * @param deps2 - Second dependency array
	 * @returns True if dependencies are the same
	 */
	private hasSameDependencies(deps1: string[], deps2: string[]): boolean {
		return (
			deps1.length === deps2.length && deps1.every((d) => deps2.includes(d))
		);
	}

	/**
	 * Find bottleneck dimensions (many dependents)
	 *
	 * @param graph - Dependency graph
	 * @param dimensions - All dimension names
	 * @returns Array of bottleneck dimension names, sorted by impact
	 */
	private findBottlenecks(graph: Graph, dimensions: string[]): string[] {
		const bottlenecks: Bottleneck[] = [];
		const BOTTLENECK_THRESHOLD = 3;

		dimensions.forEach((dim) => {
			const successors = graph.successors(dim) ?? [];
			if (successors.length >= BOTTLENECK_THRESHOLD) {
				bottlenecks.push({ dim, dependents: successors.length });
			}
		});

		return bottlenecks
			.sort((a, b) => b.dependents - a.dependents)
			.map((b) => b.dim);
	}
}

// Re-export ExecutionPlan from shared types
export type { ExecutionPlan } from "./shared/types.ts";
