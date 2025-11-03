/**
 * DagEngine - AI-powered workflow orchestration
 *
 * Main entry point for the DAG execution engine.
 * Orchestrates the execution of AI dimensions across multiple sections
 * with dependency management, parallel execution, and comprehensive error handling.
 *
 * @module engine/dag-engine
 *
 * @example Basic Usage
 * ```typescript
 * const engine = new DagEngine({
 *   plugin: myPlugin,
 *   providers: myAdapter
 * });
 *
 * const result = await engine.process(sections);
 * console.log(result.sections);
 * console.log(result.globalResults);
 * ```
 *
 * @example Advanced Configuration
 * ```typescript
 * const engine = new DagEngine({
 *   plugin: myPlugin,
 *   providers: myAdapter,
 *   execution: {
 *     concurrency: 10,
 *     maxRetries: 5,
 *     timeout: 30000,
 *     continueOnError: false
 *   },
 *   pricing: {
 *     models: {
 *       'gpt-4': { inputPer1M: 30, outputPer1M: 60 }
 *     }
 *   }
 * });
 *
 * const result = await engine.process(sections, {
 *   onDimensionStart: (dim) => console.log(`Starting ${dim}`),
 *   onDimensionComplete: (dim, result) => console.log(`Completed ${dim}`)
 * });
 * ```
 */
import type PQueue from "p-queue";
import type { Plugin } from "../../plugin.js";
import {
	ProviderAdapter,
	type ProviderAdapterConfig,
} from "../../providers/adapter.js";
import { ProviderRegistry } from "../../providers/registry.js";

import { PhaseExecutor } from "../execution/phase-executor.js";
import { createProcessState } from "./state-manager.js";
import {
	type EngineConfig,
	mergeExecutionConfig,
	normalizeEngineConfig,
} from "./engine-config.js";
import { DependencyGraphManager } from "../analysis/graph-manager.js";
import { ConfigValidator } from "../validation/config-validator.js";
import type { GraphAnalytics } from "../analysis/graph-types.js";
import crypto from "crypto";
import type { ProgressUpdate } from "../../types";

import type { ProgressDisplayOptions } from "../execution/progress-display";
import type { ProcessOptions, ProcessResult, SectionData } from "../../types";

import { InngestOrchestrator } from "../../orchestration/inngest-orchestrator.js";
import type { PricingConfig } from "../../types";

export interface ExecutionConfig {
	concurrency: number;
	maxRetries: number;
	retryDelay: number;
	timeout: number;
	continueOnError: boolean;
	dimensionTimeouts: Record<string, number>;
	pricing?: PricingConfig;
}

/**
 * Provider initializer utility
 */
class ProviderInitializer {
	/**
	 * Initializes provider adapter from config
	 */
	static initialize(config: EngineConfig): ProviderAdapter {
		// Priority 1: providers field (multipurpose)
		if (config.providers) {
			const adapter = ProviderInitializer.createFromProviders(config.providers);
			// Validate immediately after creation
			ConfigValidator.validateProviderAdapter(adapter);
			return adapter;
		}

		// Priority 2: registry field (legacy)
		if (config.registry) {
			const adapter = ProviderInitializer.createFromRegistry(config.registry);
			// Validate immediately after creation
			ConfigValidator.validateProviderAdapter(adapter);
			return adapter;
		}

		// No providers configured
		throw new Error(
			'DagEngine requires either "providers" or "registry" in configuration',
		);
	}

	/**
	 * Creates adapter from providers field (handles all three types)
	 */
	private static createFromProviders(
		providers: ProviderAdapter | ProviderAdapterConfig | ProviderRegistry,
	): ProviderAdapter {
		// Case 1: Already a ProviderAdapter instance
		if (providers instanceof ProviderAdapter) {
			return providers;
		}

		// Case 2: ProviderRegistry instance
		if (providers instanceof ProviderRegistry) {
			return ProviderInitializer.createFromRegistry(providers);
		}

		// Case 3: ProviderAdapterConfig (plain object)
		return new ProviderAdapter(providers);
	}

	/**
	 * Creates adapter from registry
	 */
	private static createFromRegistry(
		registry: ProviderRegistry,
	): ProviderAdapter {
		const adapter = new ProviderAdapter({});
		const registryProviders = registry.list();

		for (const name of registryProviders) {
			const provider = registry.get(name);
			adapter.registerProvider(provider);
		}

		return adapter;
	}
}

/**
 * Graph export format
 */
