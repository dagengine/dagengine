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

export { DagEngine } from "./engine/dag-engine.ts";

// ============================================================================
// CONFIGURATION
// ============================================================================

export type {
	EngineConfig,
	ExecutionConfig,
} from "./engine/engine-config.ts";

export { DEFAULT_EXECUTION_CONFIG } from "./engine/engine-config.ts";

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
} from "./shared/types.ts";

// Type guards
export {
	isSkipWithResult,
	isErrorResult,
	isSuccessResult,
} from "./shared/types.ts";

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
} from "./shared/errors.ts";

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
} from "./shared/constants.ts";

export type {
	SkipReason,
	MetadataKey,
} from "./shared/constants.ts";

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
} from "./analysis/graph-types.ts";

export { CostCalculator } from "./analysis/cost-calculator.ts";

export { DependencyGraphManager } from "./analysis/graph-manager.ts";

// ============================================================================
// EXECUTION COMPONENTS (Advanced Usage)
// ============================================================================

export { DimensionExecutor } from "./execution/dimension-executor.ts";

export { DependencyResolver } from "./execution/dependency-resolver.ts";

export { TransformationManager } from "./execution/transformation-manager.ts";

export { ProviderExecutor } from "./execution/provider-executor.ts";

// ============================================================================
// LIFECYCLE HOOKS (Advanced Usage)
// ============================================================================

export { HookExecutor } from "./lifecycle/hook-executor.ts";

// ============================================================================
// VALIDATION (Advanced Usage)
// ============================================================================

export { ConfigValidator } from "./validation/config-validator.ts";

export { DependencyValidator } from "./validation/dependency-validator.ts";

// ============================================================================
// UTILITIES (Advanced Usage)
// ============================================================================

export {
	// Dependencies
	hasFailedDependencies,
	getFailedDependencies,
	hasSuccessfulDependencies,
	// Results
	countSuccessful,
	countFailed,
	// State
	resetSectionResultsMap,
	applyFinalizedResults,
	// Timeouts
	executeWithTimeout,
	createTimeoutPromise,
	// Arrays
	chunk,
	unique,
	// Objects
	deepClone,
	isEmpty,
	pick,
	omit,
	// Timing
	delay,
	measureTime,
	// Strings
	truncate,
	capitalize,
} from "./shared/utils.ts";
