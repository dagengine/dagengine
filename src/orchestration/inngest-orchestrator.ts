/**
 * Inngest orchestration layer
 *
 * Pure wrapper around Inngest that doesn't change any engine logic.
 * Creates and manages its own Inngest client internally.
 *
 * @module orchestration/inngest
 */

import type { InngestConfig } from "../core/engine/engine-config.js";
import type { PhaseExecutor } from "../core/execution/phase-executor.js";
import type { ProcessState } from "../core/shared/types.js";
import type {
	ExecutionPlan,
	SerializedProcessState,
} from "../core/shared/types.js";
import {
	createProcessState,
	serializeState,
	deserializeState,
} from "../core/engine/state-manager.js";
import type { SectionData, ProcessOptions, ProcessResult } from "../types.js";

/**
 * Workflow execution event data
 */
interface WorkflowEventData {
	processId: string;
	sections: SectionData[];
	options: ProcessOptions;
}

/**
 * Inngest orchestrator for distributed workflow execution
 *
 * Provides:
 * - Automatic Inngest client creation
 * - Checkpoint-based execution
 * - Step-by-step workflow orchestration
 * - State serialization/deserialization
 *
 * @note This module uses dynamic imports and types to support optional Inngest dependency
 */
export class InngestOrchestrator {
	private readonly inngest: unknown;
	private readonly functionPrefix: string;

	constructor(
		private readonly phaseExecutor: PhaseExecutor,
		private readonly config: InngestConfig,
	) {
		this.inngest = this.createInngestClient(config);
		this.functionPrefix = config.functionPrefix ?? "dagengine";
	}

	/**
	 * Get Inngest client instance
	 *
	 * @returns Inngest client for use with serve helpers
	 */
	getClient(): unknown {
		return this.inngest;
	}

	/**
	 * Get Inngest function definitions for registration
	 *
	 * @returns Array of Inngest functions
	 */
	getFunctions(): unknown[] {
		return [this.createWorkflowFunction()];
	}

	/**
	 * Execute workflow through Inngest (async)
	 *
	 * @param params - Workflow execution parameters
	 * @returns Immediate acknowledgment (workflow runs async)
	 */
	async execute(params: WorkflowEventData): Promise<ProcessResult> {
		const client = this.inngest as {
			send: (event: {
				name: string;
				data: unknown;
				id?: string;
			}) => Promise<{ ids: string[] }>;
		};

		// Send event to Inngest
		await client.send({
			name: `${this.functionPrefix}/workflow.execute`,
			data: params,
			id: params.processId, // Idempotency key
		});

		// Return immediately (async execution)
		return {
			sections: [],
			globalResults: {},
			transformedSections: [],
			metadata: {
				processId: params.processId,
				status: "processing",
				message: "Workflow started with Inngest",
			},
		};
	}

