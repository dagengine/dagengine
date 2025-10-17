/**
 * Core type definitions for the DagEngine
 *
 * This module contains all shared types used throughout the engine.
 * These types represent the internal state and data structures used
 * during workflow execution.
 *
 * @module shared/types
 */

import type { SectionData, DimensionResult } from "../../types.ts";

// ============================================================================
// PROCESS STATE
// ============================================================================

/**
 * Internal state maintained throughout a process execution
 *
 * This is the single source of truth for all state during a workflow run.
 * All components read and write to this state to coordinate execution.
 *
 * @remarks
 * - State is mutable but should only be modified through StateManager
 * - sectionResultsMap uses indices to maintain section order
 * - globalResults are shared across all sections
 */
export interface ProcessState {
	/** Unique process identifier (UUID v4) */
	id: string;

	/** Process start timestamp (milliseconds since epoch) */
	startTime: number;

	/** Optional metadata from beforeProcessStart hook */
	metadata?: unknown;

	/** Sections being processed (may be transformed during execution) */
	sections: SectionData[];

	/** Results from global dimensions (shared across all sections) */
	globalResults: Record<string, DimensionResult>;

	/** Results from section dimensions, indexed by section number */
	sectionResultsMap: Map<number, Record<string, DimensionResult>>;
}

// ============================================================================
// EXECUTION PLAN
// ============================================================================

/**
 * Execution plan created during the planning phase
 *
 * Contains the dependency graph and execution order computed from
 * plugin dependencies and topological sorting.
 */
export interface ExecutionPlan {
	/**
	 * Dimensions sorted in topological order (dependencies first)
	 * This represents a valid execution order respecting all dependencies.
	 */
	sortedDimensions: string[];

	/**
	 * Dimensions grouped for parallel execution
	 * Each group contains dimensions that can run simultaneously
	 * because they have no dependencies on each other.
	 */
	executionGroups: string[][];

	/**
	 * Dependency graph mapping dimension -> its dependencies
	 * Used for validation and analytics
	 */
	dependencyGraph: Record<string, string[]>;
}

// ============================================================================
// RESULT STRUCTURES
// ============================================================================

/**
 * Section result pair for final output
 *
 * Combines a section with all its dimension results for easy access.
 */
export interface SectionResultPair {
	/** The section data */
	section: SectionData;

	/** Results for all dimensions executed on this section */
	results: Record<string, DimensionResult>;
}

// ============================================================================
// SKIP CHECK RESULTS
// ============================================================================

/**
 * Result from skip check hooks
 *
 * Plugins can return either a boolean or an object with a cached result
 * to skip dimension execution while still providing a result.
 */
export type SkipCheckResult =
	| boolean
	| { skip: true; result: DimensionResult }
	| { skip: false };

// ============================================================================
// PROVIDER ATTEMPT TRACKING
// ============================================================================

/**
 * Provider attempt configuration
 *
 * Represents a single provider to try, including fallback configuration.
 */
export interface ProviderAttempt {
	/** Provider name to use */
	provider: string;

	/** Options to pass to the provider */
	options: Record<string, unknown>;

	/** Optional delay before trying this provider (for fallbacks) */
	retryAfter?: number;
}

/**
 * Record of a single execution attempt
 *
 * Used for tracking retry/fallback history for debugging and hooks.
 */
export interface AttemptRecord {
	/** Attempt number (1-indexed) */
	attempt: number;

	/** Error that occurred during this attempt */
	error: Error;

	/** Provider that was used for this attempt */
	provider: string;

	/** Timestamp of the attempt (milliseconds since epoch) */
	timestamp: number;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if skip result includes a cached result
 */
export function isSkipWithResult(
	result: SkipCheckResult,
): result is { skip: true; result: DimensionResult } {
	return (
		typeof result === "object" && result.skip === true && "result" in result
	);
}

/**
 * Type guard to check if dimension result is an error
 */
export function isErrorResult(
	result: DimensionResult,
): result is { error: string } {
	return "error" in result && typeof result.error === "string";
}

/**
 * Type guard to check if dimension result has data
 */
export function isSuccessResult(
	result: DimensionResult,
): result is { data: unknown } {
	return "data" in result && !("error" in result);
}
