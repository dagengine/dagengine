/**
 * Constants used throughout the DagEngine
 *
 * This module contains all constant values including default configuration,
 * error messages, and metadata keys used for result tracking.
 *
 * @module shared/constants
 */

// ============================================================================
// DEFAULT ENGINE CONFIGURATION
// ============================================================================

/**
 * Default configuration values for the DagEngine
 *
 * These values are used when not explicitly provided in EngineConfig.
 *
 * @example
 * ```typescript
 * import { DEFAULT_ENGINE_CONFIG } from '@dagengine/core';
 *
 * console.log(DEFAULT_ENGINE_CONFIG.MAX_RETRIES); // 3
 * console.log(DEFAULT_ENGINE_CONFIG.TIMEOUT); // 60000
 * ```
 */
export const DEFAULT_ENGINE_CONFIG = {
	/** Maximum number of retry attempts for failed operations */
	MAX_RETRIES: 3,

	/** Delay between retry attempts in milliseconds */
	RETRY_DELAY: 1000,

	/** Whether to continue execution when a dimension fails */
	CONTINUE_ON_ERROR: true,

	/** Default timeout for dimension execution in milliseconds */
	TIMEOUT: 60000, // 60 seconds

	/** Maximum concurrent dimension executions */
	CONCURRENCY: 5,
} as const;

// ============================================================================
// ERROR MESSAGES
// ============================================================================

/**
 * Standardized error messages used throughout the engine
 *
 * Provides consistent error messaging and supports parameterized messages
 * through factory functions.
 *
 * @example
 * ```typescript
 * import { ERROR_MESSAGES } from '@dagengine/core';
 *
 * throw new Error(ERROR_MESSAGES.NO_PLUGIN);
 * throw new Error(ERROR_MESSAGES.TIMEOUT('summary', 30000));
 * ```
 */
export const ERROR_MESSAGES = {
	// Configuration errors
	NO_PLUGIN: "DagEngine requires a plugin",
	INVALID_CONCURRENCY: "Concurrency must be at least 1",
	NO_PROVIDERS: 'DagEngine requires either "providers" or "registry"',
	NO_PROVIDERS_CONFIGURED:
		"DagEngine requires at least one provider to be configured",
	NO_SECTIONS: "DagEngine.process() requires at least one section",

	// Dependency errors
	DEPENDENCIES_FAILED: (dimension: string) =>
		`Dependencies failed for dimension "${dimension}"`,

	DEPENDENCY_NOT_FOUND: (depName: string) =>
		`Dependency "${depName}" not found in plugin dimensions`,

	GLOBAL_DEP_NOT_FOUND: (depName: string) =>
		`Global dependency "${depName}" not found`,

	SECTION_DEP_NOT_FOUND: (depName: string) =>
		`Section dependency "${depName}" not found`,

	SECTION_DEP_NOT_PROCESSED: (depName: string) =>
		`Section dependency "${depName}" not yet processed`,

	// Execution errors
	TIMEOUT: (dimension: string, timeout: number) =>
		`Timeout after ${timeout}ms for dimension "${dimension}"`,

	// Graph errors
	CIRCULAR_DEPENDENCY: (cycle: string[]) =>
		`Circular dependency detected: ${cycle.join(" → ")}`,

	EXECUTION_GROUPING: (remaining: string[]) =>
		`Unable to create execution groups. Remaining dimensions: ${remaining.join(", ")}`,

	// Provider errors
	PROVIDER_NOT_FOUND: (provider: string, available: string[]) =>
		`Provider "${provider}" not found. Available: ${available.join(", ")}`,

	ALL_PROVIDERS_FAILED: (dimension: string) =>
		`All providers failed for dimension "${dimension}"`,
} as const;

// ============================================================================
// SKIP REASONS
// ============================================================================

