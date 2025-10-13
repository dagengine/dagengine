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
} from './types.ts';

export {
    isSkipWithResult,
    isErrorResult,
    isSuccessResult,
} from './types.ts';

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
} from './errors.ts';

// Constants
export {
    DEFAULT_ENGINE_CONFIG,
    ERROR_MESSAGES,
    SKIP_REASONS,
    METADATA_KEYS,
    TIMING,
    VALIDATION,
} from './constants.ts';

export type {
    SkipReason,
    MetadataKey,
} from './constants.ts';

// Utils
export {
    hasFailedDependencies,
    getFailedDependencies,
    hasSuccessfulDependencies,
    countSuccessful,
    countFailed,
    resetSectionResultsMap,
    applyFinalizedResults,
    executeWithTimeout,
    createTimeoutPromise,
    chunk,
    unique,
    deepClone,
    isEmpty,
    pick,
    omit,
    delay,
    measureTime,
    truncate,
    capitalize,
} from './utils.ts';