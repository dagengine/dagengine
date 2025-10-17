/**
 * Inngest orchestration layer
 *
 * This is a PURE WRAPPER - it doesn't change any engine logic.
 * Creates and manages its own Inngest client internally.
 */
import type { InngestConfig } from "../core/engine/engine-config";
import type { PhaseExecutor } from "../core/execution/phase-executor.ts";
import {
	createProcessState,
	serializeState,
	deserializeState,
} from "../core/engine/state-manager";
import type { SectionData, ProcessOptions, ProcessResult } from "../types";
import { Inngest } from 'inngest';

// Extract types from Inngest
type InngestClient = Inngest;
type InngestStep = Parameters<Parameters<Inngest['createFunction']>[2]>[0]['step'];

interface InngestFunctionContext {
	event: {
		data: {
			processId: string;
			sections: SectionData[];
			options: ProcessOptions;
		};
	};
	step: InngestStep;
}

export class InngestOrchestrator {
	private readonly inngest: InngestClient;
	private readonly functionPrefix: string;

	constructor(
		private readonly phaseExecutor: PhaseExecutor,
		private readonly config: InngestConfig,
	) {
		// ✅ Create Inngest client internally
		this.inngest = this.createInngestClient(config);
		this.functionPrefix = config.functionPrefix || "dagengine";
	}

	/**
	 * Create Inngest client from config
	 * User doesn't need to import Inngest at all!
	 */
	private createInngestClient(config: InngestConfig) {
		// Lazy import Inngest (only loaded if enabled)
		let Inngest: any;

		try {
			// Dynamic import - only loads if user enables Inngest
			Inngest = require("inngest").Inngest;
		} catch (error) {
			throw new Error(
				"Inngest package not found. Install it with: npm install inngest\n" +
					"Or disable Inngest: inngest: { enabled: false }",
			);
		}

		// Create client with config
		const clientConfig: any = {
			id: config.functionPrefix || "dagengine",
			name: "DAG-AI Workflow Engine",
		};

		// Add event key if provided (for production)
		if (config.eventKey) {
			clientConfig.eventKey = config.eventKey;
		}

		// Add signing key if provided (for webhook security)
		if (config.signingKey) {
			clientConfig.signingKey = config.signingKey;
		}

		// Add custom base URL if provided
		if (config.baseUrl) {
			clientConfig.baseUrl = config.baseUrl;
		}

		return new Inngest(clientConfig);
	}

	/**
	 * Get Inngest client (for serve helper)
	 */
	getClient() {
		return this.inngest;
	}

	/**
	 * Get Inngest function definitions for registration
	 */
	getFunctions() {
		return [this.createWorkflowFunction()];
	}

	/**
	 * Execute workflow through Inngest
	 */
	async execute(params: {
		processId: string;
		sections: SectionData[];
		options: ProcessOptions;
	}): Promise<ProcessResult> {
		// Send event to Inngest
		await this.inngest.send({
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
	 * Create the main workflow Inngest function
	 */
	private createWorkflowFunction() {
		return this.inngest.createFunction(
			{
				id: `${this.functionPrefix}/workflow`,
				name: "DAG-AI Workflow",
			},
			{ event: `${this.functionPrefix}/workflow.execute` },
			async ({ event, step }: any) => {
				const { processId, sections, options } = event.data;

				// STEP 1: Initialize state
				const state = await step.run("initialize", async () => {
					const state = createProcessState(sections, options.metadata);
					return serializeState(state);
				});

				// STEP 2: Pre-process
				await step.run("pre-process", async () => {
					const deserializedState = deserializeState(state);
					await this.phaseExecutor.preProcess(deserializedState, options);
					return serializeState(deserializedState);
				});

				// STEP 3: Plan execution
				const plan = await step.run("plan-execution", async () => {
					const deserializedState = deserializeState(state);
					return await this.phaseExecutor.planExecution(
						deserializedState,
						options,
					);
				});

				// STEP 4: Execute dimensions (one step per group)
				for (let i = 0; i < plan.executionGroups.length; i++) {
					const group = plan.executionGroups[i];

					await step.run(`execute-group-${i}`, async () => {
						const deserializedState = deserializeState(state);

						// Execute just this group
						await this.executeSingleGroup(
							deserializedState,
							group,
							plan.dependencyGraph,
							options,
						);

						return serializeState(deserializedState);
					});
				}

				// STEP 5: Finalize results
				const result = await step.run("finalize", async () => {
					const deserializedState = deserializeState(state);
					return await this.phaseExecutor.finalizeResults(
						deserializedState,
						plan,
						options,
					);
				});

				// STEP 6: Post-process
				return await step.run("post-process", async () => {
					const deserializedState = deserializeState(state);
					return await this.phaseExecutor.postProcess(
						deserializedState,
						result,
						plan,
						options,
					);
				});
			},
		);
	}

	/**
	 * Execute a single dimension group
	 */
	private async executeSingleGroup(
		state: any,
		group: string[],
		dependencyGraph: Record<string, string[]>,
		options: ProcessOptions,
	): Promise<void> {
		const plugin = this.phaseExecutor.getPlugin();

		const globalDims = group.filter((dim) => plugin.isGlobalDimension(dim));
		const sectionDims = group.filter((dim) => !plugin.isGlobalDimension(dim));

		await this.phaseExecutor.executeGlobalDimensions(
			globalDims,
			state,
			dependencyGraph,
			options,
		);

		await this.phaseExecutor.executeSectionDimensions(
			sectionDims,
			state,
			dependencyGraph,
			options,
		);
	}

	private autoRegisterEndpoint(): void {
		// Create a singleton serve handler
		const serveHandler = this.createServeHandler();

		// Register globally for auto-discovery
		(global as any).__dagengine_inngest_serve = serveHandler;

		// Provide helpful message
		console.log(
			"\n✅ Inngest ready! Create endpoint:\n\n" +
				"   // app/api/inngest/route.ts (Next.js)\n" +
				'   import { serveInngest } from "@dagengine/core/inngest";\n' +
				"   export const { GET, POST, PUT } = serveInngest();\n",
		);
	}

	private createServeHandler() {
		let serve: any;

		// Try to load appropriate serve function
		try {
			serve = require("inngest/next").serve;
		} catch {
			try {
				serve = require("inngest/express").serve;
			} catch {
				throw new Error("Could not load Inngest serve adapter");
			}
		}

		return serve({
			client: this.inngest,
			functions: this.getFunctions(),
		});
	}
}
