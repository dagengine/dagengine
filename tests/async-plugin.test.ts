import { describe, test, expect, beforeEach } from 'vitest';
import { DagEngine } from '../src/engine';
import { Plugin, PromptContext, ProviderSelection } from '../src/plugin';
import { ProviderRegistry } from '../src/providers/registry';
import { MockAIProvider, createMockSection } from './setup';
import { SectionData, DimensionResult } from '../src/types';

describe('DagEngine - Async Plugin Methods', () => {
    let mockProvider: MockAIProvider;
    let registry: ProviderRegistry;

    beforeEach(() => {
        mockProvider = new MockAIProvider();
        mockProvider.setMockResponse('test', { result: 'ok' });
        registry = new ProviderRegistry();
        registry.register(mockProvider);
    });

    describe('Async createPrompt()', () => {
        test('should handle async createPrompt with external API call', async () => {
            class AsyncPromptPlugin extends Plugin {
                constructor() {
                    super('async-prompt', 'Async Prompt', 'Test');
                    this.dimensions = ['fetch_and_analyze'];
                }

                async createPrompt(context: PromptContext): Promise<string> {
                    // Simulate API call
                    await new Promise(resolve => setTimeout(resolve, 50));
                    const externalData = { status: 'fetched', timestamp: Date.now() };

                    return `Analyze with context: ${JSON.stringify(externalData)}\n${context.sections[0]?.content}`;
                }

                selectProvider(): ProviderSelection {
                    return { provider: 'mock-ai', options: {} };
                }
            }

            const engine = new DagEngine({
                plugin: new AsyncPromptPlugin(),
                registry
            });

            const result = await engine.process([createMockSection('Test content')]);

            expect(result.sections[0]?.results.fetch_and_analyze).toBeDefined();
            expect(result.sections[0]?.results.fetch_and_analyze?.data).toBeDefined();
        });

        test('should handle sync createPrompt (backward compatibility)', async () => {
            class SyncPromptPlugin extends Plugin {
                constructor() {
                    super('sync-prompt', 'Sync Prompt', 'Test');
                    this.dimensions = ['simple'];
                }

                createPrompt(context: PromptContext): string {
                    return `Simple: ${context.sections[0]?.content}`;
                }

                selectProvider(): ProviderSelection {
                    return { provider: 'mock-ai', options: {} };
                }
            }

            const engine = new DagEngine({
                plugin: new SyncPromptPlugin(),
                registry
            });

            const result = await engine.process([createMockSection('Test')]);

            expect(result.sections[0]?.results.simple).toBeDefined();
        });

        test('should handle async createPrompt with database query simulation', async () => {
            const queryLog: string[] = [];

            class DatabasePromptPlugin extends Plugin {
                constructor() {
                    super('db-prompt', 'DB Prompt', 'Test');
                    this.dimensions = ['enrich'];
                }

                async createPrompt(context: PromptContext): Promise<string> {
                    // Simulate database query
                    queryLog.push('db-query-start');
                    await new Promise(resolve => setTimeout(resolve, 30));
                    const dbResult = { userId: 123, preferences: ['tech', 'science'] };
                    queryLog.push('db-query-end');

                    return `User context: ${JSON.stringify(dbResult)}\nContent: ${context.sections[0]?.content}`;
                }

                selectProvider(): ProviderSelection {
                    return { provider: 'mock-ai', options: {} };
                }
            }

            const engine = new DagEngine({
                plugin: new DatabasePromptPlugin(),
                registry
            });

            await engine.process([createMockSection('Analyze this')]);

            expect(queryLog).toEqual(['db-query-start', 'db-query-end']);
        });

        test('should handle async createPrompt with Promise.all for parallel calls', async () => {
            class ParallelPromptPlugin extends Plugin {
                constructor() {
                    super('parallel-prompt', 'Parallel Prompt', 'Test');
                    this.dimensions = ['multi_source'];
                }

                async createPrompt(context: PromptContext): Promise<string> {
                    // Simulate multiple parallel API calls
                    const [data1, data2, data3] = await Promise.all([
                        this.fetchData('source1'),
                        this.fetchData('source2'),
                        this.fetchData('source3')
                    ]);

                    return `Sources: ${data1}, ${data2}, ${data3}\nContent: ${context.sections[0]?.content}`;
                }

                private async fetchData(source: string): Promise<string> {
                    await new Promise(resolve => setTimeout(resolve, 20));
                    return `data-from-${source}`;
                }

                selectProvider(): ProviderSelection {
                    return { provider: 'mock-ai', options: {} };
                }
            }

            const engine = new DagEngine({
                plugin: new ParallelPromptPlugin(),
                registry
            });

            const startTime = Date.now();
            await engine.process([createMockSection('Test')]);
            const duration = Date.now() - startTime;

            // Should take ~20ms (parallel), not ~60ms (sequential)
            expect(duration).toBeLessThan(100);
        });
    });

    describe('Async selectProvider()', () => {
        test('should handle async provider selection with health check', async () => {
            const healthChecks: string[] = [];

            class AsyncProviderPlugin extends Plugin {
                constructor() {
                    super('async-provider', 'Async Provider', 'Test');
                    this.dimensions = ['analyze'];
                }

                createPrompt(context: PromptContext): string {
                    return context.sections[0]?.content;
                }

                async selectProvider(): Promise<ProviderSelection> {
                    // Simulate health check
                    healthChecks.push('checking-mock-ai');
                    await new Promise(resolve => setTimeout(resolve, 20));
                    const isHealthy = true;
                    healthChecks.push('mock-ai-healthy');

                    return {
                        provider: isHealthy ? 'mock-ai' : 'fallback',
                        options: {}
                    };
                }
            }

            const engine = new DagEngine({
                plugin: new AsyncProviderPlugin(),
                registry
            });

            await engine.process([createMockSection('Test')]);

            expect(healthChecks).toEqual(['checking-mock-ai', 'mock-ai-healthy']);
        });

        test('should handle sync selectProvider (backward compatibility)', async () => {
            class SyncProviderPlugin extends Plugin {
                constructor() {
                    super('sync-provider', 'Sync Provider', 'Test');
                    this.dimensions = ['simple'];
                }

                createPrompt(): string {
                    return 'test';
                }

                selectProvider(): ProviderSelection {
                    return { provider: 'mock-ai', options: {} };
                }
            }

            const engine = new DagEngine({
                plugin: new SyncProviderPlugin(),
                registry
            });

            const result = await engine.process([createMockSection('Test')]);

            expect(result.sections[0]?.results.simple).toBeDefined();
        });

        test('should handle async provider selection with rate limit check', async () => {
            const rateLimits = new Map<string, number>([
                ['mock-ai', 100],
                ['fallback', 50]
            ]);

            class RateLimitProviderPlugin extends Plugin {
                constructor() {
                    super('rate-limit', 'Rate Limit', 'Test');
                    this.dimensions = ['process'];
                }

                createPrompt(): string {
                    return 'test';
                }

                async selectProvider(): Promise<ProviderSelection> {
                    // Check rate limits
                    await new Promise(resolve => setTimeout(resolve, 10));

                    const mockAiLimit = rateLimits.get('mock-ai') || 0;
                    if (mockAiLimit > 0) {
                        rateLimits.set('mock-ai', mockAiLimit - 1);
                        return { provider: 'mock-ai', options: {} };
                    }

                    return { provider: 'fallback', options: {} };
                }
            }

            const engine = new DagEngine({
                plugin: new RateLimitProviderPlugin(),
                registry
            });

            await engine.process([createMockSection('Test')]);

            expect(rateLimits.get('mock-ai')).toBe(99);
        });
    });

    describe('Async getDependencies()', () => {
        test('should handle async getDependencies from config file', async () => {
            class AsyncDependenciesPlugin extends Plugin {
                constructor() {
                    super('async-deps', 'Async Deps', 'Test');
                    this.dimensions = ['step1', 'step2', 'step3'];
                }

                async getDependencies(): Promise<Record<string, string[]>> {
                    // Simulate loading from config file
                    await new Promise(resolve => setTimeout(resolve, 30));
                    return {
                        step2: ['step1'],
                        step3: ['step2']
                    };
                }

                createPrompt(context: PromptContext): string {
                    return context.dimension;
                }

                selectProvider(): ProviderSelection {
                    return { provider: 'mock-ai', options: {} };
                }
            }

            const executionOrder: string[] = [];
            mockProvider.execute = async (request) => {
                executionOrder.push(request.input as string);
                return { data: { result: 'ok' } };
            };

            const engine = new DagEngine({
                plugin: new AsyncDependenciesPlugin(),
                registry
            });

            await engine.process([createMockSection('Test')]);

            expect(executionOrder).toEqual(['step1', 'step2', 'step3']);
        });

        test('should handle sync getDependencies (backward compatibility)', async () => {
            class SyncDependenciesPlugin extends Plugin {
                constructor() {
                    super('sync-deps', 'Sync Deps', 'Test');
                    this.dimensions = ['a', 'b'];
                }

                getDependencies(): Record<string, string[]> {
                    return { b: ['a'] };
                }

                createPrompt(context: PromptContext): string {
                    return context.dimension;
                }

                selectProvider(): ProviderSelection {
                    return { provider: 'mock-ai', options: {} };
                }
            }

            const engine = new DagEngine({
                plugin: new SyncDependenciesPlugin(),
                registry
            });

            const result = await engine.process([createMockSection('Test')]);

            expect(result.sections[0]?.results.a).toBeDefined();
            expect(result.sections[0]?.results.b).toBeDefined();
        });
    });

    describe('Async getDimensionNames()', () => {
        test('should handle async getDimensionNames from database', async () => {
            const userTiers = new Map([['user-123', 'premium']]);

            class AsyncDimensionNamesPlugin extends Plugin {
                constructor() {
                    super('async-dims', 'Async Dims', 'Test');
                    this.dimensions = []; // Will be populated async
                }

                async getDimensionNames(): Promise<string[]> {
                    // Simulate database query
                    await new Promise(resolve => setTimeout(resolve, 30));
                    const tier = userTiers.get('user-123');

                    return tier === 'premium'
                        ? ['basic', 'advanced', 'premium_feature']
                        : ['basic', 'advanced'];
                }

                createPrompt(context: PromptContext): string {
                    return context.dimension;
                }

                selectProvider(): ProviderSelection {
                    return { provider: 'mock-ai', options: {} };
                }
            }

            const engine = new DagEngine({
                plugin: new AsyncDimensionNamesPlugin(),
                registry
            });

            const result = await engine.process([createMockSection('Test')]);

            expect(result.sections[0]?.results.basic).toBeDefined();
            expect(result.sections[0]?.results.advanced).toBeDefined();
            expect(result.sections[0]?.results.premium_feature).toBeDefined();
        });

        test('should handle sync getDimensionNames (backward compatibility)', async () => {
            class SyncDimensionNamesPlugin extends Plugin {
                constructor() {
                    super('sync-dims', 'Sync Dims', 'Test');
                    this.dimensions = ['dim1', 'dim2'];
                }

                createPrompt(): string {
                    return 'test';
                }

                selectProvider(): ProviderSelection {
                    return { provider: 'mock-ai', options: {} };
                }
            }

            const engine = new DagEngine({
                plugin: new SyncDimensionNamesPlugin(),
                registry
            });

            const result = await engine.process([createMockSection('Test')]);

            expect(result.sections[0]?.results.dim1).toBeDefined();
            expect(result.sections[0]?.results.dim2).toBeDefined();
        });
    });

    describe('Async processResults()', () => {
        test('should handle async processResults with database storage', async () => {
            const storedResults: any[] = [];

            class AsyncProcessResultsPlugin extends Plugin {
                constructor() {
                    super('async-process', 'Async Process', 'Test');
                    this.dimensions = ['analyze'];
                }

                createPrompt(): string {
                    return 'test';
                }

                selectProvider(): ProviderSelection {
                    return { provider: 'mock-ai', options: {} };
                }

                async processResults(
                    results: Record<string, DimensionResult>
                ): Promise<Record<string, DimensionResult>> {
                    // Simulate database storage
                    await new Promise(resolve => setTimeout(resolve, 30));
                    storedResults.push({ ...results, stored_at: Date.now() });

                    return {
                        ...results,
                        analyze: {
                            ...results.analyze,
                            metadata: {
                                ...results.analyze?.metadata,
                                processed: true
                            }
                        }
                    };
                }
            }

            const engine = new DagEngine({
                plugin: new AsyncProcessResultsPlugin(),
                registry
            });

            await engine.process([createMockSection('Test')]);

            expect(storedResults).toHaveLength(1);
            expect(storedResults[0]).toHaveProperty('stored_at');
        });

        test('should handle sync processResults (backward compatibility)', async () => {
            class SyncProcessResultsPlugin extends Plugin {
                constructor() {
                    super('sync-process', 'Sync Process', 'Test');
                    this.dimensions = ['test'];
                }

                createPrompt(): string {
                    return 'test';
                }

                selectProvider(): ProviderSelection {
                    return { provider: 'mock-ai', options: {} };
                }

                processResults(results: Record<string, DimensionResult>): Record<string, DimensionResult> {
                    return {
                        ...results,
                        test: {
                            ...results.test,
                            metadata: { ...results.test?.metadata, processed_sync: true }
                        }
                    };
                }
            }

            const engine = new DagEngine({
                plugin: new SyncProcessResultsPlugin(),
                registry
            });

            const result = await engine.process([createMockSection('Test')]);

            expect(result.sections[0]?.results.test?.metadata?.processed_sync).toBe(true);
        });
    });

    describe('Async transform()', () => {
        test('should handle async transform with external enrichment', async () => {
            const enrichmentCalls: string[] = [];

            class AsyncTransformPlugin extends Plugin {
                constructor() {
                    super('async-transform', 'Async Transform', 'Test');
                    this.dimensions = [{
                        name: 'enrich',
                        scope: 'global' as const,
                        transform: async (result, sections) => {
                            // Simulate enrichment API calls
                            const enriched = await Promise.all(
                                sections.map(async (section) => {
                                    enrichmentCalls.push(`enriching-${section.content}`);
                                    await new Promise(resolve => setTimeout(resolve, 20));
                                    return {
                                        ...section,
                                        metadata: {
                                            ...section.metadata,
                                            enriched: true,
                                            timestamp: Date.now()
                                        }
                                    };
                                })
                            );
                            return enriched;
                        }
                    }];
                }

                createPrompt(): string {
                    return 'test';
                }

                selectProvider(): ProviderSelection {
                    return { provider: 'mock-ai', options: {} };
                }
            }

            const engine = new DagEngine({
                plugin: new AsyncTransformPlugin(),
                registry
            });

            const result = await engine.process([
                createMockSection('Section1'),
                createMockSection('Section2')
            ]);

            expect(enrichmentCalls).toHaveLength(2);
            expect(result.transformedSections[0]?.metadata.enriched).toBe(true);
            expect(result.transformedSections[1]?.metadata.enriched).toBe(true);
        });

        test('should handle sync transform (backward compatibility)', async () => {
            class SyncTransformPlugin extends Plugin {
                constructor() {
                    super('sync-transform', 'Sync Transform', 'Test');
                    this.dimensions = [{
                        name: 'merge',
                        scope: 'global' as const,
                        transform: (result, sections) => {
                            return [{
                                content: sections.map(s => s.content).join(' '),
                                metadata: { merged: true }
                            }];
                        }
                    }];
                }

                createPrompt(): string {
                    return 'test';
                }

                selectProvider(): ProviderSelection {
                    return { provider: 'mock-ai', options: {} };
                }
            }

            const engine = new DagEngine({
                plugin: new SyncTransformPlugin(),
                registry
            });

            const result = await engine.process([
                createMockSection('A'),
                createMockSection('B')
            ]);

            expect(result.transformedSections).toHaveLength(1);
            expect(result.transformedSections[0]?.content).toBe('A B');
        });
    });
});