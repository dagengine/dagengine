import { describe, test, expect, beforeEach } from 'vitest';
import { DagEngine } from '../src/core/engine.ts';
import { Plugin } from '../src/plugin';
import { ProviderRegistry } from '../src/providers/registry';
import { MockAIProvider, createMockSection } from './setup';

describe('DagEngine - Global Dimensions', () => {
    let mockProvider: MockAIProvider;
    let registry: ProviderRegistry;

    beforeEach(() => {
        mockProvider = new MockAIProvider();
        registry = new ProviderRegistry();
        registry.register(mockProvider);
    });

    test('should process global dimensions', async () => {
        class GlobalPlugin extends Plugin {
            constructor() {
                super('global', 'Global', 'Test global');
                this.dimensions = [
                    { name: 'global_analysis', scope: 'global' as const },
                    'section_analysis'
                ];
            }

            createPrompt(context: any): string {
                return `Analyze ${context.dimension}`;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        mockProvider.setMockResponse('Analyze global_analysis', { themes: ['theme1'] });
        mockProvider.setMockResponse('Analyze section_analysis', { result: 'section' });

        const engine = new DagEngine({
            plugin: new GlobalPlugin(),
            registry
        });

        const result = await engine.process([
            createMockSection('Section 1'),
            createMockSection('Section 2')
        ]);

        expect(result.globalResults.global_analysis).toBeDefined();
        expect(result.globalResults.global_analysis?.data).toEqual({ themes: ['theme1'] });
    });

    test('should process global dimensions after sections', async () => {
        const executionOrder: string[] = [];

        class GlobalAfterPlugin extends Plugin {
            constructor() {
                super('global-after', 'Global After', 'Test');
                this.dimensions = [
                    'section_dim',
                    { name: 'global_summary', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                executionOrder.push(context.dimension);
                return `Process ${context.dimension}`;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            defineDependencies(): Record<string, string[]> {
                return {
                    global_summary: ['section_dim']
                };
            }
        }

        const engine = new DagEngine({
            plugin: new GlobalAfterPlugin(),
            registry
        });

        await engine.process([createMockSection('Test')]);

        expect(executionOrder).toContain('section_dim');
        expect(executionOrder).toContain('global_summary');
        expect(executionOrder.indexOf('section_dim')).toBeLessThan(
            executionOrder.indexOf('global_summary')
        );
    });

    test('should apply transformation function', async () => {
        class TransformPlugin extends Plugin {
            constructor() {
                super('transform', 'Transform', 'Test transform');
                this.dimensions = [
                    {
                        name: 'merger',
                        scope: 'global' as const,
                        transform: (result: any, sections: any[]) => {
                            // Merge all sections into one
                            return [{
                                content: sections.map(s => s.content).join(' '),
                                metadata: { merged: true }
                            }];
                        }
                    },
                    'analysis'
                ];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        mockProvider.setMockResponse('test', { result: 'ok' });

        const engine = new DagEngine({
            plugin: new TransformPlugin(),
            registry
        });

        const result = await engine.process([
            createMockSection('Section 1'),
            createMockSection('Section 2'),
            createMockSection('Section 3')
        ]);

        expect(result.transformedSections).toHaveLength(1);
        expect(result.transformedSections[0]?.content).toBe('Section 1 Section 2 Section 3');
        expect(result.transformedSections[0]?.metadata.merged).toBe(true);
    });

    test('should process parallel independent global dimensions', async () => {
        const startTimes: Record<string, number> = {};
        const endTimes: Record<string, number> = {};

        class ParallelGlobalPlugin extends Plugin {
            constructor() {
                super('parallel', 'Parallel', 'Test parallel');
                this.dimensions = [
                    { name: 'global1', scope: 'global' as const },
                    { name: 'global2', scope: 'global' as const },
                    { name: 'global3', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                startTimes[context.dimension] = Date.now();
                return `Process ${context.dimension}`;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        mockProvider.delay = 100; // Add delay to see parallel execution

        const engine = new DagEngine({
            plugin: new ParallelGlobalPlugin(),
            registry
        });

        const startTime = Date.now();
        await engine.process([createMockSection('Test')]);
        const totalTime = Date.now() - startTime;

        // If truly parallel, should take ~100ms, not 300ms
        expect(totalTime).toBeLessThan(250); // Some buffer for overhead
    });
});