/**
 * Standardized reasons for skipping dimension execution
 *
 * Used in result metadata to indicate why a dimension was skipped.
 *
 * @example
 * ```typescript
 * import { SKIP_REASONS } from '@dagengine/core';
 *
 * return {
 *   data: { skipped: true, reason: SKIP_REASONS.PLUGIN_SKIP_GLOBAL }
 * };
 * ```
 */
export const SKIP_REASONS = {
	/** Skipped by plugin's shouldSkipGlobalDimension hook */
	PLUGIN_SKIP_GLOBAL: "Skipped by plugin shouldSkipGlobalDimension",

	/** Skipped by plugin's shouldSkipSectionDimension hook */
	PLUGIN_SKIP_SECTION: "Skipped by plugin shouldSkipSectionDimension",

	/** Skipped due to cached result */
	CACHED_RESULT: "Skipped due to cached result",

	/** Skipped due to failed dependencies */
	FAILED_DEPENDENCIES: "Skipped due to failed dependencies",
} as const;

// ============================================================================
// METADATA KEYS
// ============================================================================

/**
 * Metadata keys used for result tracking
 *
 * Standardized keys for accessing metadata in DimensionResult objects.
 *
 * @example
 * ```typescript
 * import { METADATA_KEYS } from '@dagengine/core';
 *
 * if (result.metadata?.[METADATA_KEYS.CACHED]) {
 *   console.log('Result was cached');
 * }
 *
 * console.log('Provider:', result.metadata?.[METADATA_KEYS.PROVIDER]);
 * console.log('Tokens:', result.metadata?.[METADATA_KEYS.TOKENS]);
 * ```
 */
export const METADATA_KEYS = {
	/** Whether the result was cached */
	CACHED: "cached",

	/** Provider used for this dimension */
	PROVIDER: "provider",

	/** Token usage information */
	TOKENS: "tokens",

	/** Whether the dimension was skipped */
	SKIPPED: "skipped",

	/** Reason for skipping (if skipped) */
	REASON: "reason",

	/** Model used for this dimension */
	MODEL: "model",

	/** Duration of execution in milliseconds */
	DURATION: "duration",

	/** Timestamp of execution */
	TIMESTAMP: "timestamp",
} as const;

// ============================================================================
// TIMING CONSTANTS
// ============================================================================

/**
 * Timing-related constants
 */
export const TIMING = {
	/** Minimum duration for error reporting (to avoid test flakiness) */
	MIN_ERROR_DURATION: 1, // milliseconds

	/** Default delay between retry attempts */
	DEFAULT_RETRY_DELAY: 1000, // milliseconds

	/** Maximum backoff delay for retries */
	MAX_RETRY_DELAY: 10000, // milliseconds

	/** Default timeout for dimension execution */
	DEFAULT_TIMEOUT: 60000, // milliseconds (60 seconds)
} as const;

// ============================================================================
// VALIDATION CONSTANTS
// ============================================================================

/**
 * Validation-related constants
 */
export const VALIDATION = {
	/** Minimum allowed concurrency */
	MIN_CONCURRENCY: 1,

	/** Maximum allowed concurrency */
	MAX_CONCURRENCY: 10000,

	/** Minimum allowed retry attempts */
	MIN_RETRIES: 0,

	/** Maximum allowed retry attempts */
	MAX_RETRIES: 10,

	/** Minimum allowed timeout */
	MIN_TIMEOUT: 100, // 1 second

	/** Maximum allowed timeout */
	MAX_TIMEOUT: 600000, // 10 minutes
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

/**
 * Type for skip reason values
 */
export type SkipReason = (typeof SKIP_REASONS)[keyof typeof SKIP_REASONS];

/**
 * Type for metadata key values
 */
export type MetadataKey = (typeof METADATA_KEYS)[keyof typeof METADATA_KEYS];

/**
 * Minimum duration for error reporting (to avoid test flakiness)
 *
 * @deprecated Use TIMING.MIN_ERROR_DURATION instead
 */
export const MIN_ERROR_DURATION = TIMING.MIN_ERROR_DURATION;
