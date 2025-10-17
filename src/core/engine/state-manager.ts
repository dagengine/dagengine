/**
 * Process state utilities
 *
 * Factory function and utilities for managing process state.
 * State is a plain object - direct access is encouraged.
 *
 * @module engine/state-manager
 */

import crypto from "crypto";
import type { SectionData, DimensionResult } from "../../types.ts";
import type { ProcessState, SerializedProcessState } from "../shared/types.ts";
import { resetSectionResultsMap } from "../shared/utils.ts";

export type { SerializedProcessState };

/**
 * Creates a new process state
 *
 * @param sections - Initial sections to process
 * @param metadata - Optional metadata from beforeProcessStart hook
 * @returns Initialized process state
 *
 * @example
 * ```typescript
 * const state = createProcessState(sections);
 *
 * // Direct access
 * console.log(state.id);
 * state.globalResults[dim] = result;
 * ```
 */
export function createProcessState(
	sections: SectionData[],
	metadata?: unknown,
): ProcessState {
	return {
		id: crypto.randomUUID(),
		startTime: Date.now(),
		metadata,
		sections: [...sections],
		globalResults: {},
		sectionResultsMap: new Map(sections.map((_, idx) => [idx, {}])),
	};
}

/**
 * Updates sections and resets section results
 *
 * Use this helper when sections are transformed to ensure
 * the results map stays in sync.
 *
 * @param state - Process state to update
 * @param sections - New sections
 *
 * @example
 * ```typescript
 * // After transformation
 * updateStateSections(state, transformedSections);
 * ```
 */
export function updateStateSections(
	state: ProcessState,
	sections: SectionData[],
): void {
	state.sections = [...sections];
	resetSectionResultsMap(state.sectionResultsMap, sections.length);
}

/**
 * Gets section results safely
 *
 * Returns empty object if section doesn't exist.
 *
 * @param state - Process state
 * @param sectionIndex - Section index
 * @returns Section results
 */
export function getSectionResults(
	state: ProcessState,
	sectionIndex: number,
): Record<string, DimensionResult> {
	return state.sectionResultsMap.get(sectionIndex) ?? {};
}

/**
 * Sets section result safely
 *
 * Creates section results object if it doesn't exist.
 *
 * @param state - Process state
 * @param sectionIndex - Section index
 * @param dimension - Dimension name
 * @param result - Dimension result
 */
export function setSectionResult(
	state: ProcessState,
	sectionIndex: number,
	dimension: string,
	result: DimensionResult,
): void {
	const sectionResults = state.sectionResultsMap.get(sectionIndex) ?? {};
	sectionResults[dimension] = result;
	state.sectionResultsMap.set(sectionIndex, sectionResults);
}

/**
 * Serialize state for storage/transmission
 *
 * Converts Map to array for JSON serialization
 *
 * @param state - Process state to serialize
 * @returns Serialized state
 */
export function serializeState(state: ProcessState): SerializedProcessState {
	return {
		...state,
		sectionResultsMap: Array.from(state.sectionResultsMap.entries()),
	};
}

/**
 * Deserialize state from storage/transmission
 *
 * Converts array back to Map
 *
 * @param serialized - Serialized state
 * @returns Process state
 */
export function deserializeState(
	serialized: SerializedProcessState,
): ProcessState {
	return {
		...serialized,
		sectionResultsMap: new Map(serialized.sectionResultsMap),
	};
}
