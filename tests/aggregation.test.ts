import { describe, test, expect, beforeEach } from 'vitest';
import { DagEngine } from '../src/engine';
import { Plugin } from '../src/plugin';
import { ProviderRegistry } from '../src/providers/registry';
import { MockAIProvider, createMockSection } from './setup';

describe('DagEngine - Section Aggregation', () => {
    let mockProvider: MockAIProvider;
    let registry: ProviderRegistry;

    beforeEach(() => {
        mockProvider = new MockAIProvider();
        registry = new ProviderRegistry();
        registry.register(mockProvider);
    });

    test('should aggregate section results for global dimension', async () => {
        let receivedDeps: any = null;

        class AggregationPlugin extends Plugin {
            constructor() {
                super('agg', 'Aggregation', 'Test');
                this.dimensions = [
                    'section_analysis',
                    { name: 'global_summary', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                if (context.dimension === 'global_summary') {
                    receivedDeps = context.dependencies;
                }
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            getDependencies(): Record<string, string[]> {
                return {
                    global_summary: ['section_analysis']
                };
            }
        }

        mockProvider.setMockResponse('section_analysis', { sentiment: 'positive' });
        mockProvider.setMockResponse('global_summary', { summary: 'Overall positive' });

        const engine = new DagEngine({
            plugin: new AggregationPlugin(),
            registry
        });

        const sections = [
            createMockSection('Section 1'),
            createMockSection('Section 2'),
            createMockSection('Section 3')
        ];

        await engine.process(sections);

        expect(receivedDeps).toBeDefined();
        expect(receivedDeps.section_analysis).toBeDefined();
        expect(receivedDeps.section_analysis.data).toBeDefined();
        expect(receivedDeps.section_analysis.data.aggregated).toBe(true);
        expect(receivedDeps.section_analysis.data.sections).toHaveLength(3);
    });

    test('should provide correct totalSections count', async () => {
        let receivedTotal: number | null = null;

        class TotalPlugin extends Plugin {
            constructor() {
                super('total', 'Total', 'Test');
                this.dimensions = [
                    'section_dim',
                    { name: 'global_dim', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                if (context.dimension === 'global_dim') {
                    receivedTotal = context.dependencies.section_dim?.data?.totalSections;
                }
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            getDependencies(): Record<string, string[]> {
                return { global_dim: ['section_dim'] };
            }
        }

        mockProvider.setMockResponse('section_dim', { result: 'ok' });
        mockProvider.setMockResponse('global_dim', { result: 'global' });

        const engine = new DagEngine({
            plugin: new TotalPlugin(),
            registry
        });

        const sections = Array.from({ length: 7 }, (_, i) =>
            createMockSection(`Section ${i}`)
        );

        await engine.process(sections);

        expect(receivedTotal).toBe(7);
    });

    test('should handle partial section results', async () => {
        let receivedSections: any[] = [];

        class PartialPlugin extends Plugin {
            constructor() {
                super('partial', 'Partial', 'Test');
                this.dimensions = [
                    'section_dim',
                    { name: 'global_dim', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                if (context.dimension === 'global_dim') {
                    receivedSections = context.dependencies.section_dim?.data?.sections || [];
                }
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            getDependencies(): Record<string, string[]> {
                return { global_dim: ['section_dim'] };
            }
        }

        let callCount = 0;
        mockProvider.execute = async (request) => {
            callCount++;
            if (callCount % 2 === 0) {
                return { error: 'Failed' };
            }
            return { data: { result: `ok-${callCount}` } };
        };

        const engine = new DagEngine({
            plugin: new PartialPlugin(),
            registry,
            continueOnError: true
        });

        const sections = [
            createMockSection('Section 1'),
            createMockSection('Section 2'),
            createMockSection('Section 3'),
            createMockSection('Section 4')
        ];

        await engine.process(sections);

        // Should have aggregated both successful and failed results
        expect(receivedSections.length).toBeGreaterThan(0);
    });

    test('should handle empty section results', async () => {
        let receivedDeps: any = null;

        class EmptyPlugin extends Plugin {
            constructor() {
                super('empty', 'Empty', 'Test');
                this.dimensions = [
                    { name: 'global_dim', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                receivedDeps = context.dependencies;
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            getDependencies(): Record<string, string[]> {
                return { global_dim: ['nonexistent_section_dim'] };
            }
        }

        mockProvider.setMockResponse('test', { result: 'ok' });

        const engine = new DagEngine({
            plugin: new EmptyPlugin(),
            registry
        });

        await engine.process([createMockSection('Test')]);

        expect(receivedDeps.nonexistent_section_dim).toBeDefined();
        expect(receivedDeps.nonexistent_section_dim.error).toBeDefined();
    });

    test('should mark aggregated results correctly', async () => {
        let isAggregated: boolean | null = null;

        class MarkPlugin extends Plugin {
            constructor() {
                super('mark', 'Mark', 'Test');
                this.dimensions = [
                    'section_dim',
                    { name: 'global_dim', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                if (context.dimension === 'global_dim') {
                    isAggregated = context.dependencies.section_dim?.data?.aggregated;
                }
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            getDependencies(): Record<string, string[]> {
                return { global_dim: ['section_dim'] };
            }
        }

        mockProvider.setMockResponse('section_dim', { result: 'section' });
        mockProvider.setMockResponse('global_dim', { result: 'global' });

        const engine = new DagEngine({
            plugin: new MarkPlugin(),
            registry
        });

        await engine.process([
            createMockSection('Section 1'),
            createMockSection('Section 2')
        ]);

        expect(isAggregated).toBe(true);
    });

    test('should handle mixed success/failure in aggregation', async () => {
        let aggregatedResults: any[] = [];

        class MixedPlugin extends Plugin {
            constructor() {
                super('mixed', 'Mixed', 'Test');
                this.dimensions = [
                    'section_dim',
                    { name: 'global_dim', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                if (context.dimension === 'global_dim') {
                    aggregatedResults = context.dependencies.section_dim?.data?.sections || [];
                }
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            getDependencies(): Record<string, string[]> {
                return { global_dim: ['section_dim'] };
            }
        }

        const sectionCallCounts = new Map<number, number>();

        mockProvider.execute = async (request) => {
            // The input is 'section_dim' for all section calls
            if (request.input === 'section_dim') {
                // We need to track this differently - let's use a counter
                const currentCount = (sectionCallCounts.get(0) || 0) + 1;
                sectionCallCounts.set(0, currentCount);

                // Make the 2nd section call fail
                if (currentCount === 2) {
                    return { error: 'Section 2 failed' };
                }
            }

            return { data: { result: `ok` } };
        };

        const engine = new DagEngine({
            plugin: new MixedPlugin(),
            registry,
            continueOnError: true,
            maxRetries: 0
        });

        const sections = [
            createMockSection('Section 1'),
            createMockSection('Section 2'),
            createMockSection('Section 3')
        ];

        await engine.process(sections);

        expect(aggregatedResults).toHaveLength(3);

        const errorResults = aggregatedResults.filter(r => r.error);
        expect(errorResults.length).toBeGreaterThan(0);
    });

    test('should aggregate multiple section dimensions', async () => {
        let receivedDeps: any = null;

        class MultiAggPlugin extends Plugin {
            constructor() {
                super('multi-agg', 'Multi Agg', 'Test');
                this.dimensions = [
                    'section_dim1',
                    'section_dim2',
                    { name: 'global_dim', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                if (context.dimension === 'global_dim') {
                    receivedDeps = context.dependencies;
                }
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            getDependencies(): Record<string, string[]> {
                return { global_dim: ['section_dim1', 'section_dim2'] };
            }
        }

        mockProvider.setMockResponse('section_dim1', { result: 'dim1' });
        mockProvider.setMockResponse('section_dim2', { result: 'dim2' });
        mockProvider.setMockResponse('global_dim', { result: 'global' });

        const engine = new DagEngine({
            plugin: new MultiAggPlugin(),
            registry
        });

        await engine.process([
            createMockSection('Section 1'),
            createMockSection('Section 2')
        ]);

        expect(receivedDeps.section_dim1).toBeDefined();
        expect(receivedDeps.section_dim2).toBeDefined();
        expect(receivedDeps.section_dim1.data.aggregated).toBe(true);
        expect(receivedDeps.section_dim2.data.aggregated).toBe(true);
    });
});