export interface GraphExport {
	nodes: Array<{
		id: string;
		label: string;
		type: "global" | "section";
	}>;
	links: Array<{
		source: string;
		target: string;
	}>;
}

/**
 * DagEngine - Main orchestration engine
 *
 * Coordinates the execution of AI-powered workflows with:
 * - Automatic dependency resolution
 * - Parallel execution where possible
 * - Comprehensive error handling and retries
 * - Cost tracking and analytics
 * - Flexible plugin architecture
 */
export class DagEngine {
	private readonly plugin: Plugin;
	private readonly adapter: ProviderAdapter;
	private readonly phaseExecutor: PhaseExecutor;
	private readonly graphManager: DependencyGraphManager;
	private readonly inngestOrchestrator?: InngestOrchestrator;

	private readonly progressDisplayOptions?: ProgressDisplayOptions;
	private cachedDependencyGraph?: Record<string, string[]>;

	constructor(config: EngineConfig) {
		ConfigValidator.validate(config);
		const normalizedConfig = normalizeEngineConfig(config);

		this.plugin = normalizedConfig.plugin;
		this.adapter = ProviderInitializer.initialize(normalizedConfig);

		this.progressDisplayOptions = this.resolveProgressDisplay(
			config.progressDisplay,
		);

		const executionConfig = mergeExecutionConfig(normalizedConfig);

		this.graphManager = new DependencyGraphManager(this.plugin);
		this.phaseExecutor = new PhaseExecutor(
			this.plugin,
			this.adapter,
			executionConfig,
		);

		if (config.inngest?.enabled) {
			this.inngestOrchestrator = new InngestOrchestrator(
				this.phaseExecutor,
				config.inngest,
			);
		}
	}

	async process(
		sections: SectionData[],
		options: ProcessOptions = {},
	): Promise<ProcessResult> {
		if (this.inngestOrchestrator) {
			const processId = options.processId ?? crypto.randomUUID();
			return await this.inngestOrchestrator.execute({
				processId,
				sections,
				options,
			});
		}

		const mergedOptions: ProcessOptions = {
			...options,
			progressDisplay: options.progressDisplay ?? this.progressDisplayOptions,
		};

		const stateManager = createProcessState(sections);
		try {
			await this.phaseExecutor.preProcess(stateManager, mergedOptions);
			const plan = await this.phaseExecutor.planExecution(stateManager);

			this.cachedDependencyGraph = plan.dependencyGraph;

			await this.phaseExecutor.executeDimensions(
				stateManager,
				plan,
				mergedOptions,
			);
			const result = await this.phaseExecutor.finalizeResults(stateManager);
			return await this.phaseExecutor.postProcess(stateManager, result, plan);
		} catch (error) {
			return await this.phaseExecutor.handleFailure(stateManager, error);
		}
	}

	/**
	 * Get current progress (for polling)
	 * Returns undefined if not currently processing
	 */
	getProgress(): ProgressUpdate | undefined {
		return this.phaseExecutor.getProgressTracker()?.getProgress();
	}

	private resolveProgressDisplay(
		option: ProgressDisplayOptions | boolean | undefined,
	): ProgressDisplayOptions | undefined {
		if (option === undefined || option === false) {
			return undefined;
		}

		if (option === true) {
			return { display: "bar" };
		}

		return option;
	}

	/**
	 * Process sections using Inngest orchestration
	 *
	 * Explicitly use Inngest for long-running workflows with automatic
	 * checkpointing and resumption capabilities.
	 *
	 * @param sections - Sections to process
	 * @param options - Process options for hooks and callbacks
	 * @returns Process result with sections, global results, and costs
	 * @throws {Error} If Inngest is not enabled
	 *
	 * @example
	 * ```typescript
	 * const result = await engine.processWithInngest(sections, {
	 *   onDimensionStart: (dim) => console.log(`Starting ${dim}`)
	 * });
	 * ```
	 */
	async processWithInngest(
		sections: SectionData[],
		options: ProcessOptions = {},
	): Promise<ProcessResult> {
		if (!this.inngestOrchestrator) {
			throw new Error(
				"Inngest orchestrator is not enabled. " +
					"Initialize DagEngine with inngest: { enabled: true }",
			);
		}

		const processId = options.processId ?? crypto.randomUUID();

		// Delegate to Inngest orchestrator
		return await this.inngestOrchestrator.execute({
			processId,
			sections,
			options,
		});
	}

	// ============================================================================
	// GRAPH ANALYTICS API
	// ============================================================================

