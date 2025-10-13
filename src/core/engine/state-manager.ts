/**
 * Process state manager
 *
 * Encapsulates all process state mutations and provides a clean API
 * for reading and modifying state during workflow execution.
 *
 * @module engine/state-manager
 */

import crypto from 'crypto';
import { SectionData, DimensionResult } from '../../types.ts';
import { ProcessState } from '../shared/types.ts';
import { resetSectionResultsMap } from '../shared/utils.ts';

/**
 * Manages process state throughout workflow execution
 *
 * Provides controlled access to ProcessState with clear mutation methods.
 * All state changes should go through StateManager methods to maintain
 * consistency and enable future enhancements (e.g., state snapshots, undo).
 *
 * @example
 * ```typescript
 * const manager = new StateManager(sections);
 *
 * // Read state
 * const state = manager.getState();
 * console.log(state.id);
 *
 * // Modify state
 * manager.setGlobalResult('summary', { data: 'Summary text' });
 * manager.setSectionResult(0, 'tags', { data: ['tag1', 'tag2'] });
 *
 * // Transform sections
 * manager.updateSections(transformedSections);
 * ```
 */
export class StateManager {
    private state: ProcessState;

    /**
     * Creates a new StateManager with initialized state
     *
     * @param sections - Initial sections to process
     * @param metadata - Optional metadata from beforeProcessStart hook
     */
    constructor(sections: SectionData[], metadata?: unknown) {
        this.state = {
            id: crypto.randomUUID(),
            startTime: Date.now(),
            metadata,
            sections: [...sections],
            globalResults: {},
            sectionResultsMap: new Map(sections.map((_, idx) => [idx, {}])),
        };
    }

    // ============================================================================
    // READ OPERATIONS
    // ============================================================================

    /**
     * Gets the current state (read-only)
     *
     * Returns a readonly reference to prevent accidental mutations.
     * Use the provided methods to modify state.
     *
     * @returns Current process state
     */
    getState(): Readonly<ProcessState> {
        return this.state;
    }

    /**
     * Gets the process ID
     *
     * @returns Unique process identifier
     */
    getProcessId(): string {
        return this.state.id;
    }

    /**
     * Gets the process start time
     *
     * @returns Start timestamp in milliseconds
     */
    getStartTime(): number {
        return this.state.startTime;
    }

    /**
     * Gets the current sections
     *
     * @returns Array of sections (may have been transformed)
     */
    getSections(): SectionData[] {
        return this.state.sections;
    }

    /**
     * Gets a specific section by index
     *
     * @param index - Section index
     * @returns Section data or undefined if index is out of bounds
     */
    getSection(index: number): SectionData | undefined {
        return this.state.sections[index];
    }

    /**
     * Gets the number of sections
     *
     * @returns Total section count
     */
    getSectionCount(): number {
        return this.state.sections.length;
    }

    /**
     * Gets all global results
     *
     * @returns Global dimension results
     */
    getGlobalResults(): Record<string, DimensionResult> {
        return this.state.globalResults;
    }

    /**
     * Gets a specific global result
     *
     * @param dimension - Dimension name
     * @returns Dimension result or undefined if not found
     */
    getGlobalResult(dimension: string): DimensionResult | undefined {
        return this.state.globalResults[dimension];
    }

    /**
     * Gets results for a specific section
     *
     * @param sectionIndex - Section index
     * @returns Section results or empty object if section not found
     */
    getSectionResults(sectionIndex: number): Record<string, DimensionResult> {
        return this.state.sectionResultsMap.get(sectionIndex) ?? {};
    }

    /**
     * Gets a specific section result
     *
     * @param sectionIndex - Section index
     * @param dimension - Dimension name
     * @returns Dimension result or undefined if not found
     */
    getSectionResult(sectionIndex: number, dimension: string): DimensionResult | undefined {
        const sectionResults = this.state.sectionResultsMap.get(sectionIndex);
        return sectionResults?.[dimension];
    }

    /**
     * Gets the metadata
     *
     * @returns Metadata from beforeProcessStart hook
     */
    getMetadata(): unknown {
        return this.state.metadata;
    }

    /**
     * Checks if a global dimension has been executed
     *
     * @param dimension - Dimension name
     * @returns true if dimension has a result (success or error)
     */
    hasGlobalResult(dimension: string): boolean {
        return dimension in this.state.globalResults;
    }

    /**
     * Checks if a section dimension has been executed
     *
     * @param sectionIndex - Section index
     * @param dimension - Dimension name
     * @returns true if dimension has a result (success or error)
     */
    hasSectionResult(sectionIndex: number, dimension: string): boolean {
        const sectionResults = this.state.sectionResultsMap.get(sectionIndex);
        return sectionResults !== undefined && dimension in sectionResults;
    }

    // ============================================================================
    // WRITE OPERATIONS
    // ============================================================================

    /**
     * Sets metadata
     *
     * Used by beforeProcessStart hook to store custom metadata.
     *
     * @param metadata - Metadata to store
     */
    setMetadata(metadata: unknown): void {
        this.state.metadata = metadata;
    }

