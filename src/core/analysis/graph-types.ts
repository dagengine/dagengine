/**
 * Graph analytics types
 *
 * Type definitions for dependency graph analysis, visualization,
 * and export formats.
 *
 * @module analysis/graph-types
 */

// ============================================================================
// GRAPH ANALYTICS
// ============================================================================

/**
 * Comprehensive graph analytics
 *
 * Provides insights into the dependency graph structure including:
 * - Dimension and dependency counts
 * - Execution depth and critical path
 * - Parallelization opportunities
 * - Performance bottlenecks
 *
 * @example
 * ```typescript
 * const analytics = await engine.getGraphAnalytics();
 *
 * console.log('Total dimensions:', analytics.totalDimensions);
 * console.log('Max depth:', analytics.maxDepth);
 * console.log('Critical path:', analytics.criticalPath.join(' → '));
 * console.log('Can run in parallel:', analytics.parallelGroups);
 * console.log('Bottlenecks:', analytics.bottlenecks);
 * ```
 */
export interface GraphAnalytics {
	/**
	 * Total number of dimensions in the graph
	 */
	totalDimensions: number;

	/**
	 * Total number of dependencies (edges) in the graph
	 */
	totalDependencies: number;

	/**
	 * Maximum depth of the dependency chain
	 *
	 * Represents the longest path from a root node to a leaf.
	 * Higher values indicate deeper nesting and longer minimum execution time.
	 */
	maxDepth: number;

	/**
	 * Critical path through the graph
	 *
	 * The longest chain of dependencies that determines minimum execution time.
	 * Optimizing dimensions on this path has the most impact on performance.
	 *
	 * @example ['root', 'summary', 'sentiment', 'final-report']
	 */
	criticalPath: string[];

	/**
	 * Groups of dimensions that can execute in parallel
	 *
	 * Each group contains dimensions with identical dependencies,
	 * meaning they can safely run simultaneously.
	 *
	 * @example
	 * [
	 *   ['tags', 'categories'],  // Both depend on 'summary'
	 *   ['sentiment', 'tone']     // Both depend on 'tags'
	 * ]
	 */
	parallelGroups: string[][];

	/**
	 * Dimensions with no dependencies
	 *
	 * These can execute immediately at process start.
	 *
	 * @example ['summary', 'metadata']
	 */
	independentDimensions: string[];

	/**
	 * Bottleneck dimensions
	 *
	 * Dimensions that many other dimensions depend on.
	 * Delays in these dimensions cascade to many dependents.
	 * Sorted by number of dependents (descending).
	 *
	 * @example ['summary', 'tags']  // Many dimensions depend on these
	 */
	bottlenecks: string[];
}

// ============================================================================
// GRAPH EXPORT FORMATS
// ============================================================================

/**
 * Graph node in export format
 */
export interface GraphNode {
	/**
	 * Unique node identifier (dimension name)
	 */
	id: string;

	/**
	 * Display label for the node
	 */
	label: string;

	/**
	 * Node type
	 */
	type: "global" | "section";

	/**
	 * Optional additional metadata
	 */
	metadata?: {
		/**
		 * Whether this dimension has dependencies
		 */
		hasDependencies?: boolean;

		/**
		 * Number of direct dependencies
		 */
		dependencyCount?: number;

		/**
		 * Number of dimensions that depend on this one
		 */
		dependentCount?: number;

		/**
		 * Whether this is a bottleneck
		 */
		isBottleneck?: boolean;
	};
}

/**
 * Graph link (edge) in export format
 */
export interface GraphLink {
	/**
	 * Source node ID (the dependency)
	 */
	source: string;

	/**
	 * Target node ID (the dependent)
	 */
	target: string;

	/**
	 * Optional link metadata
	 */
	metadata?: {
		/**
		 * Link type or relationship
		 */
		type?: string;

		/**
		 * Link weight or importance
		 */
		weight?: number;
	};
}

/**
 * Complete graph export in JSON format
 *
 * Compatible with visualization libraries like D3.js, vis.js, Cytoscape, etc.
 *
 * @example
 * ```typescript
 * const graph = await engine.exportGraphJSON();
 *
 * // Use with D3.js
 * const simulation = d3.forceSimulation(graph.nodes)
 *   .force("link", d3.forceLink(graph.links).id(d => d.id));
 *
 * // Use with vis.js
 * const network = new vis.Network(container, graph, options);
 * ```
 */
export interface GraphExport {
	/**
	 * Array of nodes (dimensions)
	 */
	nodes: GraphNode[];

	/**
	 * Array of links (dependencies)
	 */
	links: GraphLink[];

	/**
	 * Optional graph metadata
	 */
	metadata?: {
		/**
		 * Graph name or title
		 */
		name?: string;

		/**
		 * Graph description
		 */
		description?: string;

		/**
		 * Creation timestamp
		 */
		timestamp?: number;

		/**
		 * Analytics summary
		 */
		analytics?: GraphAnalytics;
	};
}

// ============================================================================
// DOT FORMAT TYPES
// ============================================================================

/**
 * DOT graph export options
 */
export interface DotExportOptions {
	/**
	 * Graph direction
	 * @default 'LR' (left to right)
	 */
	rankdir?: "TB" | "BT" | "LR" | "RL";

	/**
	 * Whether to include node styling
	 * @default true
	 */
	includeStyles?: boolean;

	/**
	 * Custom node attributes
	 */
	nodeAttributes?: Record<string, string>;

	/**
	 * Custom edge attributes
	 */
	edgeAttributes?: Record<string, string>;

	/**
	 * Graph title
	 */
	title?: string;
}

// ============================================================================
// GRAPH STATISTICS
// ============================================================================

/**
 * Detailed graph statistics
 */
export interface GraphStatistics {
	/**
	 * Node statistics
	 */
	nodes: {
		total: number;
		global: number;
		section: number;
		independent: number;
		bottlenecks: number;
	};

	/**
	 * Edge statistics
	 */
	edges: {
		total: number;
		averagePerNode: number;
		maxPerNode: number;
		minPerNode: number;
	};

	/**
	 * Depth statistics
	 */
	depth: {
		max: number;
		average: number;
		distribution: Record<number, number>;
	};

	/**
	 * Parallelization potential
	 */
	parallelization: {
		maxConcurrency: number;
		averageGroupSize: number;
		totalGroups: number;
	};

	/**
	 * Complexity metrics
	 */
	complexity: {
		/**
		 * Graph density (edges / possible edges)
		 */
		density: number;

		/**
		 * Average clustering coefficient
		 */
		clustering: number;

		/**
		 * Whether the graph is a DAG (should always be true)
		 */
		isAcyclic: boolean;
	};
}
