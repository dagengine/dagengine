import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { DagEngine } from '../../src/engine';
import { Plugin } from '../../src/plugin';
import { ProviderAdapter } from '../../src/providers/adapter';
import type {
    SectionDimensionContext,
    DimensionContext,
    SkipWithResult,
} from '../../src/types';

class MockProvider {
    name = 'mock';
    callLog: string[] = [];

    async execute(request: any) {
        this.callLog.push(request.dimension || 'unknown');
        return {
            data: { result: `result-${request.dimension}` },
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

    getDimensionCallCount(dimension: string): number {
        return this.callLog.filter(d => d === dimension).length;
    }
}

describe('Skip Logic Hooks', () => {
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

    describe('shouldSkipDimension', () => {
        test('should skip dimension when returns true', async () => {
            let hookCalled = false;

            class SkipPlugin extends Plugin {
                constructor() {
                    super('skip', 'Skip', 'Test');
                    this.dimensions = ['process', 'skip_me'];
                }

                createPrompt(context: any) {
                    return context.dimension;
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                shouldSkipDimension(context: SectionDimensionContext): boolean {
                    hookCalled = true;
                    return context.dimension === 'skip_me';
                }
            }

            const engine = new DagEngine({
                plugin: new SkipPlugin(),
                providers: adapter,
            });

            const result = await engine.process([{ content: 'Test', metadata: {} }]);

            expect(hookCalled).toBe(true);
            expect(mockProvider.getDimensionCallCount('process')).toBe(1);
            expect(mockProvider.getDimensionCallCount('skip_me')).toBe(0);
            expect(result.sections[0]?.results.skip_me?.data).toEqual({
                skipped: true,
                reason: 'Skipped by plugin shouldSkipDimension',
            });
        });

        test('should not skip dimension when returns false', async () => {
            class NoSkipPlugin extends Plugin {
                constructor() {
                    super('no-skip', 'No Skip', 'Test');
                    this.dimensions = ['test'];
                }

                createPrompt() {
                    return 'test';
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                shouldSkipDimension(): boolean {
                    return false;
                }
            }

            const engine = new DagEngine({
                plugin: new NoSkipPlugin(),
                providers: adapter,
            });

            await engine.process([{ content: 'Test', metadata: {} }]);

            expect(mockProvider.getDimensionCallCount('test')).toBe(1);
        });

        test('should not skip dimension when returns null', async () => {
            class NullSkipPlugin extends Plugin {
                constructor() {
                    super('null-skip', 'Null Skip', 'Test');
                    this.dimensions = ['test'];
                }

                createPrompt() {
                    return 'test';
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                shouldSkipDimension(): any {
                    return null;
                }
            }

            const engine = new DagEngine({
                plugin: new NullSkipPlugin(),
                providers: adapter,
            });

            await engine.process([{ content: 'Test', metadata: {} }]);

            expect(mockProvider.getDimensionCallCount('test')).toBe(1);
        });

        test('should not skip dimension when returns undefined', async () => {
            class UndefinedSkipPlugin extends Plugin {
                constructor() {
                    super('undefined-skip', 'Undefined Skip', 'Test');
                    this.dimensions = ['test'];
                }

                createPrompt() {
                    return 'test';
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                shouldSkipDimension(): any {
                    return undefined;
                }
            }

            const engine = new DagEngine({
                plugin: new UndefinedSkipPlugin(),
                providers: adapter,
            });

            await engine.process([{ content: 'Test', metadata: {} }]);

            expect(mockProvider.getDimensionCallCount('test')).toBe(1);
        });

        test('should use cached result when returns SkipWithResult', async () => {
            const cachedResult = {
                data: { cached: true, value: 'from-cache' },
                metadata: { source: 'cache' },
            };

            class CachedSkipPlugin extends Plugin {
                constructor() {
                    super('cached-skip', 'Cached Skip', 'Test');
                    this.dimensions = ['test'];
                }

                createPrompt() {
                    return 'test';
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                shouldSkipDimension(): SkipWithResult {
                    return {
                        skip: true,
                        result: cachedResult,
                    };
                }
            }

            const engine = new DagEngine({
                plugin: new CachedSkipPlugin(),
                providers: adapter,
            });

            const result = await engine.process([{ content: 'Test', metadata: {} }]);

            expect(mockProvider.getDimensionCallCount('test')).toBe(0);
            expect(result.sections[0]?.results.test?.data).toEqual({
                cached: true,
                value: 'from-cache',
            });
            expect(result.sections[0]?.results.test?.metadata?.cached).toBe(true);
            expect(result.sections[0]?.results.test?.metadata?.source).toBe('cache');
        });

        test('should skip based on section content', async () => {
            class ContentSkipPlugin extends Plugin {
                constructor() {
                    super('content-skip', 'Content Skip', 'Test');
                    this.dimensions = ['analyze'];
                }

                createPrompt() {
                    return 'test';
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                shouldSkipDimension(context: SectionDimensionContext): boolean {
                    return context.section.content.length < 10;
                }
            }

            const engine = new DagEngine({
                plugin: new ContentSkipPlugin(),
                providers: adapter,
            });

            const result = await engine.process([
                { content: 'Hi', metadata: {} },
                { content: 'This is long enough', metadata: {} },
            ]);

            expect(mockProvider.getDimensionCallCount('analyze')).toBe(1); // Only second section
            expect(result.sections[0]?.results.analyze?.data?.skipped).toBe(true);
            expect(result.sections[1]?.results.analyze?.data?.result).toBeDefined();
        });

        test('should skip based on section metadata', async () => {
            class MetadataSkipPlugin extends Plugin {
                constructor() {
                    super('metadata-skip', 'Metadata Skip', 'Test');
                    this.dimensions = ['process'];
                }

                createPrompt() {
                    return 'test';
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                shouldSkipDimension(context: SectionDimensionContext): boolean {
                    return context.section.metadata.skip === true;
                }
            }

            const engine = new DagEngine({
                plugin: new MetadataSkipPlugin(),
                providers: adapter,
            });

            const result = await engine.process([
                { content: 'Process this', metadata: {} },
                { content: 'Skip this', metadata: { skip: true } },
            ]);

            expect(mockProvider.getDimensionCallCount('process')).toBe(1);
            expect(result.sections[0]?.results.process?.data?.result).toBeDefined();
            expect(result.sections[1]?.results.process?.data?.skipped).toBe(true);
        });

        test('should skip based on dependencies', async () => {
            class DependencySkipPlugin extends Plugin {
                constructor() {
                    super('dep-skip', 'Dependency Skip', 'Test');
                    this.dimensions = ['check', 'analyze'];
                }

                createPrompt(context: any) {
                    return context.dimension;
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                defineDependencies() {
                    return { analyze: ['check'] };
                }

                shouldSkipDimension(context: SectionDimensionContext): boolean {
                    if (context.dimension === 'analyze') {
                        // Skip if check passed
                        return context.dependencies.check?.data?.result === 'result-check';
                    }
                    return false;
                }
            }

            const engine = new DagEngine({
                plugin: new DependencySkipPlugin(),
                providers: adapter,
            });

            const result = await engine.process([{ content: 'Test', metadata: {} }]);

            expect(mockProvider.getDimensionCallCount('check')).toBe(1);
            expect(mockProvider.getDimensionCallCount('analyze')).toBe(0);
            expect(result.sections[0]?.results.analyze?.data?.skipped).toBe(true);
        });

        test('should handle async shouldSkipDimension', async () => {
            let asyncCompleted = false;

            class AsyncSkipPlugin extends Plugin {
                constructor() {
                    super('async-skip', 'Async Skip', 'Test');
                    this.dimensions = ['test'];
                }

                createPrompt() {
                    return 'test';
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                async shouldSkipDimension(context: SectionDimensionContext): Promise<boolean> {
                    await new Promise(resolve => setTimeout(resolve, 50));
                    asyncCompleted = true;
                    return context.section.content === 'skip';
                }
            }

            const engine = new DagEngine({
                plugin: new AsyncSkipPlugin(),
                providers: adapter,
            });

            await engine.process([{ content: 'skip', metadata: {} }]);

            expect(asyncCompleted).toBe(true);
            expect(mockProvider.getDimensionCallCount('test')).toBe(0);
        });

        test('should handle errors in shouldSkipDimension gracefully', async () => {
            const errors: string[] = [];

            class ErrorSkipPlugin extends Plugin {
                constructor() {
                    super('error-skip', 'Error Skip', 'Test');
                    this.dimensions = ['test'];
                }

                createPrompt() {
                    return 'test';
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                shouldSkipDimension(): boolean {
                    throw new Error('shouldSkipDimension error');
                }
            }

            const engine = new DagEngine({
                plugin: new ErrorSkipPlugin(),
                providers: adapter,
            });

            const result = await engine.process([{ content: 'Test', metadata: {} }], {
                onError: (context, error) => errors.push(error.message),
            });

            // Should continue processing (default to false on error)
            expect(mockProvider.getDimensionCallCount('test')).toBe(1);
            expect(consoleErrorSpy).toHaveBeenCalled();
            expect(errors.some(e => e.includes('shouldSkipDimension'))).toBe(true);
        });

        test('should work with multiple sections independently', async () => {
            class IndependentSkipPlugin extends Plugin {
                constructor() {
                    super('independent', 'Independent', 'Test');
                    this.dimensions = ['process'];
                }

                createPrompt() {
                    return 'test';
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                shouldSkipDimension(context: SectionDimensionContext): boolean {
                    return context.sectionIndex % 2 === 1; // Skip odd indices
                }
            }

            const engine = new DagEngine({
                plugin: new IndependentSkipPlugin(),
                providers: adapter,
            });

            const result = await engine.process([
                { content: 'Section 0', metadata: {} },
                { content: 'Section 1', metadata: {} },
                { content: 'Section 2', metadata: {} },
                { content: 'Section 3', metadata: {} },
            ]);

            expect(mockProvider.getDimensionCallCount('process')).toBe(2); // Sections 0 and 2
            expect(result.sections[0]?.results.process?.data?.result).toBeDefined();
            expect(result.sections[1]?.results.process?.data?.skipped).toBe(true);
            expect(result.sections[2]?.results.process?.data?.result).toBeDefined();
            expect(result.sections[3]?.results.process?.data?.skipped).toBe(true);
        });
    });

    describe('shouldSkipGlobalDimension', () => {
        test('should skip global dimension when returns true', async () => {
            let hookCalled = false;

            class GlobalSkipPlugin extends Plugin {
                constructor() {
                    super('global-skip', 'Global Skip', 'Test');
                    this.dimensions = [
                        { name: 'global_process', scope: 'global' as const },
                        { name: 'global_skip', scope: 'global' as const },
                    ];
                }

                createPrompt(context: any) {
                    return context.dimension;
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                shouldSkipGlobalDimension(context: DimensionContext): boolean {
                    hookCalled = true;
                    return context.dimension === 'global_skip';
                }
            }

            const engine = new DagEngine({
                plugin: new GlobalSkipPlugin(),
                providers: adapter,
            });

            const result = await engine.process([{ content: 'Test', metadata: {} }]);

            expect(hookCalled).toBe(true);
            expect(mockProvider.getDimensionCallCount('global_process')).toBe(1);
            expect(mockProvider.getDimensionCallCount('global_skip')).toBe(0);
            expect(result.globalResults.global_skip?.data).toEqual({
                skipped: true,
                reason: 'Skipped by plugin shouldSkipGlobalDimension',
            });
        });

        test('should not skip global dimension when returns false', async () => {
            class NoGlobalSkipPlugin extends Plugin {
                constructor() {
                    super('no-global-skip', 'No Global Skip', 'Test');
                    this.dimensions = [{ name: 'global_test', scope: 'global' as const }];
                }

                createPrompt() {
                    return 'test';
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                shouldSkipGlobalDimension(): boolean {
                    return false;
                }
            }

            const engine = new DagEngine({
                plugin: new NoGlobalSkipPlugin(),
                providers: adapter,
            });

            await engine.process([{ content: 'Test', metadata: {} }]);

            expect(mockProvider.getDimensionCallCount('global_test')).toBe(1);
        });

        test('should use cached result for global dimension', async () => {
            const cachedResult = {
                data: { globalCached: true, summary: 'cached-summary' },
                metadata: { fromCache: true },
            };

            class CachedGlobalPlugin extends Plugin {
                constructor() {
                    super('cached-global', 'Cached Global', 'Test');
                    this.dimensions = [{ name: 'summary', scope: 'global' as const }];
                }

                createPrompt() {
                    return 'test';
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                shouldSkipGlobalDimension(): SkipWithResult {
                    return {
                        skip: true,
                        result: cachedResult,
                    };
                }
            }

            const engine = new DagEngine({
                plugin: new CachedGlobalPlugin(),
                providers: adapter,
            });

            const result = await engine.process([{ content: 'Test', metadata: {} }]);

            expect(mockProvider.getDimensionCallCount('summary')).toBe(0);
            expect(result.globalResults.summary?.data).toEqual({
                globalCached: true,
                summary: 'cached-summary',
            });
            expect(result.globalResults.summary?.metadata?.cached).toBe(true);
        });

        test('should skip based on all sections content', async () => {
            class AggregateSkipPlugin extends Plugin {
                constructor() {
                    super('aggregate-skip', 'Aggregate Skip', 'Test');
                    this.dimensions = [{ name: 'global_summary', scope: 'global' as const }];
                }

                createPrompt() {
                    return 'test';
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                shouldSkipGlobalDimension(context: DimensionContext): boolean {
                    // Skip if all sections are too short
                    return context.sections.every(s => s.content.length < 10);
                }
            }

            const engine = new DagEngine({
                plugin: new AggregateSkipPlugin(),
                providers: adapter,
            });

            // Test 1: All short - should skip
            mockProvider.reset();
            const result1 = await engine.process([
                { content: 'Hi', metadata: {} },
                { content: 'Bye', metadata: {} },
            ]);
            expect(mockProvider.getDimensionCallCount('global_summary')).toBe(0);
            expect(result1.globalResults.global_summary?.data?.skipped).toBe(true);

            // Test 2: At least one long - should process
            mockProvider.reset();
            const result2 = await engine.process([
                { content: 'Hi', metadata: {} },
                { content: 'This is long enough', metadata: {} },
            ]);
            expect(mockProvider.getDimensionCallCount('global_summary')).toBe(1);
        });

        test('should skip based on section count', async () => {
            class SectionCountSkipPlugin extends Plugin {
                constructor() {
                    super('count-skip', 'Count Skip', 'Test');
                    this.dimensions = [{ name: 'summary', scope: 'global' as const }];
                }

                createPrompt() {
                    return 'test';
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                shouldSkipGlobalDimension(context: DimensionContext): boolean {
                    // Skip if only one section
                    return context.sections.length === 1;
                }
            }

            const engine = new DagEngine({
                plugin: new SectionCountSkipPlugin(),
                providers: adapter,
            });

            // Test 1: Single section - skip
            mockProvider.reset();
            const result1 = await engine.process([{ content: 'One', metadata: {} }]);
            expect(mockProvider.getDimensionCallCount('summary')).toBe(0);

            // Test 2: Multiple sections - process
            mockProvider.reset();
            const result2 = await engine.process([
                { content: 'One', metadata: {} },
                { content: 'Two', metadata: {} },
            ]);
            expect(mockProvider.getDimensionCallCount('summary')).toBe(1);
        });

        test('should skip based on dependencies', async () => {
            class GlobalDepSkipPlugin extends Plugin {
                constructor() {
                    super('global-dep-skip', 'Global Dep Skip', 'Test');
                    this.dimensions = [
                        'section_check',
                        { name: 'global_summary', scope: 'global' as const },
                    ];
                }

                createPrompt(context: any) {
                    return context.dimension;
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                defineDependencies() {
                    return { global_summary: ['section_check'] };
                }

                shouldSkipGlobalDimension(context: DimensionContext): boolean {
                    if (context.dimension === 'global_summary') {
                        // Skip if section_check succeeded
                        const sectionCheckData = context.dependencies.section_check?.data;
                        return sectionCheckData?.aggregated === true;
                    }
                    return false;
                }
            }

            const engine = new DagEngine({
                plugin: new GlobalDepSkipPlugin(),
                providers: adapter,
            });

            const result = await engine.process([{ content: 'Test', metadata: {} }]);

            expect(mockProvider.getDimensionCallCount('section_check')).toBe(1);
            expect(mockProvider.getDimensionCallCount('global_summary')).toBe(0);
            expect(result.globalResults.global_summary?.data?.skipped).toBe(true);
        });

        test('should handle async shouldSkipGlobalDimension', async () => {
            let asyncCompleted = false;

            class AsyncGlobalSkipPlugin extends Plugin {
                constructor() {
                    super('async-global-skip', 'Async Global Skip', 'Test');
                    this.dimensions = [{ name: 'summary', scope: 'global' as const }];
                }

                createPrompt() {
                    return 'test';
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                async shouldSkipGlobalDimension(context: DimensionContext): Promise<boolean> {
                    await new Promise(resolve => setTimeout(resolve, 50));
                    asyncCompleted = true;
                    return context.sections.length < 2;
                }
            }

            const engine = new DagEngine({
                plugin: new AsyncGlobalSkipPlugin(),
                providers: adapter,
            });

            await engine.process([{ content: 'Test', metadata: {} }]);

            expect(asyncCompleted).toBe(true);
            expect(mockProvider.getDimensionCallCount('summary')).toBe(0);
        });

        test('should handle errors in shouldSkipGlobalDimension gracefully', async () => {
            const errors: string[] = [];

            class ErrorGlobalSkipPlugin extends Plugin {
                constructor() {
                    super('error-global-skip', 'Error Global Skip', 'Test');
                    this.dimensions = [{ name: 'summary', scope: 'global' as const }];
                }

                createPrompt() {
                    return 'test';
                }

                selectProvider() {
                    return { provider: 'mock', options: {} };
                }

                shouldSkipGlobalDimension(): boolean {
                    throw new Error('shouldSkipGlobalDimension error');
                }
            }

            const engine = new DagEngine({
                plugin: new ErrorGlobalSkipPlugin(),
                providers: adapter,
            });

            const result = await engine.process([{ content: 'Test', metadata: {} }], {
                onError: (context, error) => errors.push(error.message),
            });

            // Should continue processing (default to false on error)
            expect(mockProvider.getDimensionCallCount('summary')).toBe(1);
            expect(consoleErrorSpy).toHaveBeenCalled();
            expect(errors.some(e => e.includes('shouldSkipGlobalDimension'))).toBe(true);
        });
    });
});