	/**
	 * Gets comprehensive graph analytics
	 *
	 * Provides insights into the dependency graph including:
	 * - Total dimensions and dependencies
	 * - Maximum depth and critical path
	 * - Parallel execution groups
	 * - Independent dimensions
	 * - Bottleneck identification
	 *
	 * @returns Graph analytics
	 *
	 * @example
	 * ```typescript
	 * const analytics = await engine.getGraphAnalytics();
	 *
	 * console.log('Total dimensions:', analytics.totalDimensions);
	 * console.log('Max depth:', analytics.maxDepth);
	 * console.log('Critical path:', analytics.criticalPath);
	 * console.log('Bottlenecks:', analytics.bottlenecks);
	 * ```
	 */
	async getGraphAnalytics(): Promise<GraphAnalytics> {
		const dimensions = this.plugin.getDimensionNames();
		const deps = this.cachedDependencyGraph ?? {};
		return this.graphManager.getAnalytics(dimensions, deps);
	}

	/**
	 * Exports dependency graph as DOT format for visualization
	 *
	 * Use with Graphviz or other DOT visualization tools.
	 *
	 * @returns DOT format string
	 *
	 * @example
	 * ```typescript
	 * const dot = await engine.exportGraphDOT();
	 *
	 * // Save to file
	 * await fs.writeFile('graph.dot', dot);
	 *
	 * // Render with Graphviz
	 * // dot -Tpng graph.dot -o graph.png
	 * ```
	 */
	async exportGraphDOT(): Promise<string> {
		const dimensions = this.plugin.getDimensionNames();
		const deps = this.cachedDependencyGraph ?? {};
		return this.graphManager.exportDOT(dimensions, deps);
	}

	/**
	 * Exports dependency graph as JSON for programmatic use
	 *
	 * @returns JSON graph with nodes and links
	 *
	 * @example
	 * ```typescript
	 * const graph = await engine.exportGraphJSON();
	 *
	 * console.log('Nodes:', graph.nodes);
	 * console.log('Links:', graph.links);
	 *
	 * // Use with D3.js, vis.js, etc.
	 * ```
	 */
	async exportGraphJSON(): Promise<GraphExport> {
		const dimensions = this.plugin.getDimensionNames();
		const deps = this.cachedDependencyGraph ?? {};
		return this.graphManager.exportJSON(dimensions, deps);
	}

	// ============================================================================
	// PROVIDER API
	// ============================================================================

	/**
	 * Gets the provider adapter instance
	 *
	 * @returns Provider adapter
	 *
	 * @example
	 * ```typescript
	 * const adapter = engine.getAdapter();
	 *
	 * // Register additional provider
	 * adapter.registerProvider(newProvider);
	 * ```
	 */
	getAdapter(): ProviderAdapter {
		return this.adapter;
	}

	/**
	 * Gets list of available provider names
	 *
	 * @returns Array of provider names
	 *
	 * @example
	 * ```typescript
	 * const providers = engine.getAvailableProviders();
	 * console.log('Available:', providers);
	 * // ['openai', 'anthropic', 'custom-provider']
	 * ```
	 */
	getAvailableProviders(): string[] {
		return this.adapter.listProviders();
	}

	// ============================================================================
	// QUEUE API (Advanced Usage)
	// ============================================================================

	/**
	 * Gets the internal execution queue
	 *
	 * Advanced usage only. Allows monitoring queue state.
	 *
	 * @returns PQueue instance
	 *
	 * @example
	 * ```typescript
	 * const queue = engine.getQueue();
	 * console.log('Queue size:', queue.size);
	 * console.log('Pending:', queue.pending);
	 * ```
	 */
	getQueue(): PQueue {
		return this.phaseExecutor.getQueue();
	}

	/**
	 * Gets the current execution configuration
	 *
	 * @returns Execution configuration
	 *
	 * @example
	 * ```typescript
	 * const config = engine.getExecutionConfig();
	 * console.log('Concurrency:', config.concurrency);
	 * console.log('Max retries:', config.maxRetries);
	 * ```
	 */
	getExecutionConfig(): ExecutionConfig {
		return {
			concurrency: this.phaseExecutor.config.concurrency,
			maxRetries: this.phaseExecutor.config.maxRetries,
			retryDelay: this.phaseExecutor.config.retryDelay,
			timeout: this.phaseExecutor.config.timeout,
			continueOnError: this.phaseExecutor.config.continueOnError,
			dimensionTimeouts: { ...this.phaseExecutor.config.dimensionTimeouts },
			pricing: this.phaseExecutor.config.pricing,
		};
	}
}
