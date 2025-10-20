/**
 * Core type definitions for the DagEngine
 *
 * This module contains all shared types used throughout the engine.
 * These types represent the internal state and data structures used
 * during workflow execution.
 *
 * @module shared/types
 */

import type { SectionData, DimensionResult } from "../../types.js";

// ============================================================================
// PROCESS STATE
// ============================================================================

/**
 * Internal state maintained throughout a process execution
 */
export interface ProcessState {
	/** Unique process identifier (UUID v4) */
	id: string;

	/** Process start timestamp (milliseconds since epoch) */
	startTime: number;

	/** Optional metadata from beforeProcessStart hook */
	metadata?: unknown;

	originalSections: SectionData[];

	/** Sections being processed (may be transformed during execution) */
	sections: SectionData[];

	/** Results from global dimensions (shared across all sections) */
	globalResults: Record<string, DimensionResult>;

	/** Results from section dimensions, indexed by section number */
	sectionResultsMap: Map<number, Record<string, DimensionResult>>;
}

/**
 * Serialized process state for transmission/storage
 *
 * Map is converted to array for JSON serialization
 */
export interface SerializedProcessState {
	id: string;
	startTime: number;
	metadata?: unknown;
	originalSections: SectionData[];
	sections: SectionData[];
	globalResults: Record<string, DimensionResult>;
	sectionResultsMap: Array<[number, Record<string, DimensionResult>]>;
}

// Rest of the file stays the same...
// ============================================================================
// EXECUTION PLAN
// ============================================================================

/**
 * Execution plan created during the planning phase
 */
export interface ExecutionPlan {
	/** All dimensions in topologically sorted order */
	sortedDimensions: string[];

	/** Dimensions grouped by execution level for parallel execution */
	executionGroups: string[][];

	/** Dependency graph mapping dimension to its dependencies */
	dependencyGraph: Record<string, string[]>;
}

// ============================================================================
// RESULT STRUCTURES
// ============================================================================

/**
 * Section result pair for final output
 */
export interface SectionResultPair {
	section: SectionData;
	results: Record<string, DimensionResult>;
}

// ============================================================================
// SKIP CHECK RESULTS
// ============================================================================

/**
 * Result from skip check hooks
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
 */
export interface ProviderAttempt {
	provider: string;
	options: Record<string, unknown>;
	retryAfter?: number;
}

/**
 * Record of a single execution attempt
 */
export interface AttemptRecord {
	attempt: number;
	error: Error;
	provider: string;
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
