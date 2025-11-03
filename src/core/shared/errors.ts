/**
 * Custom error classes for the DagEngine
 *
 * Provides structured error handling with error codes and typed details.
 * All errors extend DagEngineError for consistent error handling.
 *
 * @module shared/errors
 *
 * @example Catching specific errors
 * ```typescript
 * try {
 *   await engine.process(sections);
 * } catch (error) {
 *   if (error instanceof CircularDependencyError) {
 *     console.log('Cycle:', error.cycle);
 *   } else if (error instanceof DimensionTimeoutError) {
 *     console.log('Timed out:', error.dimension);
 *   }
 * }
 * ```
 */

// ============================================================================
// BASE ERROR
// ============================================================================

/**
 * Base error class for all DagEngine errors
 *
 * Provides structured error information with error codes and optional details.
 * All custom errors extend this class.
 */
export class DagEngineError extends Error {
	/** Error code for programmatic handling */
	public readonly code: string;

	/** Optional additional error details */
	public readonly details?: unknown;

	constructor(message: string, code: string, details?: unknown) {
		super(message);
		this.name = "DagEngineError";
		this.code = code;
		this.details = details;

		// Maintains proper stack trace for where our error was thrown (V8 only)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}
}

// ============================================================================
// CONFIGURATION ERRORS
// ============================================================================

/**
 * Error thrown when engine configuration is invalid
 *
 * @example
 * ```typescript
 * // Missing plugin
 * throw new ConfigurationError('DagEngine requires a plugin');
 *
 * // Invalid concurrency
 * throw new ConfigurationError('Concurrency must be at least 1', {
 *   provided: 0,
 *   minimum: 1
 * });
 * ```
 */
export class ConfigurationError extends DagEngineError {
	constructor(message: string, details?: unknown) {
		super(message, "CONFIGURATION_ERROR", details);
		this.name = "ConfigurationError";
	}
}

/**
 * Error thrown when no providers are configured
 */
export class NoProvidersError extends ConfigurationError {
	constructor(
		message: string = "DagEngine requires at least one provider to be configured",
	) {
		super(message, { configured: 0 });
		this.name = "NoProvidersError";
	}
}

/**
 * Error thrown when no sections are provided for processing
 */
export class NoSectionsError extends ConfigurationError {
	constructor(
		message: string = "DagEngine.process() requires at least one section",
	) {
		super(message, { provided: 0 });
		this.name = "NoSectionsError";
	}
}

// ============================================================================
// DEPENDENCY ERRORS
// ============================================================================

/**
 * Error thrown when circular dependencies are detected
 *
 * @example
 * ```typescript
 * // Detected cycle: A → B → C → A
 * throw new CircularDependencyError(['A', 'B', 'C', 'A']);
 * ```
 */
export class CircularDependencyError extends DagEngineError {
	/** The cycle path showing the circular dependency */
	public readonly cycle: string[];

	constructor(cycle: string[]) {
		super(
			`Circular dependency detected: ${cycle.join(" → ")}\n` +
				"Please review your defineDependencies() configuration.",
			"CIRCULAR_DEPENDENCY",
			{ cycle },
		);
		this.name = "CircularDependencyError";
		this.cycle = cycle;
	}
}
/**
 * Error thrown when dependencies fail and continueOnError is false
 *
 * Provides structured information about which dependencies failed and why,
 * making it easy to trace root causes and handle errors programmatically.
 */
export class DependencyError extends DagEngineError {
	/** The dimension whose dependencies failed */
	public readonly dimension: string;

	/** Structured list of failed dependencies with their error messages */
	public readonly failedDependencies: Array<{
		name: string;
		error: string;
	}>;

	constructor(dimension: string, failedDeps: Record<string, string>) {
		// Build human-readable error message
		const depList = Object.entries(failedDeps)
			.map(([name, error]) => `${name} (${error})`)
			.join(", ");

		const message =
			failedDeps && Object.keys(failedDeps).length > 0
				? `Dependencies failed for dimension "${dimension}". Failed: ${depList}`
				: `Dependencies failed for dimension "${dimension}"`;

		super(message, "DEPENDENCIES_FAILED", { failedDependencies: failedDeps });

		this.name = "DependencyError";
		this.dimension = dimension;
		this.failedDependencies = Object.entries(failedDeps).map(
			([name, error]) => ({
				name,
				error,
			}),
		);
	}
}

/**
 * Error thrown when a dependency is not found
 */
export class DependencyNotFoundError extends DagEngineError {
	/** The dependency that was not found */
	public readonly dependency: string;

