/**
 * @module @dagengine/core
 *
 * Core engine for orchestrating AI-powered workflows with dependency management.
 *
 * @example Basic Usage
 * ```typescript
 * import { DagEngine } from '@dagengine/core';
 *
 * const engine = new DagEngine({
 *   plugin: myPlugin,
 *   providers: myAdapter,
 *   execution: {
 *     concurrency: 10,
 *     timeout: 30000
 *   }
 * });
 *
 * const result = await engine.process(sections);
 * ```
 *
 * @example With Pricing
 * ```typescript
 * const engine = new DagEngine({
 *   plugin: myPlugin,
 *   providers: myAdapter,
 *   pricing: {
 *     models: {
 *       'gpt-4': { inputPer1M: 30, outputPer1M: 60 }
 *     }
 *   }
 * });
 *
 * const result = await engine.process(sections);
 * console.log(result.costs?.totalCost);
 * ```
 */

// ============================================================================
// MAIN ENGINE
// ============================================================================

export { DagEngine } from "./engine/dag-engine.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

export type { EngineConfig, ExecutionConfig } from "./engine/engine-config.js";

export { DEFAULT_EXECUTION_CONFIG } from "./engine/engine-config.js";

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

// ============================================================================
// CORE TYPES
// ============================================================================

export type {
	// State
	ProcessState,
	ExecutionPlan,
	// Results
	SectionResultPair,
	// Skip checks
	SkipCheckResult,
	// Provider tracking
	ProviderAttempt,
	AttemptRecord,
} from "./shared/types.js";

// Type guards
export {
	isSkipWithResult,
	isErrorResult,
	isSuccessResult,
} from "./shared/types.js";

// ============================================================================
// ERROR CLASSES
// ============================================================================

export {
	// Base
	DagEngineError,
	// Configuration
	ConfigurationError,
	NoProvidersError,
	NoSectionsError,
	// Dependencies
	CircularDependencyError,
	DependencyError,
	DependencyNotFoundError,
	// Execution
	DimensionTimeoutError,
	ExecutionGroupingError,
	// Providers
	ProviderNotFoundError,
	AllProvidersFailed,
	// Validation
	ValidationError,
	// Utilities
	isDagEngineError,
	normalizeError,
	getErrorMessage,
	createContextError,
} from "./shared/errors.js";

// ============================================================================
// CONSTANTS
// ============================================================================

export {
	DEFAULT_ENGINE_CONFIG,
	ERROR_MESSAGES,
	SKIP_REASONS,
	METADATA_KEYS,
	TIMING,
	VALIDATION,
} from "./shared/constants.js";

export type { SkipReason, MetadataKey } from "./shared/constants.js";

// ============================================================================
// ANALYSIS & ANALYTICS
// ============================================================================

export type {
	GraphAnalytics,
	GraphExport,
	GraphNode,
	GraphLink,
	DotExportOptions,
	GraphStatistics,
} from "./analysis/graph-types.js";

export { CostCalculator } from "./analysis/cost-calculator.js";

export { DependencyGraphManager } from "./analysis/graph-manager.js";

// ============================================================================
// EXECUTION COMPONENTS (Advanced Usage)
// ============================================================================

export { DimensionExecutor } from "./execution/dimension-executor.js";

export { DependencyResolver } from "./execution/dependency-resolver.js";

export { TransformationManager } from "./execution/transformation-manager.js";

export { ProviderExecutor } from "./execution/provider-executor.js";

// ============================================================================
// LIFECYCLE HOOKS (Advanced Usage)
// ============================================================================

export { HookExecutor } from "./lifecycle/hook-executor.js";

// ============================================================================
// VALIDATION (Advanced Usage)
// ============================================================================

export { ConfigValidator } from "./validation/config-validator.js";

export { DependencyValidator } from "./validation/dependency-validator.js";

// ============================================================================
// UTILITIES (Advanced Usage)
// ============================================================================

export {
	// Dependencies
	hasFailedDependencies,
	getFailedDependencies,
	// Results
	countSuccessful,
	countFailed,
	// State
	resetSectionResultsMap,
	applyFinalizedResults,
	// Timeouts
	executeWithTimeout,
	createTimeoutPromise,
} from "./shared/utils.js";
