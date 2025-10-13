import { describe, test, expect, beforeEach } from 'vitest';
import { DagEngine } from '../src/core/engine.ts';
import { Plugin } from '../src/plugin';
import { ProviderRegistry } from '../src/providers/registry';
import { MockAIProvider, createMockSection } from './setup';

describe('DagEngine - Complex Dependencies', () => {
    let mockProvider: MockAIProvider;
    let registry: ProviderRegistry;

    beforeEach(() => {
        mockProvider = new MockAIProvider();
        mockProvider.setMockResponse('test', { result: 'ok' });
        registry = new ProviderRegistry();
        registry.register(mockProvider);
    });

    test('should handle diamond dependency pattern', async () => {
        const executionOrder: string[] = [];

        class DiamondPlugin extends Plugin {
            constructor() {
                super('diamond', 'Diamond', 'Test');
                this.dimensions = ['A', 'B', 'C', 'D'];
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
                    B: ['A'],
                    C: ['A'],
                    D: ['B', 'C']
                };
            }
        }

        const engine = new DagEngine({
            plugin: new DiamondPlugin(),
            registry
        });

        await engine.process([createMockSection('Test')]);

        // A must come first
        expect(executionOrder[0]).toBe('A');

        // B and C after A (order between them doesn't matter)
        expect(executionOrder.slice(1, 3)).toContain('B');
        expect(executionOrder.slice(1, 3)).toContain('C');

        // D must come last
        expect(executionOrder[3]).toBe('D');
    });

    test('should handle multiple levels of dependencies (>3)', async () => {
        const executionOrder: string[] = [];

        class DeepPlugin extends Plugin {
            constructor() {
                super('deep', 'Deep', 'Test');
                this.dimensions = ['L1', 'L2', 'L3', 'L4', 'L5'];
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
                    L2: ['L1'],
                    L3: ['L2'],
                    L4: ['L3'],
                    L5: ['L4']
                };
            }
        }

        const engine = new DagEngine({
            plugin: new DeepPlugin(),
            registry
        });

        await engine.process([createMockSection('Test')]);

        expect(executionOrder).toEqual(['L1', 'L2', 'L3', 'L4', 'L5']);
    });

    test('should handle mix of global and section dependencies', async () => {
        const executionOrder: string[] = [];

        class MixedDepsPlugin extends Plugin {
            constructor() {
                super('mixed', 'Mixed', 'Test');
                this.dimensions = [
                    { name: 'global1', scope: 'global' as const },
                    'section1',
                    'section2',
                    { name: 'global2', scope: 'global' as const }
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
                    section1: ['global1'],
                    section2: ['section1'],
                    global2: ['section2']
                };
            }
        }

        const engine = new DagEngine({
            plugin: new MixedDepsPlugin(),
            registry
        });

        await engine.process([createMockSection('Test')]);

        expect(executionOrder[0]).toBe('global1');
        expect(executionOrder[1]).toBe('section1');
        expect(executionOrder[2]).toBe('section2');
        expect(executionOrder[3]).toBe('global2');
    });

    test('should handle dependency on failed dimension', async () => {
        let receivedDeps: any = null;

        class FailedDepPlugin extends Plugin {
            constructor() {
                super('failed-dep', 'Failed Dep', 'Test');
                this.dimensions = ['failing', 'dependent'];
            }

            createPrompt(context: any): string {
                if (context.dimension === 'dependent') {
                    receivedDeps = context.dependencies;
                }
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            defineDependencies(): Record<string, string[]> {
                return { dependent: ['failing'] };
            }
        }

        mockProvider.execute = async (request) => {
            if (request.input === 'failing') {
                return { error: 'Intentional failure' };
            }
            return { data: { result: 'ok' } };
        };

        const engine = new DagEngine({
            plugin: new FailedDepPlugin(),
            registry,
            continueOnError: true
        });

        await engine.process([createMockSection('Test')]);

        expect(receivedDeps.failing).toBeDefined();
        expect(receivedDeps.failing.error).toBe('Intentional failure');
    });

    test('should handle partial dependency failures', async () => {
        let receivedDeps: any = null;

        class PartialFailPlugin extends Plugin {
            constructor() {
                super('partial', 'Partial', 'Test');
                this.dimensions = ['dep1', 'dep2', 'dependent'];
            }

            createPrompt(context: any): string {
                if (context.dimension === 'dependent') {
                    receivedDeps = context.dependencies;
                }
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            defineDependencies(): Record<string, string[]> {
                return { dependent: ['dep1', 'dep2'] };
            }
        }

        mockProvider.execute = async (request) => {
            if (request.input === 'dep1') {
                return { error: 'Dep1 failed' };
            }
            return { data: { result: 'ok' } };
        };

        const engine = new DagEngine({
            plugin: new PartialFailPlugin(),
            registry,
            continueOnError: true
        });

        await engine.process([createMockSection('Test')]);

        expect(receivedDeps.dep1.error).toBeDefined();
        expect(receivedDeps.dep2.data).toBeDefined();
    });

    test('should handle empty dependency arrays', async () => {
        class EmptyDepsPlugin extends Plugin {
            constructor() {
                super('empty-deps', 'Empty Deps', 'Test');
                this.dimensions = ['independent'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            defineDependencies(): Record<string, string[]> {
                return { independent: [] };
            }
        }

        const engine = new DagEngine({
            plugin: new EmptyDepsPlugin(),
            registry
        });

        const result = await engine.process([createMockSection('Test')]);

        expect(result.sections[0]?.results?.independent).toBeDefined();
    });

    test('should handle complex web of dependencies', async () => {
        const executionOrder: string[] = [];

        class ComplexWebPlugin extends Plugin {
            constructor() {
                super('web', 'Web', 'Test');
                this.dimensions = ['A', 'B', 'C', 'D', 'E', 'F'];
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
                    B: ['A'],
                    C: ['A'],
                    D: ['B', 'C'],
                    E: ['B'],
                    F: ['D', 'E']
                };
            }
        }

        const engine = new DagEngine({
            plugin: new ComplexWebPlugin(),
            registry
        });

        await engine.process([createMockSection('Test')]);

        // Verify topological order
        expect(executionOrder.indexOf('A')).toBeLessThan(executionOrder.indexOf('B'));
        expect(executionOrder.indexOf('A')).toBeLessThan(executionOrder.indexOf('C'));
        expect(executionOrder.indexOf('B')).toBeLessThan(executionOrder.indexOf('D'));
        expect(executionOrder.indexOf('C')).toBeLessThan(executionOrder.indexOf('D'));
        expect(executionOrder.indexOf('B')).toBeLessThan(executionOrder.indexOf('E'));
        expect(executionOrder.indexOf('D')).toBeLessThan(executionOrder.indexOf('F'));
        expect(executionOrder.indexOf('E')).toBeLessThan(executionOrder.indexOf('F'));
    });

    test('should handle global depending on multiple sections', async () => {
        let receivedDeps: any = null;

        class GlobalDepPlugin extends Plugin {
            constructor() {
                super('global-dep', 'Global Dep', 'Test');
                this.dimensions = [
                    'section1',
                    'section2',
                    'section3',
                    { name: 'global_aggregator', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                if (context.dimension === 'global_aggregator') {
                    receivedDeps = context.dependencies;
                }
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            defineDependencies(): Record<string, string[]> {
                return {
                    global_aggregator: ['section1', 'section2', 'section3']
                };
            }
        }

        mockProvider.setMockResponse('section1', { value: 1 });
        mockProvider.setMockResponse('section2', { value: 2 });
        mockProvider.setMockResponse('section3', { value: 3 });
        mockProvider.setMockResponse('global_aggregator', { sum: 6 });

        const engine = new DagEngine({
            plugin: new GlobalDepPlugin(),
            registry
        });

        await engine.process([createMockSection('Test')]);

        expect(receivedDeps.section1.data.aggregated).toBe(true);
        expect(receivedDeps.section2.data.aggregated).toBe(true);
        expect(receivedDeps.section3.data.aggregated).toBe(true);
    });

    test('should handle interdependent globals with transformation', async () => {
        const executionOrder: string[] = [];

        class InterdependentPlugin extends Plugin {
            constructor() {
                super('interdep', 'Interdep', 'Test');
                this.dimensions = [
                    { name: 'global1', scope: 'global' as const },
                    {
                        name: 'global2',
                        scope: 'global' as const,
                        transform: (result, sections) => {
                            return sections.slice(0, 2); // Keep only first 2
                        }
                    },
                    'section_analysis'
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
                    global2: ['global1'],
                    section_analysis: ['global2']
                };
            }
        }

        const engine = new DagEngine({
            plugin: new InterdependentPlugin(),
            registry
        });

        const result = await engine.process([
            createMockSection('Section 1'),
            createMockSection('Section 2'),
            createMockSection('Section 3')
        ]);

        expect(executionOrder[0]).toBe('global1');
        expect(executionOrder[1]).toBe('global2');
        expect(executionOrder[2]).toBe('section_analysis');

        // Transformation should have reduced sections
        expect(result.transformedSections).toHaveLength(2);
        expect(result.sections).toHaveLength(2); // Only 2 sections processed
    });
});