	constructor(dependency: string, context: "plugin" | "global" | "section") {
		const contextMessages = {
			plugin: `Dependency "${dependency}" not found in plugin dimensions`,
			global: `Global dependency "${dependency}" not found`,
			section: `Section dependency "${dependency}" not found`,
		};

		super(contextMessages[context], "DEPENDENCY_NOT_FOUND", {
			dependency,
			context,
		});
		this.name = "DependencyNotFoundError";
		this.dependency = dependency;
	}
}

// ============================================================================
// EXECUTION ERRORS
// ============================================================================

/**
 * Error thrown when a dimension execution times out
 */
export class DimensionTimeoutError extends DagEngineError {
	/** The dimension that timed out */
	public readonly dimension: string;

	/** The timeout value in milliseconds */
	public readonly timeout: number;

	constructor(dimension: string, timeout: number) {
		super(
			`Dimension "${dimension}" timed out after ${timeout}ms`,
			"DIMENSION_TIMEOUT",
			{ dimension, timeout },
		);
		this.name = "DimensionTimeoutError";
		this.dimension = dimension;
		this.timeout = timeout;
	}
}

/**
 * Error thrown when execution groups cannot be created
 *
 * This typically indicates a circular dependency or invalid graph state.
 */
export class ExecutionGroupingError extends DagEngineError {
	/** Dimensions that could not be grouped */
	public readonly stuck: string[];

	constructor(stuck: string[], details?: unknown) {
		super(
			"Unable to create execution groups. " +
				`Stuck dimensions: ${stuck.join(", ")}. ` +
				"This indicates a circular dependency or invalid graph.",
			"EXECUTION_GROUPING_ERROR",
			details,
		);
		this.name = "ExecutionGroupingError";
		this.stuck = stuck;
	}
}

// ============================================================================
// PROVIDER ERRORS
// ============================================================================

/**
 * Error thrown when a provider is not found
 */
export class ProviderNotFoundError extends DagEngineError {
	/** The provider that was requested */
	public readonly provider: string;

	/** List of available providers */
	public readonly available: string[];

	constructor(provider: string, available: string[]) {
		super(
			`Provider "${provider}" not found. Available providers: ${available.join(", ")}`,
			"PROVIDER_NOT_FOUND",
			{ provider, available },
		);
		this.name = "ProviderNotFoundError";
		this.provider = provider;
		this.available = available;
	}
}

/**
 * Error thrown when all providers fail for a dimension
 */
export class AllProvidersFailed extends DagEngineError {
	/** The dimension that failed */
	public readonly dimension: string;

	/** List of providers that were tried */
	public readonly providers: string[];

	/** The last error that occurred */
	public readonly lastError: Error;

	constructor(dimension: string, providers: string[], lastError: Error) {
		super(
			`All providers failed for dimension "${dimension}". ` +
				`Tried: ${providers.join(", ")}`,
			"ALL_PROVIDERS_FAILED",
			{ dimension, providers, lastError: lastError.message },
		);
		this.name = "AllProvidersFailed";
		this.dimension = dimension;
		this.providers = providers;
		this.lastError = lastError;
	}
}

// ============================================================================
// VALIDATION ERRORS
// ============================================================================

/**
 * Error thrown when validation fails
 */
export class ValidationError extends DagEngineError {
	/** The field that failed validation */
	public readonly field?: string;

	constructor(message: string, field?: string, details?: unknown) {
		super(
			message,
			"VALIDATION_ERROR",
			ValidationError.buildDetails(field, details),
		);
		this.name = "ValidationError";
		if (field !== undefined) {
			this.field = field;
		}
	}

	private static buildDetails(
		field?: string,
		details?: unknown,
	): Record<string, unknown> {
		const result: Record<string, unknown> = {};

		if (field !== undefined) {
			result.field = field;
		}

		if (details !== undefined) {
			if (typeof details === "object" && details !== null) {
				Object.assign(result, details);
			} else {
				result.details = details;
			}
		}

		return result;
	}
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Type guard to check if an error is a DagEngineError
 */
export function isDagEngineError(error: unknown): error is DagEngineError {
	return error instanceof DagEngineError;
}

/**
 * Normalize any error to a proper Error instance
 */
export function normalizeError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	if (typeof error === "string") {
		return new Error(error);
	}

	return new Error(String(error));
}

/**
 * Extract error message safely from any error type
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "string") {
		return error;
	}

	return String(error);
}
/**
 * Create an error with context information
 */
export function createContextError(
	baseError: Error,
	context: string,
	details?: unknown,
): DagEngineError {
	return new DagEngineError(
		`${context}: ${baseError.message}`,
		"CONTEXT_ERROR",
		{
			originalError: baseError.message,
			context,
			...(details && typeof details === "object" ? details : { details }),
		},
	);
}
