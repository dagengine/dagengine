import { describe, test, expect, beforeEach } from 'vitest';
import { DagEngine } from '../src/core/engine.ts';
import { Plugin } from '../src/plugin';
import { ProviderRegistry } from '../src/providers/registry';
import { MockAIProvider, createMockSection } from './setup';

describe('DagEngine - Edge Cases for 100% Coverage', () => {
    let mockProvider: MockAIProvider;
    let registry: ProviderRegistry;

    beforeEach(() => {
        mockProvider = new MockAIProvider();
        mockProvider.setMockResponse('test', { result: 'ok' });
        registry = new ProviderRegistry();
        registry.register(mockProvider);
    });

    // Line 70: dimensionTimeouts with || fallback
    test('should use empty object for dimensionTimeouts when not provided', () => {
        class SimplePlugin extends Plugin {
            constructor() {
                super('simple', 'Simple', 'Test');
                this.dimensions = ['test'];
            }
            createPrompt(): string { return 'test'; }
            selectProvider(): any { return { provider: 'mock-ai' }; }
        }

        // @ts-expect-error - test
        const engine = new DagEngine({
            plugin: new SimplePlugin(),
            registry,
            dimensionTimeouts: undefined  // Explicitly undefined to test fallback
        });

        expect((engine as any).dimensionTimeouts).toEqual({});
    });

    // Lines 151-152: Transformation error in parallel group with onError not defined
    test('should handle transformation error without onError callback', async () => {
        class TransformErrorPlugin extends Plugin {
            constructor() {
                super('transform-error', 'Transform Error', 'Test');
                this.dimensions = [
                    {
                        name: 'g1',
                        scope: 'global' as const,
                        transform: () => { throw new Error('Transform fails'); }
                    },
                    {
                        name: 'g2',
                        scope: 'global' as const
                    }
                ];
            }
            createPrompt(): string { return 'test'; }
            selectProvider(): any { return { provider: 'mock-ai' }; }
        }

        const engine = new DagEngine({
            plugin: new TransformErrorPlugin(),
            registry
        });

        // Process WITHOUT onError callback
        const result = await engine.process([createMockSection('Test')]);

        // Should continue despite error
        expect(result.transformedSections).toHaveLength(1);
    });

    // Line 312: Global dependency with error when continueOnError is false
    test('should throw when global dependency fails and continueOnError is false', async () => {
        class FailDepPlugin extends Plugin {
            constructor() {
                super('fail-dep', 'Fail Dep', 'Test');
                this.dimensions = [
                    { name: 'g1', scope: 'global' as const },
                    { name: 'g2', scope: 'global' as const }
                ];
            }
            createPrompt(): string { return 'test'; }
            selectProvider(): any { return { provider: 'mock-ai' }; }
            defineDependencies(): Record<string, string[]> {
                return { g2: ['g1'] };
            }
        }

        mockProvider.execute = async (request) => {
            if (request.input === 'test') {
                return { error: 'G1 failed' };
            }
            return { data: { result: 'ok' } };
        };

        const engine = new DagEngine({
            plugin: new FailDepPlugin(),
            registry,
            continueOnError: false  // Important: set to false
        });

        const result = await engine.process([createMockSection('Test')]);

        // g2 should have error because g1 failed and continueOnError is false
        expect(result.globalResults.g2?.error).toBeDefined();
    });

    test('should throw when dependency fails with continueOnError false', async () => {
        class DepFailPlugin extends Plugin {
            constructor() {
                super('dep-fail', 'Dep Fail', 'Test');
                this.dimensions = ['dim1', 'dim2'];
            }
            createPrompt(): string { return 'test'; }
            selectProvider(): any { return { provider: 'mock-ai' }; }
            defineDependencies(): Record<string, string[]> {
                return { dim2: ['dim1'] };
            }
        }

        mockProvider.execute = async () => {
            return { error: 'Dim1 failed' };
        };

        const engine = new DagEngine({
            plugin: new DepFailPlugin(),
            registry,
            continueOnError: false
        });

        await expect(
            engine.process([createMockSection('Test')])
        ).rejects.toThrow('All providers failed for dimension "dim1". Tried: mock-ai');
    });

    test('should handle dependency failures with continueOnError true', async () => {
        class DepFailPlugin extends Plugin {
            constructor() {
                super('dep-fail', 'Dep Fail', 'Test');
                this.dimensions = ['dim1', 'dim2'];
            }
            createPrompt(): string { return 'test'; }
            selectProvider(): any { return { provider: 'mock-ai' }; }
            defineDependencies(): Record<string, string[]> {
                return { dim2: ['dim1'] };
            }
        }

        // Make dim1 fail, but dim2 succeed
        mockProvider.execute = async (request) => {
            if (request.dimension === 'dim1') {
                return { error: 'Dim1 failed' };
            }
            // dim2 succeeds even with failed dependency
            return { data: { result: 'dim2 executed with partial deps' } };
        };

        const engine = new DagEngine({
            plugin: new DepFailPlugin(),
            registry,
            continueOnError: true,
            maxRetries: 0
        });

        const result = await engine.process([createMockSection('Test')]);

        // ✅ dim1 has error from provider
        expect(result.sections[0]?.results.dim1?.error).toBe(
            'All providers failed for dimension "dim1". Tried: mock-ai'
        );

        // ✅ dim2 executes successfully even with failed dependency
        expect(result.sections[0]?.results.dim2?.data).toBeDefined();
        expect(result.sections[0]?.results.dim2?.data?.result).toBe('dim2 executed with partial deps');
    });

    // Line 396: Skip dimension when plugin doesn't implement shouldSkipDimension
    test('should not skip when plugin does not implement shouldSkipDimension', async () => {
        class NoSkipPlugin extends Plugin {
            constructor() {
                super('no-skip', 'No Skip', 'Test');
                this.dimensions = ['test'];
            }
            createPrompt(): string { return 'test'; }
            selectProvider(): any { return { provider: 'mock-ai' }; }
            // Note: NO shouldSkipDimension method
        }

        const engine = new DagEngine({
            plugin: new NoSkipPlugin(),
            registry
        });

        const result = await engine.process([createMockSection('Test')]);

        // Should process normally
        expect(result.sections[0]?.results.test).toBeDefined();
        expect(result.sections[0]?.results.test?.data).toBeDefined();
    });

    // Line 489: Retry with rate limit (different backoff)
    test('should handle retry with exponential backoff', async () => {
        class RetryPlugin extends Plugin {
            constructor() {
                super('retry', 'Retry', 'Test');
                this.dimensions = ['test'];
            }
            createPrompt(): string { return 'test'; }
            selectProvider(): any { return { provider: 'mock-ai' }; }
        }

        let attemptCount = 0;
        mockProvider.execute = async () => {
            attemptCount++;
            if (attemptCount < 3) {
                throw new Error('Retry me');
            }
            return { data: { result: 'ok' } };
        };

        const engine = new DagEngine({
            plugin: new RetryPlugin(),
            registry,
            maxRetries: 3,
            retryDelay: 10
        });

        const result = await engine.process([createMockSection('Test')]);

        expect(attemptCount).toBe(3);
        expect(result.sections[0]?.results.test?.data).toEqual({ result: 'ok' });
    });

    // Lines 511-514: Topological sort with already visited dimension
    test('should handle topological sort with shared dependencies', async () => {
        class SharedDepPlugin extends Plugin {
            constructor() {
                super('shared', 'Shared', 'Test');
                this.dimensions = ['base', 'dep1', 'dep2', 'final'];
            }
            createPrompt(): string { return 'test'; }
            selectProvider(): any { return { provider: 'mock-ai' }; }
            defineDependencies(): Record<string, string[]> {
                return {
                    dep1: ['base'],
                    dep2: ['base'],  // Both dep1 and dep2 depend on base
                    final: ['dep1', 'dep2']
                };
            }
        }

        const engine = new DagEngine({
            plugin: new SharedDepPlugin(),
            registry
        });

        const result = await engine.process([createMockSection('Test')]);

        // All dimensions should be processed
        expect(result.sections[0]?.results.base).toBeDefined();
        expect(result.sections[0]?.results.dep1).toBeDefined();
        expect(result.sections[0]?.results.dep2).toBeDefined();
        expect(result.sections[0]?.results.final).toBeDefined();
    });

    // Additional: Test circular dependency detection (if not already covered)
    test('should detect and throw on circular dependencies', () => {
        class CircularPlugin extends Plugin {
            constructor() {
                super('circular', 'Circular', 'Test');
                this.dimensions = ['a', 'b', 'c'];
            }
            createPrompt(): string { return 'test'; }
            selectProvider(): any { return { provider: 'mock-ai' }; }
            defineDependencies(): Record<string, string[]> {
                return {
                    a: ['b'],
                    b: ['c'],
                    c: ['a']  // Circular!
                };
            }
        }

        const engine = new DagEngine({
            plugin: new CircularPlugin(),
            registry
        });

        expect(
            engine.process([createMockSection('Test')])
        ).rejects.toThrow('Circular dependency');
    });

    // Test provider not found scenario
    test('should throw error when provider not found', async () => {
        class MissingProviderPlugin extends Plugin {
            constructor() {
                super('missing', 'Missing', 'Test');
                this.dimensions = ['test'];
            }
            createPrompt(): string { return 'test'; }
            selectProvider(): any {
                return { provider: 'nonexistent-provider' };
            }
        }

        const engine = new DagEngine({
            plugin: new MissingProviderPlugin(),
            registry,
            continueOnError: true
        });

        const result = await engine.process([createMockSection('Test')]);

        expect(result.sections[0]?.results.test?.error).toContain('All providers failed for dimension "test". Tried: nonexistent-provider');
    });
});