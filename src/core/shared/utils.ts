/**
 * Utility functions used throughout the DagEngine
 *
 * This module contains pure utility functions that don't fit into
 * specific classes but are used across multiple components.
 *
 * @module shared/utils
 */

import type {
	SectionData,
	DimensionResult,
	DimensionDependencies,
} from "../../types.js";
import { DimensionTimeoutError } from "./errors.js";

// ============================================================================
// DEPENDENCY UTILITIES
// ============================================================================

/**
 * Checks if dependencies contain any failures
 *
 * Used to determine if a dimension should be skipped due to failed dependencies.
 *
 * @param deps - The dependencies to check
 * @returns true if any dependency has an error
 *
 * @example
 * ```typescript
 * if (hasFailedDependencies(dependencies)) {
 *   throw new Error('Cannot execute due to failed dependencies');
 * }
 * ```
 */
export function hasFailedDependencies(deps: DimensionDependencies): boolean {
	return Object.values(deps).some((dep) => dep.error !== undefined);
}

/**
 * Gets list of failed dependency names
 *
 * @param deps - The dependencies to check
 * @returns Array of dependency names that have errors
 */
export function getFailedDependencies(deps: DimensionDependencies): string[] {
	return Object.entries(deps)
		.filter(([_, dep]) => dep.error !== undefined)
		.map(([name, _]) => name);
}

// ============================================================================
// RESULT UTILITIES
// ============================================================================

/**
 * Counts successful dimension executions
 *
 * Counts both global and section-level successes.
 *
 * @param globalResults - Results from global dimensions
 * @param sectionResults - Results from section dimensions
 * @returns Total number of successful executions
 */
export function countSuccessful(
	globalResults: Record<string, DimensionResult>,
	sectionResults: Array<{
		section: SectionData;
		results: Record<string, DimensionResult>;
	}>,
): number {
	const globalSuccess = Object.values(globalResults).filter(
		(r) => !r.error,
	).length;

	const sectionDimensions = new Set<string>();
	sectionResults.forEach((sr) => {
		Object.entries(sr.results).forEach(([dim, result]) => {
			if (!result.error) {
				sectionDimensions.add(dim);
			}
		});
	});

	return globalSuccess + sectionDimensions.size;
}

/**
 * Counts failed dimension executions
 *
 * Counts both global and section-level failures.
 *
 * @param globalResults - Results from global dimensions
 * @param sectionResults - Results from section dimensions
 * @returns Total number of failed executions
 */
export function countFailed(
	globalResults: Record<string, DimensionResult>,
	sectionResults: Array<{
		section: SectionData;
		results: Record<string, DimensionResult>;
	}>,
): number {
	const globalFailures = Object.values(globalResults).filter(
		(r) => r.error,
	).length;

	const failedSectionDimensions = new Set<string>();
	sectionResults.forEach((sr) => {
		Object.entries(sr.results).forEach(([dim, result]) => {
			if (result.error) {
				failedSectionDimensions.add(dim);
			}
		});
	});

	return globalFailures + failedSectionDimensions.size;
}

// ============================================================================
// STATE UTILITIES
// ============================================================================

/**
 * Resets the section results map for new section count
 *
 * Used when sections are transformed and the count changes.
 *
 * @param map - The section results map to reset
 * @param newLength - The new number of sections
 */
export function resetSectionResultsMap(
	map: Map<number, Record<string, DimensionResult>>,
	newLength: number,
): void {
	map.clear();
	for (let i = 0; i < newLength; i++) {
		map.set(i, {});
	}
}

/**
 * Applies finalized results back to section results and global results
 *
 * Used after the finalizeResults hook to update results with any
 * modifications made by the plugin.
 *
 * @param sectionResults - Original section results
 * @param finalizedResults - Results from finalizeResults hook
 * @param globalResults - Global results to update (mutated in place)
 * @returns Updated section results
 */
export function applyFinalizedResults(
	sectionResults: Array<{
		section: SectionData;
		results: Record<string, DimensionResult>;
	}>,
	finalizedResults: Record<string, DimensionResult>,
	globalResults: Record<string, DimensionResult>,
): Array<{ section: SectionData; results: Record<string, DimensionResult> }> {
	const updated = sectionResults.map((sr, idx) => {
		const updatedResults: Record<string, DimensionResult> = {};

		Object.keys(sr.results).forEach((dim) => {
			const finalizedKey = `${dim}_section_${idx}`;
			updatedResults[dim] = (finalizedResults[finalizedKey] ??
				sr.results[dim]) as DimensionResult;
		});

		return { section: sr.section, results: updatedResults };
	});

	// Update global results
	Object.keys(globalResults).forEach((dim) => {
		if (finalizedResults[dim]) {
			globalResults[dim] = finalizedResults[dim];
		}
	});

	return updated;
}

// ============================================================================
// TIMEOUT UTILITIES
// ============================================================================

/**
 * Creates a timeout promise for dimension execution
 *
 * Returns a promise that rejects after the specified timeout with
 * a DimensionTimeoutError.
 *
 * @param timeoutMs - Timeout in milliseconds
 * @param dimension - Dimension name for error message
 * @returns Promise that rejects on timeout
 */
export function createTimeoutPromise<T>(
	timeoutMs: number,
	dimension: string,
): Promise<T> {
	return new Promise<T>((_, reject) =>
		setTimeout(
			() => reject(new DimensionTimeoutError(dimension, timeoutMs)),
			timeoutMs,
		),
	);
}

/**
 * Executes a function with timeout protection
 *
 * Races the function execution against a timeout, throwing a
 * DimensionTimeoutError if the timeout is reached first.
 *
 * @param fn - Function to execute
 * @param dimension - Dimension name for error message
 * @param timeoutMs - Timeout in milliseconds
 * @returns Result of the function
 * @throws {DimensionTimeoutError} If timeout is reached
 *
 * @example
 * ```typescript
 * const result = await executeWithTimeout(
 *   () => expensiveOperation(),
 *   'myDimension',
 *   30000
 * );
 * ```
 */
export async function executeWithTimeout<T>(
	fn: () => Promise<T>,
	dimension: string,
	timeoutMs: number,
): Promise<T> {
	return Promise.race([fn(), createTimeoutPromise<T>(timeoutMs, dimension)]);
}
