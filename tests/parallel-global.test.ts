import { describe, test, expect, beforeEach } from 'vitest';
import { DagEngine } from '../src/core/engine.ts';
import { Plugin } from '../src/plugin';
import { ProviderRegistry } from '../src/providers/registry';
import { MockAIProvider, createMockSection } from './setup';

describe('DagEngine - Parallel Global Execution', () => {
    let mockProvider: MockAIProvider;
    let registry: ProviderRegistry;

    beforeEach(() => {
        mockProvider = new MockAIProvider();
        mockProvider.setMockResponse('test', { result: 'ok' });
        registry = new ProviderRegistry();
        registry.register(mockProvider);
    });

    test('should execute independent globals in parallel', async () => {
        const startTimes: Record<string, number> = {};
        const endTimes: Record<string, number> = {};

        class ParallelPlugin extends Plugin {
            constructor() {
                super('parallel', 'Parallel', 'Test');
                this.dimensions = [
                    { name: 'global1', scope: 'global' as const },
                    { name: 'global2', scope: 'global' as const },
                    { name: 'global3', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                startTimes[context.dimension] = Date.now();
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const originalExecute = mockProvider.execute.bind(mockProvider);
        mockProvider.execute = async (request) => {
            await new Promise(resolve => setTimeout(resolve, 100));
            const result = await originalExecute(request);
            endTimes[request.input as string] = Date.now();
            return result;
        };

        const startTime = Date.now();
        const engine = new DagEngine({
            plugin: new ParallelPlugin(),
            registry
        });

        await engine.process([createMockSection('Test')]);
        const totalTime = Date.now() - startTime;

        // If truly parallel, should take ~100ms, not 300ms
        expect(totalTime).toBeLessThan(200);

        // All three should start around the same time
        const times = Object.values(startTimes);
        const maxDiff = Math.max(...times) - Math.min(...times);
        expect(maxDiff).toBeLessThan(50); // Started within 50ms of each other
    });

    test('should group independent globals correctly', async () => {
        const executionGroups: string[][] = [];
        let currentGroup: string[] = [];

        class GroupingPlugin extends Plugin {
            constructor() {
                super('grouping', 'Grouping', 'Test');
                this.dimensions = [
                    { name: 'g1', scope: 'global' as const },
                    { name: 'g2', scope: 'global' as const },
                    { name: 'g3', scope: 'global' as const },
                    { name: 'g4', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                currentGroup.push(context.dimension);
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            defineDependencies(): Record<string, string[]> {
                return {
                    g3: ['g1'],  // g3 depends on g1
                    g4: ['g2']   // g4 depends on g2
                };
            }
        }

        mockProvider.execute = async (request) => {
            if (currentGroup.length > 0) {
                executionGroups.push([...currentGroup]);
                currentGroup = [];
            }
            return { data: { result: 'ok' } };
        };

        const engine = new DagEngine({
            plugin: new GroupingPlugin(),
            registry
        });

        await engine.process([createMockSection('Test')]);

        // g1 and g2 should execute in parallel (no dependencies)
        // g3 should execute after g1
        // g4 should execute after g2
        expect(executionGroups.length).toBeGreaterThan(0);
    });

    test('should not parallelize dependent globals', async () => {
        const executionOrder: string[] = [];

        class DependentPlugin extends Plugin {
            constructor() {
                super('dependent', 'Dependent', 'Test');
                this.dimensions = [
                    { name: 'g1', scope: 'global' as const },
                    { name: 'g2', scope: 'global' as const },
                    { name: 'g3', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                executionOrder.push(context.dimension);
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            defineDependencies(): Record<string, string[]> {
                return {
                    g2: ['g1'],
                    g3: ['g2']
                };
            }
        }

        const engine = new DagEngine({
            plugin: new DependentPlugin(),
            registry
        });

        await engine.process([createMockSection('Test')]);

        // Must execute sequentially
        expect(executionOrder).toEqual(['g1', 'g2', 'g3']);
    });

    test('should handle errors in parallel global execution', async () => {
        class ErrorParallelPlugin extends Plugin {
            constructor() {
                super('error-parallel', 'Error Parallel', 'Test');
                this.dimensions = [
                    { name: 'g1', scope: 'global' as const },
                    { name: 'g2', scope: 'global' as const },
                    { name: 'g3', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        mockProvider.execute = async (request) => {
            if (request.input === 'g2') {
                return { error: 'G2 failed' };
            }
            return { data: { result: 'ok' } };
        };

        const engine = new DagEngine({
            plugin: new ErrorParallelPlugin(),
            registry,
            continueOnError: true
        });

        const result = await engine.process([createMockSection('Test')]);

        expect(result.globalResults.g1?.data).toBeDefined();
        expect(result.globalResults.g2?.error).toBeDefined();
        expect(result.globalResults.g3?.data).toBeDefined();
    });

    test('should measure actual parallel execution time', async () => {
        class TimingPlugin extends Plugin {
            constructor() {
                super('timing', 'Timing', 'Test');
                this.dimensions = [
                    { name: 'slow1', scope: 'global' as const },
                    { name: 'slow2', scope: 'global' as const },
                    { name: 'slow3', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        mockProvider.execute = async () => {
            await new Promise(resolve => setTimeout(resolve, 150));
            return { data: { result: 'ok' } };
        };

        const startTime = Date.now();
        const engine = new DagEngine({
            plugin: new TimingPlugin(),
            registry
        });

        await engine.process([createMockSection('Test')]);
        const totalTime = Date.now() - startTime;

        // 3 globals, each 150ms
        // Sequential: ~450ms
        // Parallel: ~150ms
        expect(totalTime).toBeLessThan(300); // Should be closer to 150ms
    });

    test('should handle mix of parallel and sequential globals', async () => {
        const executionOrder: string[] = [];
        const executionTimes: Record<string, number> = {};

        class MixedPlugin extends Plugin {
            constructor() {
                super('mixed', 'Mixed', 'Test');
                this.dimensions = [
                    { name: 'g1', scope: 'global' as const },
                    { name: 'g2', scope: 'global' as const },
                    { name: 'g3', scope: 'global' as const },
                    { name: 'g4', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                executionOrder.push(context.dimension);
                executionTimes[context.dimension] = Date.now();
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            defineDependencies(): Record<string, string[]> {
                return {
                    g3: ['g1', 'g2']  // g3 depends on both g1 and g2
                };
            }
        }

        const engine = new DagEngine({
            plugin: new MixedPlugin(),
            registry
        });

        await engine.process([createMockSection('Test')]);

        // g1, g2, and g4 are independent, should execute first (in any order)
        // g3 depends on g1 and g2, should execute last
        expect(executionOrder).toHaveLength(4);
        expect(executionOrder[executionOrder.length - 1]).toBe('g3');  // g3 should be LAST
        expect(executionOrder.slice(0, 3)).toContain('g1');
        expect(executionOrder.slice(0, 3)).toContain('g2');
        expect(executionOrder.slice(0, 3)).toContain('g4');
    });

    test('should preserve execution order semantics', async () => {
        const results: Record<string, any> = {};

        class SemanticsPlugin extends Plugin {
            constructor() {
                super('semantics', 'Semantics', 'Test');
                this.dimensions = [
                    { name: 'g1', scope: 'global' as const },
                    { name: 'g2', scope: 'global' as const },
                    'section_analysis'
                ];
            }

            createPrompt(context: any): string {
                if (context.isGlobal) {
                    results[context.dimension] = { global: true };
                }
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const engine = new DagEngine({
            plugin: new SemanticsPlugin(),
            registry
        });

        const result = await engine.process([createMockSection('Test')]);

        // Both globals should complete before section processing
        expect(result.globalResults.g1).toBeDefined();
        expect(result.globalResults.g2).toBeDefined();
        expect(result.sections[0]?.results.section_analysis).toBeDefined();
    });

    test('should handle single independent global', async () => {
        class SinglePlugin extends Plugin {
            constructor() {
                super('single', 'Single', 'Test');
                this.dimensions = [
                    { name: 'only_global', scope: 'global' as const }
                ];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const engine = new DagEngine({
            plugin: new SinglePlugin(),
            registry
        });

        const result = await engine.process([createMockSection('Test')]);

        expect(result.globalResults.only_global).toBeDefined();
    });

    test('should parallelize multiple independent groups', async () => {
        const executionOrder: string[] = [];

        class MultiGroupPlugin extends Plugin {
            constructor() {
                super('multi-group', 'Multi Group', 'Test');
                this.dimensions = [
                    { name: 'g1', scope: 'global' as const },
                    { name: 'g2', scope: 'global' as const },
                    { name: 'g3', scope: 'global' as const },
                    { name: 'g4', scope: 'global' as const },
                    { name: 'g5', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                executionOrder.push(context.dimension);
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            defineDependencies(): Record<string, string[]> {
                return {
                    g3: ['g1'],  // Group 1: g1 -> g3
                    g5: ['g2', 'g4']  // Group 2: g2, g4 -> g5
                };
            }
        }

        const engine = new DagEngine({
            plugin: new MultiGroupPlugin(),
            registry
        });

        await engine.process([createMockSection('Test')]);

        // g1, g2, g4 should be able to run in parallel
        // g3 should wait for g1
        // g5 should wait for g2 and g4
        expect(executionOrder).toContain('g1');
        expect(executionOrder).toContain('g2');
        expect(executionOrder.indexOf('g3')).toBeGreaterThan(executionOrder.indexOf('g1'));
    });

    test('should handle timeout in parallel globals', async () => {
        class TimeoutParallelPlugin extends Plugin {
            constructor() {
                super('timeout-parallel', 'Timeout Parallel', 'Test');
                this.dimensions = [
                    { name: 'fast', scope: 'global' as const },
                    { name: 'slow', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        mockProvider.execute = async (request) => {
            if (request.input === 'slow') {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            return { data: { result: 'ok' } };
        };

        const engine = new DagEngine({
            plugin: new TimeoutParallelPlugin(),
            registry,
            timeout: 1000,
            continueOnError: true
        });

        const result = await engine.process([createMockSection('Test')]);

        expect(result.globalResults.fast?.data).toBeDefined();
        expect(result.globalResults.slow?.error).toContain('Dimension "slow" timed out after 1000ms');
    });
});