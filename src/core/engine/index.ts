/**
 * Engine module exports
 *
 * Main engine and orchestration components.
 *
 * @module engine
 */

export { DagEngine } from './dag-engine.ts';
export { PhaseExecutor } from './phase-executor.ts';
export { StateManager } from './state-manager.ts';

export type {
    EngineConfig,
    ExecutionConfig,
} from './engine-config.ts';

export {
    DEFAULT_EXECUTION_CONFIG,
    mergeExecutionConfig,
    normalizeEngineConfig,
} from './engine-config.ts';