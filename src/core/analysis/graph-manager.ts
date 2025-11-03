/**
 * Dependency graph manager
 *
 * Manages dependency graph operations, analytics, and exports.
 *
 * @module analysis/graph-manager
 */

import graphlib, { Graph } from "@dagrejs/graphlib";
const alg = graphlib.alg;
import type { Plugin } from "../../plugin.js";
import type { GraphAnalytics, GraphExport } from "./graph-types.js";
import {
	CircularDependencyError,
	ExecutionGroupingError,
} from "../shared/errors.js";

/**
 * Manages dependency graph operations, analytics, and exports
 *
 * Provides:
 * - Topological sorting with cycle detection
 * - Parallel execution grouping
 * - Comprehensive graph analytics
 * - Export to DOT and JSON formats
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
				const dimDeps = dependencies[dim] || [];
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
			const dimDeps = dependencies[dim] || [];
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
		let dot = "digraph DagWorkflow {\n";
		dot += "  rankdir=LR;\n";
		dot += "  node [shape=box, style=rounded];\n\n";

		// Add nodes with styling
		dimensions.forEach((dim) => {
			const isGlobal = this.plugin.isGlobalDimension(dim);
			const color = isGlobal ? "lightblue" : "lightgreen";
			const shape = isGlobal ? "box" : "ellipse";
			dot += `  "${dim}" [fillcolor="${color}", style="filled", shape="${shape}"];\n`;
		});

		dot += "\n";

		// Add edges
		graph.edges().forEach((edge) => {
			dot += `  "${edge.v}" -> "${edge.w}";\n`;
		});

		dot += "}\n";
		return dot;
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

		const nodes = dimensions.map((dim) => ({
			id: dim,
			label: dim,
			type: this.plugin.isGlobalDimension(dim)
				? ("global" as const)
				: ("section" as const),
		}));

		const links = graph.edges().map((edge) => ({
			source: edge.v,
			target: edge.w,
		}));

		return { nodes, links };
	}

	/**
	 * Get the internal graph instance
	 */
	getGraph(): Graph | undefined {
		return this.graph;
	}

	// ===== Private Helper Methods =====

	private validateAcyclic(graph: Graph): void {
		if (!alg.isAcyclic(graph)) {
			const cycles = alg.findCycles(graph);
			throw new CircularDependencyError(cycles[0] || []);
		}
	}

	private createGroupingError(
		remaining: string[],
		dependencies: Record<string, string[]>,
		processed: Set<string>,
		validDimensions: Set<string>,
	): ExecutionGroupingError {
		const stuckDimensions = remaining.map((dim) => {
			const dimDeps = dependencies[dim] || [];
			const validDeps = dimDeps.filter((dep) => validDimensions.has(dep));
			const unmetDeps = validDeps.filter((dep) => !processed.has(dep));
			return `${dim} (waiting for: ${unmetDeps.join(", ") || "none"})`;
		});

		return new ExecutionGroupingError(remaining, {
			stuck: stuckDimensions,
			processed: Array.from(processed),
		});
	}

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

	private getLongestPath(graph: Graph, endNode: string): string[] {
		const paths: string[][] = [];

		const findPaths = (node: string, currentPath: string[] = []): void => {
			const newPath = [...currentPath, node];
			const predecessors = graph.predecessors(node) || [];

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

	private findParallelGroups(
		dimensions: string[],
		dependencies: Record<string, string[]>,
	): string[][] {
		const groups: string[][] = [];
		const processed = new Set<string>();

		for (const dim of dimensions) {
			if (processed.has(dim)) continue;

			const dimDeps = dependencies[dim] || [];
			const group = [dim];
			processed.add(dim);

			// Find dimensions with identical dependencies
			for (const other of dimensions) {
				if (processed.has(other)) continue;

				const otherDeps = dependencies[other] || [];

				if (
					dimDeps.length === otherDeps.length &&
					dimDeps.every((d) => otherDeps.includes(d))
				) {
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

	private findBottlenecks(graph: Graph, dimensions: string[]): string[] {
		const bottlenecks: Array<{ dim: string; dependents: number }> = [];

		dimensions.forEach((dim) => {
			const successors = graph.successors(dim) || [];
			if (successors.length >= 3) {
				bottlenecks.push({ dim, dependents: successors.length });
			}
		});

		return bottlenecks
			.sort((a, b) => b.dependents - a.dependents)
			.map((b) => b.dim);
	}
}