	/**
	 * Create serve handler for HTTP endpoints
	 *
	 * @returns Serve handler for Next.js/Express
	 */
	createServeHandler(): unknown {
		// Try Next.js serve adapter first
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { serve } = require("inngest/next");
			return serve({
				client: this.inngest,
				functions: this.getFunctions(),
			});
		} catch {
			// Fall back to Express adapter
			try {
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				const { serve } = require("inngest/express");
				return serve({
					client: this.inngest,
					functions: this.getFunctions(),
				});
			} catch {
				throw new Error(
					"Could not load Inngest serve adapter. " +
						"Install inngest with Next.js or Express support.",
				);
			}
		}
	}

	// ============================================================================
	// PRIVATE METHODS
	// ============================================================================

	/**
	 * Create Inngest client from configuration
	 *
	 * @param config - Inngest configuration
	 * @returns Configured Inngest client
	 * @throws Error if Inngest package not installed
	 */
	private createInngestClient(config: InngestConfig): unknown {
		let InngestClass: {
			new (config: { id: string; eventKey?: string }): unknown;
		};

		try {
			// Dynamic import - only loads if user enables Inngest
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			InngestClass = require("inngest").Inngest;
		} catch {
			throw new Error(
				"Inngest package not found. Install it with: npm install inngest\n" +
					"Or disable Inngest: inngest: { enabled: false }",
			);
		}

		// Build client configuration (Inngest v3 API)
		const clientConfig: {
			id: string;
			eventKey?: string;
		} = {
			id: config.functionPrefix ?? "dagengine",
		};

		// Add event key if provided (for production)
		if (config.eventKey) {
			clientConfig.eventKey = config.eventKey;
		}

		return new InngestClass(clientConfig);
	}

	/**
	 * Create the main workflow Inngest function
	 *
	 * @returns Inngest function definition
	 */
	private createWorkflowFunction(): unknown {
		const client = this.inngest as {
			createFunction: (
				config: { id: string; name: string },
				trigger: { event: string },
				handler: (context: {
					event: { data: WorkflowEventData };
					step: {
						run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
					};
				}) => Promise<ProcessResult>,
			) => unknown;
		};

		return client.createFunction(
			{
				id: `${this.functionPrefix}/workflow`,
				name: "DAG-AI Workflow",
			},
			{ event: `${this.functionPrefix}/workflow.execute` },
			async ({ event, step }) => {
				const { sections, options } = event.data;

				// STEP 1: Initialize state
				const serializedState = await step.run(
					"initialize",
					async (): Promise<SerializedProcessState> => {
						const state = createProcessState(sections, options.metadata);
						return serializeState(state);
					},
				);

				// STEP 2: Pre-process
				await step.run(
					"pre-process",
					async (): Promise<SerializedProcessState> => {
						const state = deserializeState(serializedState);
						await this.phaseExecutor.preProcess(state, options);
						return serializeState(state);
					},
				);

				// STEP 3: Plan execution
				const plan = await step.run(
					"plan-execution",
					async (): Promise<ExecutionPlan> => {
						const state = deserializeState(serializedState);
						return await this.phaseExecutor.planExecution(state);
					},
				);

				// STEP 4: Execute dimensions (one step per group)
				for (let i = 0; i < plan.executionGroups.length; i++) {
					const group = plan.executionGroups[i];
					if (!group) continue;

					await step.run(
						`execute-group-${i}`,
						async (): Promise<SerializedProcessState> => {
							const state = deserializeState(serializedState);

							// Execute just this group
							await this.executeSingleGroup(
								state,
								group,
								plan.dependencyGraph,
								options,
							);

							return serializeState(state);
						},
					);
				}

				// STEP 5: Finalize results
				const result = await step.run(
					"finalize",
					async (): Promise<ProcessResult> => {
						const state = deserializeState(serializedState);
						return await this.phaseExecutor.finalizeResults(state);
					},
				);

				// STEP 6: Post-process
				return await step.run(
					"post-process",
					async (): Promise<ProcessResult> => {
						const state = deserializeState(serializedState);
						return await this.phaseExecutor.postProcess(state, result, plan);
					},
				);
			},
		);
	}

	/**
	 * Execute a single dimension group
	 *
	 * @param state - Current process state
	 * @param group - Dimension names to execute
	 * @param dependencyGraph - Full dependency graph
	 * @param options - Process options
	 */
	private async executeSingleGroup(
		state: ProcessState,
		group: string[],
		dependencyGraph: Record<string, string[]>,
		options: ProcessOptions,
	): Promise<void> {
		const plugin = this.phaseExecutor.getPlugin();

		// Separate global and section dimensions
		const globalDims = group.filter((dim) => plugin.isGlobalDimension(dim));
		const sectionDims = group.filter((dim) => !plugin.isGlobalDimension(dim));

		// Execute global dimensions first
		await this.phaseExecutor.executeGlobalDimensions(
			globalDims,
			state,
			dependencyGraph,
			options,
		);

		// Then execute section dimensions
		await this.phaseExecutor.executeSectionDimensions(
			sectionDims,
			state,
			dependencyGraph,
			options,
		);
	}
}
