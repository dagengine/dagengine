/**
 * Default configuration constants for the DagEngine
 */
export const DEFAULT_ENGINE_CONFIG = {
	MAX_RETRIES: 3,
	RETRY_DELAY: 1000, // milliseconds
	CONTINUE_ON_ERROR: true,
	TIMEOUT: 60000, // milliseconds (60 seconds)
	CONCURRENCY: 5,
} as const;

/**
 * Error messages used throughout the engine
 */
export const ERROR_MESSAGES = {
	NO_PLUGIN: "DagEngine requires a plugin",
	INVALID_CONCURRENCY: "Concurrency must be at least 1",
	NO_PROVIDERS: 'DagEngine requires either "providers" or "registry"',
	NO_PROVIDERS_CONFIGURED:
		"DagEngine requires at least one provider to be configured",
	NO_SECTIONS: "DagEngine.process() requires at least one section",
	DEPENDENCIES_FAILED: (dimension: string) =>
		`Dependencies failed for dimension "${dimension}"`,
	TIMEOUT: (dimension: string, timeout: number) =>
		`Timeout after ${timeout}ms for dimension "${dimension}"`,
	DEPENDENCY_NOT_FOUND: (depName: string) =>
		`Dependency "${depName}" not found in plugin dimensions`,
	GLOBAL_DEP_NOT_FOUND: (depName: string) =>
		`Global dependency "${depName}" not found`,
	SECTION_DEP_NOT_FOUND: (depName: string) =>
		`Section dependency "${depName}" not found`,
	SECTION_DEP_NOT_PROCESSED: (depName: string) =>
		`Section dependency "${depName}" not yet processed`,
} as const;

/**
 * Skip reasons for dimension execution
 */
export const SKIP_REASONS = {
	PLUGIN_SKIP_GLOBAL: "Skipped by plugin shouldSkipGlobalDimension",
	PLUGIN_SKIP_SECTION: "Skipped by plugin shouldSkipSectionDimension",
} as const;

/**
 * Metadata keys used for result tracking
 */
export const METADATA_KEYS = {
	CACHED: "cached",
	PROVIDER: "provider",
	TOKENS: "tokens",
	SKIPPED: "skipped",
	REASON: "reason",
} as const;

/**
 * Minimum duration for error reporting (to avoid test flakiness)
 */
export const MIN_ERROR_DURATION = 1; // milliseconds
