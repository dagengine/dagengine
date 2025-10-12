import { describe, test, expect, beforeEach } from 'vitest';
import { DagEngine } from '../src/engine';
import { Plugin, PromptContext, ProviderSelection } from '../src/plugin';
import { ProviderRegistry } from '../src/providers/registry';
import { MockAIProvider, createMockSection } from './setup';
import { DimensionResult } from '../src/types';

describe('DagEngine - Async Error Handling', () => {
    let mockProvider: MockAIProvider;
    let registry: ProviderRegistry;

    beforeEach(() => {
        mockProvider = new MockAIProvider();
        mockProvider.setMockResponse('test', { result: 'ok' });
        registry = new ProviderRegistry();
        registry.register(mockProvider);
    });

    test('should handle async createPrompt errors', async () => {
        const errors: string[] = [];

        class ErrorPromptPlugin extends Plugin {
            constructor() {
                super('error-prompt', 'Error Prompt', 'Test');
                this.dimensions = ['failing'];
            }

            async createPrompt(): Promise<string> {
                await new Promise(resolve => setTimeout(resolve, 10));
                throw new Error('Async createPrompt failed');
            }

            selectProvider(): ProviderSelection {
                return { provider: 'mock-ai', options: {} };
            }
        }

        const engine = new DagEngine({
            plugin: new ErrorPromptPlugin(),
            registry,
            continueOnError: true
        });

        await engine.process([createMockSection('Test')], {
            onError: (context, error) => {
                errors.push(error.message);
            }
        });

        expect(errors).toContain('Async createPrompt failed');
    });

    test('should handle async selectProvider errors', async () => {
        const errors: string[] = [];

        class ErrorProviderPlugin extends Plugin {
            constructor() {
                super('error-provider', 'Error Provider', 'Test');
                this.dimensions = ['failing'];
            }

            createPrompt(): string {
                return 'test';
            }

            async selectProvider(): Promise<ProviderSelection> {
                await new Promise(resolve => setTimeout(resolve, 10));
                throw new Error('Async selectProvider failed');
            }
        }

        const engine = new DagEngine({
            plugin: new ErrorProviderPlugin(),
            registry,
            continueOnError: true
        });

        await engine.process([createMockSection('Test')], {
            onError: (context, error) => {
                errors.push(error.message);
            }
        });

        expect(errors.some(e => e.includes('selectProvider'))).toBe(true);
    });

    test('should handle async getDependencies errors', async () => {
        class ErrorDependenciesPlugin extends Plugin {
            constructor() {
                super('error-deps', 'Error Deps', 'Test');
                this.dimensions = ['test'];
            }

            async getDependencies(): Promise<Record<string, string[]>> {
                await new Promise(resolve => setTimeout(resolve, 10));
                throw new Error('Async getDependencies failed');
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): ProviderSelection {
                return { provider: 'mock-ai', options: {} };
            }
        }

        const engine = new DagEngine({
            plugin: new ErrorDependenciesPlugin(),
            registry
        });

        await expect(engine.process([createMockSection('Test')])).rejects.toThrow();
    });

    test('should handle async processResults errors', async () => {
        class ErrorProcessPlugin extends Plugin {
            constructor() {
                super('error-process', 'Error Process', 'Test');
                this.dimensions = ['test'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): ProviderSelection {
                return { provider: 'mock-ai', options: {} };
            }

            async processResults(): Promise<Record<string, DimensionResult>> {
                await new Promise(resolve => setTimeout(resolve, 10));
                throw new Error('Async processResults failed');
            }
        }

        const engine = new DagEngine({
            plugin: new ErrorProcessPlugin(),
            registry
        });

        await expect(engine.process([createMockSection('Test')])).rejects.toThrow();
    });

    test('should handle async transform errors', async () => {
        class ErrorTransformPlugin extends Plugin {
            constructor() {
                super('error-transform', 'Error Transform', 'Test');
                this.dimensions = [{
                    name: 'failing',
                    scope: 'global' as const,
                    transform: async () => {
                        await new Promise(resolve => setTimeout(resolve, 10));
                        throw new Error('Async transform failed');
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
            plugin: new ErrorTransformPlugin(),
            registry,
            continueOnError: true
        });

        const result = await engine.process([createMockSection('Test')]);

        // Should preserve original sections on transform error
        expect(result.transformedSections).toHaveLength(1);
    });
});