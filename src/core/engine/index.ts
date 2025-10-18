/**
 * Engine module exports
 *
 * Main engine and orchestration components.
 *
 * @module engine
 */

export { DagEngine } from "./dag-engine.js";
export { PhaseExecutor } from "../execution/phase-executor.js";

export type { EngineConfig, ExecutionConfig } from "./engine-config.js";

export {
	DEFAULT_EXECUTION_CONFIG,
	mergeExecutionConfig,
	normalizeEngineConfig,
} from "./engine-config.js";
