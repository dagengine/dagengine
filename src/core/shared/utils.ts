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
} from "../../types.ts";
import { ERROR_MESSAGES } from "./constants.ts";
import { DimensionTimeoutError } from "./errors.ts";

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

/**
 * Checks if all dependencies are successful
 *
 * @param deps - The dependencies to check
 * @returns true if all dependencies have data and no errors
 */
export function hasSuccessfulDependencies(
	deps: DimensionDependencies,
): boolean {
	return Object.values(deps).every(
		(dep) => dep.data !== undefined && !dep.error,
	);
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

// ============================================================================
// ARRAY UTILITIES
// ============================================================================

/**
 * Chunks an array into smaller arrays of specified size
 *
 * @param array - Array to chunk
 * @param size - Size of each chunk
 * @returns Array of chunks
 *
 * @example
 * ```typescript
 * chunk([1, 2, 3, 4, 5], 2); // [[1, 2], [3, 4], [5]]
 * ```
 */
export function chunk<T>(array: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}
	return chunks;
}

/**
 * Removes duplicates from an array
 *
 * @param array - Array to deduplicate
 * @returns Array with unique values
 */
export function unique<T>(array: T[]): T[] {
	return Array.from(new Set(array));
}

// ============================================================================
// OBJECT UTILITIES
// ============================================================================

/**
 * Deep clones an object using JSON serialization
 *
 * Note: This only works with JSON-serializable objects.
 * Functions, Dates, and other non-JSON types will not be preserved.
 *
 * @param obj - Object to clone
 * @returns Cloned object
 */
export function deepClone<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}

/**
 * Checks if an object is empty
 *
 * @param obj - Object to check
 * @returns true if object has no own properties
 */
export function isEmpty(obj: Record<string, unknown>): boolean {
	return Object.keys(obj).length === 0;
}

/**
 * Picks specified keys from an object
 *
 * @param obj - Source object
 * @param keys - Keys to pick
 * @returns New object with only specified keys
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
	obj: T,
	keys: K[],
): Pick<T, K> {
	const result = {} as Pick<T, K>;
	keys.forEach((key) => {
		if (key in obj) {
			result[key] = obj[key];
		}
	});
	return result;
}

/**
 * Omits specified keys from an object
 *
 * @param obj - Source object
 * @param keys - Keys to omit
 * @returns New object without specified keys
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
	obj: T,
	keys: K[],
): Omit<T, K> {
	const result = { ...obj };
	keys.forEach((key) => {
		delete result[key];
	});
	return result;
}

// ============================================================================
// TIMING UTILITIES
// ============================================================================

/**
 * Creates a promise that resolves after a delay
 *
 * @param ms - Delay in milliseconds
 * @returns Promise that resolves after delay
 */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Measures execution time of a function
 *
 * @param fn - Function to measure
 * @returns Tuple of [result, duration in ms]
 *
 * @example
 * ```typescript
 * const [result, duration] = await measureTime(() => expensiveOperation());
 * console.log(`Operation took ${duration}ms`);
 * ```
 */
export async function measureTime<T>(
	fn: () => Promise<T>,
): Promise<[T, number]> {
	const start = Date.now();
	const result = await fn();
	const duration = Date.now() - start;
	return [result, duration];
}

// ============================================================================
// STRING UTILITIES
// ============================================================================

/**
 * Truncates a string to a maximum length
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to add when truncated (default: '...')
 * @returns Truncated string
 */
export function truncate(
	str: string,
	maxLength: number,
	suffix: string = "...",
): string {
	if (str.length <= maxLength) {
		return str;
	}
	return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Capitalizes the first letter of a string
 *
 * @param str - String to capitalize
 * @returns Capitalized string
 */
export function capitalize(str: string): string {
	if (!str) return str;
	return str.charAt(0).toUpperCase() + str.slice(1);
}
