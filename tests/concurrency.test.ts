import { describe, test, expect, beforeEach } from 'vitest';
import { DagEngine } from '../src/core/engine';
import { Plugin } from '../src/plugin';
import { ProviderRegistry } from '../src/providers/registry';
import { MockAIProvider, createMockSection } from './setup';

describe('DagEngine - Concurrency Control', () => {
    let mockProvider: MockAIProvider;
    let registry: ProviderRegistry;

    beforeEach(() => {
        mockProvider = new MockAIProvider();
        mockProvider.setMockResponse('test', { result: 'ok' });
        registry = new ProviderRegistry();
        registry.register(mockProvider);
    });

    test('should respect concurrency limit of 1', async () => {
        class ConcurrencyPlugin extends Plugin {
            constructor() {
                super('conc', 'Concurrency', 'Test');
                this.dimensions = ['test'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const activeCalls: number[] = [];
        let currentActive = 0;
        const originalExecute = mockProvider.execute.bind(mockProvider);

        mockProvider.execute = async (request) => {
            currentActive++;
            activeCalls.push(currentActive);
            await new Promise(resolve => setTimeout(resolve, 50));
            currentActive--;
            return originalExecute(request);
        };

        const engine = new DagEngine({
            plugin: new ConcurrencyPlugin(),
            registry,
            concurrency: 1
        });

        const sections = Array.from({ length: 5 }, (_, i) =>
            createMockSection(`Content ${i}`)
        );

        await engine.process(sections);

        // With concurrency 1, should never have more than 1 active
        expect(Math.max(...activeCalls)).toBe(1);
    });

    test('should respect concurrency limit of 10', async () => {
        class ConcurrencyPlugin extends Plugin {
            constructor() {
                super('conc', 'Concurrency', 'Test');
                this.dimensions = ['test'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const activeCalls: number[] = [];
        let currentActive = 0;
        const originalExecute = mockProvider.execute.bind(mockProvider);

        mockProvider.execute = async (request) => {
            currentActive++;
            activeCalls.push(currentActive);
            await new Promise(resolve => setTimeout(resolve, 50));
            currentActive--;
            return originalExecute(request);
        };

        const engine = new DagEngine({
            plugin: new ConcurrencyPlugin(),
            registry,
            concurrency: 10
        });

        const sections = Array.from({ length: 20 }, (_, i) =>
            createMockSection(`Content ${i}`)
        );

        await engine.process(sections);

        // With concurrency 10, should never have more than 10 active
        expect(Math.max(...activeCalls)).toBeLessThanOrEqual(10);
    });

    test('should process sections in batches correctly', async () => {
        class BatchPlugin extends Plugin {
            constructor() {
                super('batch', 'Batch', 'Test');
                this.dimensions = ['test'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const batchStarts: number[] = [];
        const originalExecute = mockProvider.execute.bind(mockProvider);

        mockProvider.execute = async (request) => {
            batchStarts.push(Date.now());
            await new Promise(resolve => setTimeout(resolve, 100));
            return originalExecute(request);
        };

        const engine = new DagEngine({
            plugin: new BatchPlugin(),
            registry,
            concurrency: 3
        });

        const sections = Array.from({ length: 9 }, (_, i) =>
            createMockSection(`Content ${i}`)
        );

        await engine.process(sections);

        // Should have 3 batches: 0-2, 3-5, 6-8
        // Each batch starts ~100ms after the previous
        const batch1Start = batchStarts[0]!;
        const batch2Start = batchStarts[3]!;
        const batch3Start = batchStarts[6]!;

        expect(batch2Start - batch1Start).toBeGreaterThanOrEqual(90);
        expect(batch3Start - batch2Start).toBeGreaterThanOrEqual(90);
    });

    test('should handle concurrency with errors', async () => {
        class ErrorConcurrencyPlugin extends Plugin {
            constructor() {
                super('error-conc', 'Error Concurrency', 'Test');
                this.dimensions = ['test'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        let sectionCount = 0;

        mockProvider.execute = async (request) => {
            sectionCount++;

            // Make every even section fail (2nd, 4th, 6th)
            if (sectionCount % 2 === 0) {
                return { error: 'Even section fails' };
            }

            return { data: { result: 'ok' } };
        };

        const engine = new DagEngine({
            plugin: new ErrorConcurrencyPlugin(),
            registry,
            concurrency: 3,
            continueOnError: true,
            maxRetries: 0
        });

        const sections = Array.from({ length: 6 }, (_, i) =>
            createMockSection(`Content ${i}`)
        );

        const result = await engine.process(sections);

        // Should have processed all sections despite errors
        expect(result.sections).toHaveLength(6);

        // Half should have errors (sections 2, 4, 6)
        const errorCount = result.sections.filter(s => s.results.test?.error).length;
        expect(errorCount).toBe(3);
    }, 15000);
    test('should handle varying section processing times', async () => {
        class VaryingTimePlugin extends Plugin {
            constructor() {
                super('varying', 'Varying', 'Test');
                this.dimensions = ['test'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const completionOrder: number[] = [];
        let callIndex = 0;  // Track calls separately

        mockProvider.execute = async (request) => {
            const currentIndex = callIndex++;  // Capture and increment
            // Varying delays: 100ms, 50ms, 150ms, 50ms, etc.
            const delay = currentIndex % 2 === 0 ? 100 : 50;
            await new Promise(resolve => setTimeout(resolve, delay));
            completionOrder.push(currentIndex);
            return { data: { result: 'ok' } };
        };

        const engine = new DagEngine({
            plugin: new VaryingTimePlugin(),
            registry,
            concurrency: 3
        });

        const sections = Array.from({ length: 6 }, (_, i) =>
            createMockSection(`Content ${i}`)
        );

        await engine.process(sections);

        // All sections should complete
        expect(completionOrder).toHaveLength(6);

        // Faster sections (odd indices with 50ms) should complete before slower ones (even indices with 100ms) in same batch
        // Batch 1: indices 0(100ms), 1(50ms), 2(100ms) - 1 should complete first
        // Batch 2: indices 3(50ms), 4(100ms), 5(50ms) - 3,5 should complete before 4
        expect(completionOrder).toContain(0);
        expect(completionOrder).toContain(1);
        expect(completionOrder).toContain(2);
        expect(completionOrder).toContain(3);
        expect(completionOrder).toContain(4);
        expect(completionOrder).toContain(5);
    });

    test('should not exceed concurrency limit under load', async () => {
        class LoadPlugin extends Plugin {
            constructor() {
                super('load', 'Load', 'Test');
                this.dimensions = ['test'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        let maxConcurrent = 0;
        let currentConcurrent = 0;
        const originalExecute = mockProvider.execute.bind(mockProvider);

        mockProvider.execute = async (request) => {
            currentConcurrent++;
            maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
            await new Promise(resolve => setTimeout(resolve, 20));
            currentConcurrent--;
            return originalExecute(request);
        };

        const engine = new DagEngine({
            plugin: new LoadPlugin(),
            registry,
            concurrency: 5
        });

        const sections = Array.from({ length: 50 }, (_, i) =>
            createMockSection(`Content ${i}`)
        );

        const result = await engine.process(sections);

        expect(maxConcurrent).toBeLessThanOrEqual(5);
        expect(result.sections).toHaveLength(50);
    });

    test('should handle default concurrency of 5', async () => {
        class DefaultPlugin extends Plugin {
            constructor() {
                super('default', 'Default', 'Test');
                this.dimensions = ['test'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        let maxConcurrent = 0;
        let currentConcurrent = 0;
        const originalExecute = mockProvider.execute.bind(mockProvider);

        mockProvider.execute = async (request) => {
            currentConcurrent++;
            maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
            await new Promise(resolve => setTimeout(resolve, 30));
            currentConcurrent--;
            return originalExecute(request);
        };

        const engine = new DagEngine({
            plugin: new DefaultPlugin(),
            registry
            // No concurrency specified, should use default
        });

        const sections = Array.from({ length: 15 }, (_, i) =>
            createMockSection(`Content ${i}`)
        );

        await engine.process(sections);

        expect(maxConcurrent).toBeLessThanOrEqual(5);
    });
});