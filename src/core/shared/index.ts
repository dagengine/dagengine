/**
 * Shared module exports
 *
 * Core types, errors, constants, and utilities used throughout the engine.
 *
 * @module shared
 */

// Types
export type {
	ProcessState,
	ExecutionPlan,
	SectionResultPair,
	SkipCheckResult,
	ProviderAttempt,
	AttemptRecord,
} from "./types.js";

export { isSkipWithResult, isErrorResult, isSuccessResult } from "./types.js";

// Errors
export {
	DagEngineError,
	ConfigurationError,
	NoProvidersError,
	NoSectionsError,
	CircularDependencyError,
	DependencyError,
	DependencyNotFoundError,
	DimensionTimeoutError,
	ExecutionGroupingError,
	ProviderNotFoundError,
	AllProvidersFailed,
	ValidationError,
	isDagEngineError,
	normalizeError,
	getErrorMessage,
	createContextError,
} from "./errors.js";

// Constants
export {
	DEFAULT_ENGINE_CONFIG,
	ERROR_MESSAGES,
	SKIP_REASONS,
	METADATA_KEYS,
	TIMING,
	VALIDATION,
} from "./constants.js";

export type { SkipReason, MetadataKey } from "./constants.js";

export {
	hasFailedDependencies,
	getFailedDependencies,
	countSuccessful,
	countFailed,
	resetSectionResultsMap,
	applyFinalizedResults,
	executeWithTimeout,
	createTimeoutPromise,
} from "./utils.js";
