import { describe, test, expect, beforeEach, vi } from 'vitest';
import { DagEngine } from '../src/engine';
import { Plugin } from '../src/plugin';
import { ProviderRegistry } from '../src/providers/registry';
import { MockAIProvider, createMockSection } from './setup';

describe('DagEngine - Dynamic Skipping', () => {
    let mockProvider: MockAIProvider;
    let registry: ProviderRegistry;

    beforeEach(() => {
        mockProvider = new MockAIProvider();
        mockProvider.setMockResponse('check', { quality: 'good' });
        mockProvider.setMockResponse('analysis', { result: 'deep' });
        registry = new ProviderRegistry();
        registry.register(mockProvider);
    });

    test('should skip dimensions based on shouldSkipDimension', async () => {
        class SkipPlugin extends Plugin {
            constructor() {
                super('skip', 'Skip', 'Test skip');
                this.dimensions = ['check', 'analysis'];
            }

            createPrompt(context: any): string {
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            getDependencies(): Record<string, string[]> {
                return { analysis: ['check'] };
            }

            shouldSkipDimension(
                dimension: string,
                _section: any,
                sectionResults: Record<string, any>
            ): boolean {
                if (dimension === 'analysis') {
                    return sectionResults['check']?.data?.quality === 'good';
                }
                return false;
            }
        }

        const engine = new DagEngine({
            plugin: new SkipPlugin(),
            registry
        });

        const result = await engine.process([createMockSection('Test')]);

        expect(result.sections[0]?.results?.check?.data).toEqual({ quality: 'good' });
        expect(result.sections[0]?.results?.analysis?.data).toEqual( { reason: "Skipped by plugin logic", "skipped": true});
    });

    test('should execute dimension when skip condition not met', async () => {
        class SkipPlugin extends Plugin {
            constructor() {
                super('skip', 'Skip', 'Test');
                this.dimensions = ['check', 'analysis'];
            }

            createPrompt(context: any): string {
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            getDependencies(): Record<string, string[]> {
                return { analysis: ['check'] };
            }

            shouldSkipDimension(
                dimension: string,
                _section: any,
                sectionResults: Record<string, any>
            ): boolean {
                if (dimension === 'analysis') {
                    return sectionResults['check']?.data?.quality === 'good';
                }
                return false;
            }
        }

        mockProvider.setMockResponse('check', { quality: 'poor' });
        mockProvider.setMockResponse('analysis', { result: 'deep' });

        const engine = new DagEngine({
            plugin: new SkipPlugin(),
            registry
        });

        const result = await engine.process([createMockSection('Test')]);

        expect(result.sections[0]?.results?.analysis?.data).toEqual({ result: 'deep' });
    });
});

// ============================================================================
// tests/callbacks.test.ts - Callback Tests
// ============================================================================

describe('DagEngine - Callbacks', () => {
    let mockProvider: MockAIProvider;
    let registry: ProviderRegistry;

    beforeEach(() => {
        mockProvider = new MockAIProvider();
        mockProvider.setMockResponse('test', { result: 'ok' });
        registry = new ProviderRegistry();
        registry.register(mockProvider);
    });

    test('should call all callbacks', async () => {
        const callbacks = {
            onDimensionStart: vi.fn(),
            onDimensionComplete: vi.fn(),
            onSectionStart: vi.fn(),
            onSectionComplete: vi.fn()
        };

        class CallbackPlugin extends Plugin {
            constructor() {
                super('callback', 'Callback', 'Test');
                this.dimensions = ['test'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const engine = new DagEngine({
            plugin: new CallbackPlugin(),
            registry
        });

        await engine.process([createMockSection('Test')], callbacks);

        expect(callbacks.onDimensionStart).toHaveBeenCalledWith('test');
        expect(callbacks.onDimensionComplete).toHaveBeenCalled();
        expect(callbacks.onSectionStart).toHaveBeenCalled();
        expect(callbacks.onSectionComplete).toHaveBeenCalled();
    });
});