    /**
     * Updates the sections array
     *
     * Used when sections are transformed by global dimensions.
     * Automatically resets section results map to match new section count.
     *
     * @param sections - New sections array
     *
     * @example
     * ```typescript
     * // After a global dimension transforms sections
     * manager.updateSections(transformedSections);
     * ```
     */
    updateSections(sections: SectionData[]): void {
        this.state.sections = [...sections];
        resetSectionResultsMap(this.state.sectionResultsMap, sections.length);
    }

    /**
     * Sets a global dimension result
     *
     * @param dimension - Dimension name
     * @param result - Dimension result
     *
     * @example
     * ```typescript
     * manager.setGlobalResult('summary', {
     *   data: 'Overall summary',
     *   metadata: { tokens: { inputTokens: 100, outputTokens: 50 } }
     * });
     * ```
     */
    setGlobalResult(dimension: string, result: DimensionResult): void {
        this.state.globalResults[dimension] = result;
    }

    /**
     * Sets a section dimension result
     *
     * @param sectionIndex - Section index
     * @param dimension - Dimension name
     * @param result - Dimension result
     *
     * @example
     * ```typescript
     * manager.setSectionResult(0, 'tags', {
     *   data: ['important', 'urgent'],
     *   metadata: { tokens: { inputTokens: 50, outputTokens: 10 } }
     * });
     * ```
     */
    setSectionResult(
        sectionIndex: number,
        dimension: string,
        result: DimensionResult
    ): void {
        const sectionResults = this.state.sectionResultsMap.get(sectionIndex) ?? {};
        sectionResults[dimension] = result;
        this.state.sectionResultsMap.set(sectionIndex, sectionResults);
    }

    /**
     * Sets multiple global results at once
     *
     * @param results - Map of dimension names to results
     *
     * @example
     * ```typescript
     * manager.setGlobalResults({
     *   summary: { data: 'Summary' },
     *   sentiment: { data: 'positive' }
     * });
     * ```
     */
    setGlobalResults(results: Record<string, DimensionResult>): void {
        Object.entries(results).forEach(([dimension, result]) => {
            this.state.globalResults[dimension] = result;
        });
    }

    /**
     * Sets multiple section results at once
     *
     * @param sectionIndex - Section index
     * @param results - Map of dimension names to results
     *
     * @example
     * ```typescript
     * manager.setSectionResults(0, {
     *   tags: { data: ['tag1'] },
     *   sentiment: { data: 'positive' }
     * });
     * ```
     */
    setSectionResults(
        sectionIndex: number,
        results: Record<string, DimensionResult>
    ): void {
        const sectionResults = this.state.sectionResultsMap.get(sectionIndex) ?? {};
        Object.entries(results).forEach(([dimension, result]) => {
            sectionResults[dimension] = result;
        });
        this.state.sectionResultsMap.set(sectionIndex, sectionResults);
    }

    // ============================================================================
    // UTILITY OPERATIONS
    // ============================================================================

    /**
     * Clears all results (global and section)
     *
     * Useful for testing or retry scenarios.
     */
    clearResults(): void {
        this.state.globalResults = {};
        this.state.sectionResultsMap.forEach((_, idx) => {
            this.state.sectionResultsMap.set(idx, {});
        });
    }

    /**
     * Clears global results only
     */
    clearGlobalResults(): void {
        this.state.globalResults = {};
    }

    /**
     * Clears section results only
     */
    clearSectionResults(): void {
        this.state.sectionResultsMap.forEach((_, idx) => {
            this.state.sectionResultsMap.set(idx, {});
        });
    }

    /**
     * Gets the total number of results (global + section)
     *
     * @returns Total result count
     */
    getTotalResultCount(): number {
        const globalCount = Object.keys(this.state.globalResults).length;

        let sectionCount = 0;
        this.state.sectionResultsMap.forEach(results => {
            sectionCount += Object.keys(results).length;
        });

        return globalCount + sectionCount;
    }

    /**
     * Gets all dimension names that have been executed
     *
     * @returns Array of dimension names with results
     */
    getExecutedDimensions(): string[] {
        const dimensions = new Set<string>();

        // Add global dimensions
        Object.keys(this.state.globalResults).forEach(dim => dimensions.add(dim));

        // Add section dimensions
        this.state.sectionResultsMap.forEach(results => {
            Object.keys(results).forEach(dim => dimensions.add(dim));
        });

        return Array.from(dimensions);
    }

    /**
     * Creates a snapshot of current state
     *
     * Useful for debugging or implementing rollback functionality.
     *
     * @returns Deep copy of current state
     */
    snapshot(): ProcessState {
        return {
            id: this.state.id,
            startTime: this.state.startTime,
            metadata: this.state.metadata,
            sections: [...this.state.sections],
            globalResults: { ...this.state.globalResults },
            sectionResultsMap: new Map(
                Array.from(this.state.sectionResultsMap.entries()).map(([idx, results]) => [
                    idx,
                    { ...results },
                ])
            ),
        };
    }

    /**
     * Restores state from a snapshot
     *
     * @param snapshot - Previously created snapshot
     */
    restore(snapshot: ProcessState): void {
        this.state = {
            id: snapshot.id,
            startTime: snapshot.startTime,
            metadata: snapshot.metadata,
            sections: [...snapshot.sections],
            globalResults: { ...snapshot.globalResults },
            sectionResultsMap: new Map(
                Array.from(snapshot.sectionResultsMap.entries()).map(([idx, results]) => [
                    idx,
                    { ...results },
                ])
            ),
        };
    }
}