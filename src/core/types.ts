import { SectionData, DimensionResult } from '../types';

/**
 * Internal process state used throughout engine execution
 */
export interface ProcessState {
    id: string;
    startTime: number;
    metadata?: any;
    sections: SectionData[];
    globalResults: Record<string, DimensionResult>;
    sectionResultsMap: Map<number, Record<string, DimensionResult>>;
}

/**
 * Execution plan created during planning phase
 */
export interface ExecutionPlan {
    sortedDimensions: string[];
    executionGroups: string[][];
}

/**
 * Skip check result from plugin hooks
 */
export type SkipCheckResult =
    | boolean
    | { skip: true; result: DimensionResult }
    | { skip: false };

/**
 * Section result pair for final output
 */
export interface SectionResultPair {
    section: SectionData;
    results: Record<string, DimensionResult>;
}