import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { DagEngine } from '../../src/engine';
import { Plugin } from '../../src/plugin';
import { ProviderAdapter } from '../../src/providers/adapter';
import { createMockSection } from '../setup';
import type { SectionData } from '../../src/types';

class MockProvider {
    name = 'mock';
    callLog: string[] = [];

    async execute(options: any) {
        this.callLog.push('called');
        return {
            data: { result: 'mock result' },
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

    getTotalCalls(): number {
        return this.callLog.length;
    }
}

describe('shouldSkipGlobalDimension - Basic Functionality', () => {
    let mockProvider: MockProvider;
    let adapter: ProviderAdapter;

    beforeEach(() => {
        mockProvider = new MockProvider();
        adapter = new ProviderAdapter({});
        adapter.registerProvider(mockProvider as any);
    });

    test('should process global dimension when shouldSkipGlobalDimension not defined', async () => {
        class NoSkipGlobalPlugin extends Plugin {
            constructor() {
                super('no-skip-global', 'No Skip Global', 'No global skip logic');
                this.dimensions = [{ name: 'global_summary', scope: 'global' }];
            }

            createPrompt() {
                return 'test prompt';
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            // No shouldSkipGlobalDimension method
        }

        const plugin = new NoSkipGlobalPlugin();
        const engine = new DagEngine({ plugin, providers: adapter });

        const sections = [
            { content: 'Section 1', metadata: {} },
            { content: 'Section 2', metadata: {} },
        ];

        await engine.process(sections);

        // Global dimension should be processed
        expect(mockProvider.getTotalCalls()).toBe(1);
    });

    test('should skip global dimension when shouldSkipGlobalDimension returns true', async () => {
        class GlobalSkipPlugin extends Plugin {
            constructor() {
                super('global-skip', 'Global Skip', 'Global skip test');
                this.dimensions = [
                    { name: 'global_summary', scope: 'global' },
                    { name: 'global_analysis', scope: 'global' },
                ];
            }

            createPrompt() {
                return 'test prompt';
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            shouldSkipGlobalDimension(dimension: string, sections: SectionData[]): boolean {
                // Skip global_analysis
                return dimension === 'global_analysis';
            }
        }

        const plugin = new GlobalSkipPlugin();
        const engine = new DagEngine({ plugin, providers: adapter });

        const sections = [
            { content: 'Section 1', metadata: {} },
            { content: 'Section 2', metadata: {} },
        ];

        mockProvider.reset();
        const result = await engine.process(sections);

        // Only global_summary should be called (global_analysis skipped)
        expect(mockProvider.getTotalCalls()).toBe(1);

        // Verify skipped dimension is marked
        expect(result.globalResults.global_analysis?.data).toEqual({
            skipped: true,
            reason: 'Skipped by plugin shouldSkipGlobalDimension',
        });
    });

    test('should skip global dimension if all sections are too short', async () => {
        class LengthBasedGlobalPlugin extends Plugin {
            constructor() {
                super('length-based', 'Length Based', 'Skip if all sections short');
                this.dimensions = [{ name: 'overall_summary', scope: 'global' }];
            }

            createPrompt() {
                return 'test prompt';
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            shouldSkipGlobalDimension(dimension: string, sections: SectionData[]): boolean {
                if (dimension === 'overall_summary') {
                    // Skip if ALL sections are too short
                    return sections.every(s => s.content.length < 50);
                }
                return false;
            }
        }

        const plugin = new LengthBasedGlobalPlugin();
        const engine = new DagEngine({ plugin, providers: adapter });

        // Test 1: All short sections - should skip
        mockProvider.reset();
        await engine.process([
            { content: 'Short', metadata: {} },
            { content: 'Also short', metadata: {} },
        ]);
        expect(mockProvider.getTotalCalls()).toBe(0); // Skipped

        // Test 2: At least one long section - should process
        mockProvider.reset();
        await engine.process([
            { content: 'Short', metadata: {} },
            { content: 'x'.repeat(100), metadata: {} },
        ]);
        expect(mockProvider.getTotalCalls()).toBe(1); // Processed
    });

    test('should skip global dimension based on section count', async () => {
        class CountBasedGlobalPlugin extends Plugin {
            constructor() {
                super('count-based', 'Count Based', 'Skip based on count');
                this.dimensions = [{ name: 'cross_reference', scope: 'global' }];
            }

            createPrompt() {
                return 'test prompt';
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            shouldSkipGlobalDimension(dimension: string, sections: SectionData[]): boolean {
                if (dimension === 'cross_reference') {
                    // Need at least 3 sections to cross-reference
                    return sections.length < 3;
                }
                return false;
            }
        }

        const plugin = new CountBasedGlobalPlugin();
        const engine = new DagEngine({ plugin, providers: adapter });

        // Test 1: Only 2 sections - skip
        mockProvider.reset();
        await engine.process([
            { content: 'Section 1', metadata: {} },
            { content: 'Section 2', metadata: {} },
        ]);
        expect(mockProvider.getTotalCalls()).toBe(0);

        // Test 2: 3 sections - process
        mockProvider.reset();
        await engine.process([
            { content: 'Section 1', metadata: {} },
            { content: 'Section 2', metadata: {} },
            { content: 'Section 3', metadata: {} },
        ]);
        expect(mockProvider.getTotalCalls()).toBe(1);
    });

    test('should skip global dimension based on metadata flag', async () => {
        class MetadataBasedGlobalPlugin extends Plugin {
            constructor() {
                super('metadata-global', 'Metadata Global', 'Metadata-based skip');
                this.dimensions = [{ name: 'expensive_global', scope: 'global' }];
            }

            createPrompt() {
                return 'test prompt';
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            shouldSkipGlobalDimension(dimension: string, sections: SectionData[]): boolean {
                if (dimension === 'expensive_global') {
                    // Skip if any section has skipExpensive flag
                    return sections.some(s => s.metadata.skipExpensive === true);
                }
                return false;
            }
        }

        const plugin = new MetadataBasedGlobalPlugin();
        const engine = new DagEngine({ plugin, providers: adapter });

        // Test 1: No skip flag - process
        mockProvider.reset();
        await engine.process([{ content: 'Test', metadata: {} }]);
        expect(mockProvider.getTotalCalls()).toBe(1);

        // Test 2: Has skip flag - skip
        mockProvider.reset();
        await engine.process([
            { content: 'Test', metadata: {} },
            { content: 'Test2', metadata: { skipExpensive: true } },
        ]);
        expect(mockProvider.getTotalCalls()).toBe(0);
    });

    test('should handle async shouldSkipGlobalDimension', async () => {
        class AsyncGlobalSkipPlugin extends Plugin {
            constructor() {
                super('async-global', 'Async Global', 'Async global skip');
                this.dimensions = [{ name: 'global_dim', scope: 'global' }];
            }

            createPrompt() {
                return 'test prompt';
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            async shouldSkipGlobalDimension(dimension: string, sections: SectionData[]): Promise<boolean> {
                // Simulate async check (e.g., database query)
                await new Promise(resolve => setTimeout(resolve, 10));
                return sections.length < 2;
            }
        }

        const plugin = new AsyncGlobalSkipPlugin();
        const engine = new DagEngine({ plugin, providers: adapter });

        mockProvider.reset();
        await engine.process([{ content: 'Only one', metadata: {} }]);
        expect(mockProvider.getTotalCalls()).toBe(0); // Skipped
    });

    test('should work with both section and global skip logic', async () => {
        class CombinedSkipPlugin extends Plugin {
            constructor() {
                super('combined', 'Combined Skip', 'Both section and global skip');
                this.dimensions = [
                    'section_dim',
                    { name: 'global_dim', scope: 'global' },
                ];
            }

            createPrompt() {
                return 'test prompt';
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            shouldSkipDimension(dimension: string, section: SectionData): boolean {
                return section.content.length < 10;
            }

            shouldSkipGlobalDimension(dimension: string, sections: SectionData[]): boolean {
                return sections.length < 2;
            }
        }

        const plugin = new CombinedSkipPlugin();
        const engine = new DagEngine({ plugin, providers: adapter });

        mockProvider.reset();
        await engine.process([
            { content: 'Hi', metadata: {} }, // Too short for section_dim
            { content: 'Long enough content', metadata: {} },
        ]);

        // section_dim: 1 call (skipped for first section, processed for second)
        // global_dim: 1 call (2 sections, so not skipped)
        // Total: 2 calls
        expect(mockProvider.getTotalCalls()).toBe(2);
    });

    test('should skip multiple global dimensions independently', async () => {
        class MultiGlobalSkipPlugin extends Plugin {
            constructor() {
                super('multi-global', 'Multi Global', 'Skip multiple global dims');
                this.dimensions = [
                    { name: 'global_A', scope: 'global' },
                    { name: 'global_B', scope: 'global' },
                    { name: 'global_C', scope: 'global' },
                ];
            }

            createPrompt() {
                return 'test prompt';
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            shouldSkipGlobalDimension(dimension: string, sections: SectionData[]): boolean {
                // Skip global_A and global_C
                return dimension === 'global_A' || dimension === 'global_C';
            }
        }

        const plugin = new MultiGlobalSkipPlugin();
        const engine = new DagEngine({ plugin, providers: adapter });

        mockProvider.reset();
        const result = await engine.process([{ content: 'Test', metadata: {} }]);

        // Only global_B should be processed
        expect(mockProvider.getTotalCalls()).toBe(1);

        // Verify skipped dimensions are marked
        expect(result.globalResults.global_A?.data).toEqual({
            skipped: true,
            reason: 'Skipped by plugin shouldSkipGlobalDimension',
        });
        expect(result.globalResults.global_C?.data).toEqual({
            skipped: true,
            reason: 'Skipped by plugin shouldSkipGlobalDimension',
        });
    });
});

describe('shouldSkipGlobalDimension - Advanced Scenarios', () => {
    let mockProvider: MockProvider;
    let adapter: ProviderAdapter;

    beforeEach(() => {
        mockProvider = new MockProvider();
        adapter = new ProviderAdapter({});
        adapter.registerProvider(mockProvider as any);
    });

    test('should skip based on aggregate statistics', async () => {
        class AggregateBasedPlugin extends Plugin {
            constructor() {
                super('aggregate', 'Aggregate Based', 'Skip based on aggregate stats');
                this.dimensions = [{ name: 'statistical_analysis', scope: 'global' }];
            }

            createPrompt() {
                return 'test prompt';
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            shouldSkipGlobalDimension(dimension: string, sections: SectionData[]): boolean {
                if (dimension === 'statistical_analysis') {
                    // Skip if average section length < 100
                    const avgLength = sections.reduce((sum, s) => sum + s.content.length, 0) / sections.length;
                    return avgLength < 100;
                }
                return false;
            }
        }

        const plugin = new AggregateBasedPlugin();
        const engine = new DagEngine({ plugin, providers: adapter });

        // Test 1: Low average - skip
        mockProvider.reset();
        await engine.process([
            { content: 'x'.repeat(50), metadata: {} },
            { content: 'x'.repeat(50), metadata: {} },
        ]);
        expect(mockProvider.getTotalCalls()).toBe(0);

        // Test 2: High average - process
        mockProvider.reset();
        await engine.process([
            { content: 'x'.repeat(150), metadata: {} },
            { content: 'x'.repeat(150), metadata: {} },
        ]);
        expect(mockProvider.getTotalCalls()).toBe(1);
    });

    test('should skip based on content type distribution', async () => {
        class DistributionBasedPlugin extends Plugin {
            constructor() {
                super('distribution', 'Distribution Based', 'Skip based on content types');
                this.dimensions = [{ name: 'code_summary', scope: 'global' }];
            }

            createPrompt() {
                return 'test prompt';
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            shouldSkipGlobalDimension(dimension: string, sections: SectionData[]): boolean {
                if (dimension === 'code_summary') {
                    // Skip if less than 50% of sections contain code
                    const codeCount = sections.filter(s => /function|class/.test(s.content)).length;
                    return codeCount < sections.length * 0.5;
                }
                return false;
            }
        }

        const plugin = new DistributionBasedPlugin();
        const engine = new DagEngine({ plugin, providers: adapter });

        // Test 1: Low code percentage - skip
        mockProvider.reset();
        await engine.process([
            { content: 'function test() {}', metadata: {} },
            { content: 'plain text', metadata: {} },
            { content: 'more text', metadata: {} },
        ]);
        expect(mockProvider.getTotalCalls()).toBe(0); // 33% < 50%

        // Test 2: High code percentage - process
        mockProvider.reset();
        await engine.process([
            { content: 'function test() {}', metadata: {} },
            { content: 'class MyClass {}', metadata: {} },
            { content: 'plain text', metadata: {} },
        ]);
        expect(mockProvider.getTotalCalls()).toBe(1); // 66% >= 50%
    });
});

describe('shouldSkipGlobalDimension - Error Handling', () => {
    let mockProvider: MockProvider;
    let adapter: ProviderAdapter;
    let consoleErrorSpy: any;

    beforeEach(() => {
        mockProvider = new MockProvider();
        adapter = new ProviderAdapter({});
        adapter.registerProvider(mockProvider as any);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    test('should handle errors in shouldSkipGlobalDimension gracefully', async () => {
        class ErrorGlobalPlugin extends Plugin {
            constructor() {
                super('error-global', 'Error Global', 'Error in global skip');
                this.dimensions = [{ name: 'global_dim', scope: 'global' }];
            }

            createPrompt() {
                return 'test prompt';
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            shouldSkipGlobalDimension(): boolean {
                throw new Error('Error in shouldSkipGlobalDimension');
            }
        }

        const plugin = new ErrorGlobalPlugin();
        const engine = new DagEngine({ plugin, providers: adapter });

        // Should not throw
        await expect(engine.process([{ content: 'Test', metadata: {} }])).resolves.toBeDefined();

        // Should log error
        expect(consoleErrorSpy).toHaveBeenCalled();

        // Should still process (default to false on error)
        expect(mockProvider.getTotalCalls()).toBe(1);
    });

    test('should handle async errors in shouldSkipGlobalDimension', async () => {
        class AsyncErrorGlobalPlugin extends Plugin {
            constructor() {
                super('async-error-global', 'Async Error Global', 'Async error in global skip');
                this.dimensions = [{ name: 'global_dim', scope: 'global' }];
            }

            createPrompt() {
                return 'test prompt';
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            async shouldSkipGlobalDimension(): Promise<boolean> {
                await new Promise(resolve => setTimeout(resolve, 5));
                throw new Error('Async error');
            }
        }

        const plugin = new AsyncErrorGlobalPlugin();
        const engine = new DagEngine({ plugin, providers: adapter });

        // Should not throw
        await expect(engine.process([{ content: 'Test', metadata: {} }])).resolves.toBeDefined();

        // Should log error
        expect(consoleErrorSpy).toHaveBeenCalled();

        // Should still process (default to false on error)
        expect(mockProvider.getTotalCalls()).toBe(1);
    });
});

describe('shouldSkipGlobalDimension - Integration', () => {
    let mockProvider: MockProvider;
    let adapter: ProviderAdapter;

    beforeEach(() => {
        mockProvider = new MockProvider();
        adapter = new ProviderAdapter({});
        adapter.registerProvider(mockProvider as any);
    });

    test('should work with cost tracking for global dimensions', async () => {
        class CostTrackingGlobalPlugin extends Plugin {
            constructor() {
                super('cost-global', 'Cost Global', 'Cost tracking with global skip');
                this.dimensions = [
                    { name: 'expensive_global', scope: 'global' },
                    { name: 'cheap_global', scope: 'global' },
                ];
            }
            createPrompt() {
                return 'test prompt';
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            shouldSkipGlobalDimension(dimension: string, sections: SectionData[]): boolean {
                if (dimension === 'expensive_global') {
                    // Skip if any section has skip flag
                    return sections.some(s => s.metadata.skipExpensive === true);
                }
                return false;
            }
        }

        const plugin = new CostTrackingGlobalPlugin();
        const engine = new DagEngine({
            plugin,
            providers: adapter,
            pricing: {
                models: {
                    'test-model': { inputPer1M: 1.0, outputPer1M: 2.0 },
                },
            },
        });

        const sections = [
            { content: 'Section 1', metadata: {} },
            { content: 'Section 2', metadata: { skipExpensive: true } },
        ];

        const result = await engine.process(sections);

        // Should track costs only for processed dimension
        expect(result.costs).toBeDefined();
        expect(result.costs!.byDimension).toHaveProperty('cheap_global');
        expect(result.costs!.byDimension).not.toHaveProperty('expensive_global');
    });

    test('should work with global dimensions that have dependencies', async () => {
        class DependentGlobalPlugin extends Plugin {
            constructor() {
                super('dep-global', 'Dependent Global', 'Global with dependencies');
                this.dimensions = [
                    { name: 'global_A', scope: 'global' },
                    { name: 'global_B', scope: 'global' },
                ];
            }

            getDependencies() {
                return {
                    global_B: ['global_A'],
                };
            }

            createPrompt() {
                return 'test prompt';
            }

            selectProvider() {
                return { provider: 'mock', options: {} };
            }

            shouldSkipGlobalDimension(dimension: string, sections: SectionData[]): boolean {
                // Skip global_A
                return dimension === 'global_A';
            }
        }

        const plugin = new DependentGlobalPlugin();
        const engine = new DagEngine({
            plugin,
            providers: adapter,
            continueOnError: true,
        });

        const result = await engine.process([{ content: 'Test', metadata: {} }]);

        // global_A should be skipped
        expect(result.globalResults.global_A?.data).toEqual({
            skipped: true,
            reason: 'Skipped by plugin shouldSkipGlobalDimension',
        });

        // global_B should still attempt to process
        expect(result.globalResults.global_B).toBeDefined();
    });

});

