import { describe, test, expect, beforeEach } from 'vitest';
import { DagEngine } from '../../src/core/engine.ts';
import { TestPlugin } from '../helpers/test-plugin';
import { ProviderAdapter } from '../../src/providers/adapter';

import type {
    BeforeProcessStartContext,
    AfterProcessCompleteContext,
    SectionDimensionContext,
    DimensionContext,
    DimensionResultContext,
    BeforeProviderExecuteContext,
    AfterProviderExecuteContext,
    TransformSectionsContext,
    FinalizeContext,
    RetryContext,
    ProcessStartResult,
    ProcessResult,
    SectionData,
    DimensionResult,
    ProviderRequest,
    ProviderResponse,
    RetryResponse,
} from '../../src/types';

class MockProvider {
    name = 'mock';
    callLog: Array<{ dimension: string; input: string; timestamp: number }> = [];

    async execute(request: any) {
        this.callLog.push({
            dimension: request.dimension || 'unknown',
            input: request.input,
            timestamp: Date.now(),
        });

        return {
            data: { result: `processed-${request.dimension}`, input: request.input },
            metadata: {
                model: 'test-model',
                provider: 'mock',
                tokens: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
            },
        };
    }

    reset() {
        this.callLog = [];
    }
}

describe('Hook Integration Tests', () => {
    let mockProvider: MockProvider;
    let adapter: ProviderAdapter;

    beforeEach(() => {
        mockProvider = new MockProvider();
        adapter = new ProviderAdapter({});
        adapter.registerProvider(mockProvider as any);
    });

    test('should execute all hooks in correct order', async () => {
        const executionLog: string[] = [];

        class ComprehensivePlugin extends TestPlugin {
            constructor() {
                super('comprehensive', 'Comprehensive', 'Test all hooks');
                this.dimensions = ['process'];
            }

            beforeProcessStart(context: BeforeProcessStartContext): ProcessStartResult {
                executionLog.push('1-beforeProcessStart');
                return {
                    sections: context.sections,
                    metadata: { initialized: true },
                };
            }

            defineDependencies() {
                executionLog.push('2-defineDependencies');
                return {};
            }

            shouldSkipDimension(context: SectionDimensionContext): boolean {
                executionLog.push('3-shouldSkipDimension');
                return false;
            }

            transformDependencies(context: SectionDimensionContext) {
                executionLog.push('4-transformDependencies');
                return context.dependencies;
            }

            beforeDimensionExecute() {
                executionLog.push('5-beforeDimensionExecute');
            }

            createPrompt() {
                executionLog.push('6-createPrompt');
                return 'test';
            }

            selectProvider() {
                executionLog.push('7-selectProvider');
                return { provider: 'mock', options: {} };
            }

            beforeProviderExecute(context: BeforeProviderExecuteContext): ProviderRequest {
                executionLog.push('8-beforeProviderExecute');
                return context.request;
            }

            afterProviderExecute(context: AfterProviderExecuteContext): ProviderResponse {
                executionLog.push('9-afterProviderExecute');
                return context.result;
            }

            afterDimensionExecute() {
                executionLog.push('10-afterDimensionExecute');
            }

            finalizeResults(context: FinalizeContext): Record<string, DimensionResult> {
                executionLog.push('11-finalizeResults');
                return context.results;
            }

            afterProcessComplete(context: AfterProcessCompleteContext): ProcessResult {
                executionLog.push('12-afterProcessComplete');
                return context.result;
            }
        }

        const engine = new DagEngine({
            plugin: new ComprehensivePlugin(),
            providers: adapter,
        });

        await engine.process([{ content: 'Test', metadata: {} }]);

        expect(executionLog).toEqual([
            '1-beforeProcessStart',
            '2-defineDependencies',
            '3-shouldSkipDimension',
            '4-transformDependencies',
            '5-beforeDimensionExecute',
            '6-createPrompt',
            '7-selectProvider',
            '8-beforeProviderExecute',
            '9-afterProviderExecute',
            '10-afterDimensionExecute',
            '11-finalizeResults',
            '12-afterProcessComplete',
        ]);
    });

    test('should pass data through hook pipeline', async () => {
        class DataPipelinePlugin extends TestPlugin {
            constructor() {
                super('pipeline', 'Pipeline', 'Test data flow');
                this.dimensions = ['process'];
            }

            beforeProcessStart(context: BeforeProcessStartContext): ProcessStartResult {
                return {
                    sections: context.sections.map(s => ({
                        ...s,
                        metadata: { ...s.metadata, stage: 'beforeProcessStart' },
                    })),
                    metadata: { pipelineId: 'test-123' },
                };
            }

            createPrompt(context: any) {
                // Should have access to section with modified metadata
                return `process: ${context.sections[0].metadata.stage}`;
            }

            beforeProviderExecute(context: BeforeProviderExecuteContext): ProviderRequest {
                return {
                    ...context.request,
                    input: `${context.request.input} + beforeProviderExecute`,
                };
            }

            afterProviderExecute(context: AfterProviderExecuteContext): ProviderResponse {
                return {
                    ...context.result,
                    data: {
                        ...context.result.data,
                        enhanced: 'afterProviderExecute',
                    },
                };
            }

            afterDimensionExecute(context: DimensionResultContext) {
                // Result should have enhancements from previous hooks
                expect(context.result.data?.enhanced).toBe('afterProviderExecute');
            }
        }

        const engine = new DagEngine({
            plugin: new DataPipelinePlugin(),
            providers: adapter,
        });

        const result = await engine.process([{ content: 'Test', metadata: {} }]);

        expect(mockProvider.callLog[0]?.input).toContain('beforeProviderExecute');
        expect(result.sections[0]?.results.process?.data?.enhanced).toBe('afterProviderExecute');
    });

    test('should handle complex workflow with dependencies and transformations', async () => {
        class ComplexWorkflowPlugin extends TestPlugin {
            constructor() {
                super('complex', 'Complex', 'Complex workflow');
                this.dimensions = [
                    'extract',
                    { name: 'summarize', scope: 'global' as const },
                    'enrich',
                ];
            }

            defineDependencies() {
                return {
                    summarize: ['extract'],
                    enrich: ['summarize'],
                };
            }

            createPrompt(context: any) {
                return context.dimension;
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            transformSections(context: TransformSectionsContext): SectionData[] {
                if (context.dimension === 'summarize') {
                    // Add a new section based on summary
                    return [
                        ...context.currentSections,
                        {
                            content: `Summary: ${context.result.data?.result}`,
                            metadata: { type: 'summary', fromDimension: 'summarize' },
                        },
                    ];
                }
                return context.currentSections;
            }

            shouldSkipDimension(context: SectionDimensionContext): boolean {
                // Skip enrich for summary sections
                if (context.dimension === 'enrich') {
                    return context.section.metadata.type === 'summary';
                }
                return false;
            }
        }

        const engine = new DagEngine({
            plugin: new ComplexWorkflowPlugin(),
            providers: adapter,
        });

        const result = await engine.process([
            { content: 'Original section 1', metadata: {} },
            { content: 'Original section 2', metadata: {} },
        ]);

        // After summarize transform, should have added summary section
        expect(result.transformedSections.length).toBeGreaterThan(2);

        // Summary section should exist
        const summarySection = result.transformedSections.find(
            s => s.metadata.type === 'summary'
        );
        expect(summarySection).toBeDefined();

        // Enrich should be skipped for summary section
        const summarySectionIndex = result.transformedSections.findIndex(
            s => s.metadata.type === 'summary'
        );
        if (summarySectionIndex >= 0) {
            expect(result.sections[summarySectionIndex]?.results.enrich?.data?.skipped).toBe(true);
        }
    });

    test('should handle skip logic with dependencies', async () => {
        class SkipWithDepsPlugin extends TestPlugin {
            constructor() {
                super('skip-deps', 'Skip Deps', 'Test skip with dependencies');
                this.dimensions = ['validate', 'process', 'finalize'];
            }

            defineDependencies() {
                return {
                    process: ['validate'],
                    finalize: ['process'],
                };
            }

            createPrompt(context: any) {
                if (context.dimension === 'validate') {
                    return 'validate: pass';
                }
                return context.dimension;
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            shouldSkipDimension(context: SectionDimensionContext): boolean {
                if (context.dimension === 'process') {
                    // Skip if validation didn't pass
                    const validateResult = context.dependencies.validate?.data?.result;
                    return validateResult !== 'processed-validate';
                }

                if (context.dimension === 'finalize') {
                    // Skip if process was skipped
                    return context.dependencies.process?.data?.skipped === true;
                }

                return false;
            }
        }

        const engine = new DagEngine({
            plugin: new SkipWithDepsPlugin(),
            providers: adapter,
        });

        const result = await engine.process([{ content: 'Test', metadata: {} }]);

        // Validate should execute
        expect(result.sections[0]?.results.validate?.data?.result).toBeDefined();

        // Process should execute (validation passed)
        expect(result.sections[0]?.results.process?.data?.result).toBeDefined();

        // Finalize should execute (process executed)
        expect(result.sections[0]?.results.finalize?.data?.result).toBeDefined();
    });

    test('should handle retry with modification', async () => {
        let attemptCount = 0;

        class FailingProvider {
            name = 'failing';

            async execute(request: any) {
                attemptCount++;

                // Fail if input doesn't include retry marker
                if (!request.input.includes('retry-attempt')) {
                    throw new Error('Need retry');
                }

                return {
                    data: { result: 'success', attempts: attemptCount },
                    metadata: {
                        model: 'test-model',
                        provider: 'failing',
                        tokens: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
                    },
                };
            }
        }

        const failingProvider = new FailingProvider();
        adapter.registerProvider(failingProvider as any);

        class RetryModifyPlugin extends TestPlugin {
            constructor() {
                super('retry-modify', 'Retry Modify', 'Test retry with modification');
                this.dimensions = ['process'];
            }

            createPrompt() {
                return 'initial';
            }

            selectProvider() {
                return { provider: 'failing', options: {} };
            }

            handleRetry(context: RetryContext): RetryResponse {
                return {
                    shouldRetry: true,
                    modifiedRequest: {
                        ...context.request,
                        input: `${context.request.input}-retry-attempt-${context.attempt}`,
                    },
                };
            }
        }

        const engine = new DagEngine({
            plugin: new RetryModifyPlugin(),
            providers: adapter,
            maxRetries: 3,
        });

        const result = await engine.process([{ content: 'Test', metadata: {} }]);

        expect(result.sections[0]?.results.process?.data?.result).toBe('success');
        expect(attemptCount).toBeGreaterThan(1);
    });

    test('should aggregate and finalize with global dimensions', async () => {
        class AggregationPlugin extends TestPlugin {
            constructor() {
                super('aggregation', 'Aggregation', 'Test aggregation');
                this.dimensions = [
                    'analyze',
                    { name: 'global_summary', scope: 'global' as const },
                ];
            }

            defineDependencies() {
                return {
                    global_summary: ['analyze'],
                };
            }

            createPrompt(context: any) {
                return context.dimension;
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            finalizeResults(context: FinalizeContext): Record<string, DimensionResult> {
                const finalized: Record<string, DimensionResult> = { ...context.results };

                // Count section results
                const analyzeResults = Object.keys(context.results).filter(k =>
                    k.startsWith('analyze_section_')
                );

                // Add metadata to global summary
                if (finalized['global_summary']) {
                    finalized['global_summary'] = {
                        ...finalized['global_summary'],
                        data: {
                            ...finalized['global_summary'].data,
                            aggregatedFrom: analyzeResults.length,
                        },
                    };
                }

                return finalized;
            }
        }

        const engine = new DagEngine({
            plugin: new AggregationPlugin(),
            providers: adapter,
        });

        const result = await engine.process([
            { content: 'Section 1', metadata: {} },
            { content: 'Section 2', metadata: {} },
            { content: 'Section 3', metadata: {} },
        ]);

        expect(result.globalResults.global_summary?.data?.aggregatedFrom).toBe(3);
    });

    test('should handle full lifecycle with all hooks', async () => {
        const lifecycle = {
            sectionsAdded: 0,
            dimensionsSkipped: 0,
            requestsModified: 0,
            responsesEnhanced: 0,
            sectionsTransformed: 0,
            resultsFinalized: false,
        };

        class FullLifecyclePlugin extends TestPlugin {
            constructor() {
                super('full-lifecycle', 'Full Lifecycle', 'Test full lifecycle');
                this.dimensions = [
                    'analyze',
                    { name: 'summarize', scope: 'global' as const },
                    'enrich',
                ];
            }

            beforeProcessStart(context: BeforeProcessStartContext): ProcessStartResult {
                lifecycle.sectionsAdded = 1;
                return {
                    sections: [
                        ...context.sections,
                        { content: 'Added by beforeProcessStart', metadata: { added: true } },
                    ],
                };
            }

            defineDependencies() {
                return {
                    summarize: ['analyze'],
                    enrich: ['summarize'],
                };
            }

            shouldSkipDimension(context: SectionDimensionContext): boolean {
                if (context.section.content.length < 5) {
                    lifecycle.dimensionsSkipped++;
                    return true;
                }
                return false;
            }

            createPrompt(context: any) {
                return context.dimension;
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            beforeProviderExecute(context: BeforeProviderExecuteContext): ProviderRequest {
                lifecycle.requestsModified++;
                return {
                    ...context.request,
                    input: `modified-${context.request.input}`,
                };
            }

            afterProviderExecute(context: AfterProviderExecuteContext): ProviderResponse {
                lifecycle.responsesEnhanced++;
                return {
                    ...context.result,
                    data: {
                        ...context.result.data,
                        enhanced: true,
                    },
                };
            }

            transformSections(context: TransformSectionsContext): SectionData[] {
                lifecycle.sectionsTransformed++;
                return context.currentSections.map(s => ({
                    ...s,
                    metadata: { ...s.metadata, transformed: true },
                }));
            }

            finalizeResults(context: FinalizeContext): Record<string, DimensionResult> {
                lifecycle.resultsFinalized = true;
                return context.results;
            }
        }

        const engine = new DagEngine({
            plugin: new FullLifecyclePlugin(),
            providers: adapter,
        });

        const result = await engine.process([
            { content: 'Test section', metadata: {} },
            { content: 'Hi', metadata: {} }, // Will be skipped (too short)
        ]);

        expect(lifecycle.sectionsAdded).toBe(1);
        expect(lifecycle.dimensionsSkipped).toBeGreaterThan(0);
        expect(lifecycle.requestsModified).toBeGreaterThan(0);
        expect(lifecycle.responsesEnhanced).toBeGreaterThan(0);
        expect(lifecycle.sectionsTransformed).toBe(1); // summarize is global
        expect(lifecycle.resultsFinalized).toBe(true);

        // Verify transformations applied
        expect(result.transformedSections.every(s => s.metadata.transformed === true)).toBe(true);
    });

    test('should handle cascading transformations', async () => {
        class CascadingPlugin extends TestPlugin {
            constructor() {
                super('cascading', 'Cascading', 'Cascading transformations');
                this.dimensions = [
                    { name: 'split', scope: 'global' as const },
                    { name: 'enhance', scope: 'global' as const },
                    { name: 'merge', scope: 'global' as const },
                ];
            }

            defineDependencies() {
                return {
                    enhance: ['split'],
                    merge: ['enhance'],
                };
            }

            createPrompt(context: any) {
                return context.dimension;
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            transformSections(context: TransformSectionsContext): SectionData[] {
                if (context.dimension === 'split') {
                    // Split each section by sentences
                    const newSections: SectionData[] = [];
                    context.currentSections.forEach(section => {
                        const sentences = section.content.split('. ');
                        sentences.forEach((sentence, idx) => {
                            if (sentence.trim()) {
                                newSections.push({
                                    content: sentence.trim(),
                                    metadata: { ...section.metadata, split: true, sentenceIndex: idx },
                                });
                            }
                        });
                    });
                    return newSections;
                }

                if (context.dimension === 'enhance') {
                    // Add prefix to each section
                    return context.currentSections.map(section => ({
                        ...section,
                        content: `[Enhanced] ${section.content}`,
                        metadata: { ...section.metadata, enhanced: true },
                    }));
                }

                if (context.dimension === 'merge') {
                    // Merge back into one
                    const merged = context.currentSections
                        .map(s => s.content)
                        .join('\n');

                    return [
                        {
                            content: merged,
                            metadata: { merged: true, originalCount: context.currentSections.length },
                        },
                    ];
                }

                return context.currentSections;
            }
        }

        const engine = new DagEngine({
            plugin: new CascadingPlugin(),
            providers: adapter,
        });

        const result = await engine.process([
            { content: 'First sentence. Second sentence. Third sentence', metadata: {} },
        ]);

        // Should be merged back to one section
        expect(result.transformedSections).toHaveLength(1);
        expect(result.transformedSections[0]?.content).toContain('[Enhanced]');
        expect(result.transformedSections[0]?.metadata.merged).toBe(true);
    });

    test('should handle mixed sync and async hooks', async () => {
        class MixedAsyncPlugin extends TestPlugin {
            constructor() {
                super('mixed-async', 'Mixed Async', 'Mixed sync/async hooks');
                this.dimensions = ['process'];
            }

            // Sync
            beforeProcessStart(context: BeforeProcessStartContext): ProcessStartResult {
                return { sections: context.sections };
            }

            // Async
            async defineDependencies() {
                await new Promise(resolve => setTimeout(resolve, 10));
                return {};
            }

            // Sync
            shouldSkipDimension(): boolean {
                return false;
            }

            // Async
            async beforeDimensionExecute() {
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Sync
            createPrompt() {
                return 'test';
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            // Async
            async afterDimensionExecute() {
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Sync
            finalizeResults(context: FinalizeContext): Record<string, DimensionResult> {
                return context.results;
            }

            // Async
            async afterProcessComplete(context: AfterProcessCompleteContext): Promise<ProcessResult> {
                await new Promise(resolve => setTimeout(resolve, 10));
                return context.result;
            }
        }

        const engine = new DagEngine({
            plugin: new MixedAsyncPlugin(),
            providers: adapter,
        });

        const result = await engine.process([{ content: 'Test', metadata: {} }]);

        expect(result).toBeDefined();
        expect(result.sections[0]?.results.process).toBeDefined();
    });

    test('should preserve state across hooks', async () => {
        const sharedState = {
            processId: '',
            sectionsProcessed: 0,
            dimensionsExecuted: [] as string[],
            finalDuration: 0,
        };

        class StatefulPlugin extends TestPlugin {
            constructor() {
                super('stateful', 'Stateful', 'Test state preservation');
                this.dimensions = ['dim1', 'dim2'];
            }

            beforeProcessStart(context: BeforeProcessStartContext) {
                sharedState.processId = context.processId;
                return { sections: context.sections };
            }

            createPrompt(context: any) {
                return context.dimension;
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            afterDimensionExecute(context: DimensionResultContext) {
                sharedState.dimensionsExecuted.push(context.dimension);
                sharedState.sectionsProcessed++;

                // Verify processId is consistent
                expect(context.processId).toBe(sharedState.processId);
            }

            afterProcessComplete(context: AfterProcessCompleteContext) {
                sharedState.finalDuration = context.duration;

                // Verify processId is still the same
                expect(context.processId).toBe(sharedState.processId);

                return context.result;
            }
        }

        const engine = new DagEngine({
            plugin: new StatefulPlugin(),
            providers: adapter,
        });

        await engine.process([{ content: 'Test', metadata: {} }]);

        expect(sharedState.processId).toBeTruthy();
        expect(sharedState.sectionsProcessed).toBe(2); // 2 dimensions × 1 section
        expect(sharedState.dimensionsExecuted).toEqual(['dim1', 'dim2']);
        expect(sharedState.finalDuration).toBeGreaterThanOrEqual(0);
    });
});