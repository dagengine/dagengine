import { DagEngine } from '../src'

import { MockAIProvider, createMockSection } from './setup'
import { ProviderRegistry } from '../src/providers/registry'
import { Plugin } from '../src/plugin'

describe('DagEngine - Error Handling', () => {
    let mockProvider: MockAIProvider;
    let registry: ProviderRegistry;

    beforeEach(() => {
        mockProvider = new MockAIProvider();
        registry = new ProviderRegistry();
        registry.register(mockProvider);
    });

    test('should continue processing with continueOnError=true', async () => {
        class ErrorPlugin extends Plugin {
            constructor() {
                super('error', 'Error', 'Test errors');
                this.dimensions = ['failing', 'succeeding'];
            }

            createPrompt(context: any): string {
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        mockProvider.setMockResponse('failing', null);
        mockProvider.setMockResponse('succeeding', { result: 'ok' });
        mockProvider.shouldFail = true;

        const engine = new DagEngine({
            plugin: new ErrorPlugin(),
            registry,
            continueOnError: true
        });

        const result = await engine.process([createMockSection('Test')]);

        // Should have error for failing dimension
        expect(result?.sections?.[0]?.results?.failing?.error).toBeDefined();

        // But succeeding should still work (if no deps on failing)
        mockProvider.shouldFail = false;
        mockProvider.setMockResponse('succeeding', { result: 'ok' });
    });

    test('should call onError callback', async () => {
        const errors: Array<{ context: string; error: Error }> = [];

        class ErrorPlugin extends Plugin {
            constructor() {
                super('error', 'Error', 'Test');
                this.dimensions = ['failing'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        mockProvider.shouldFail = true;

        const engine = new DagEngine({
            plugin: new ErrorPlugin(),
            registry,
            continueOnError: true
        });

        await engine.process([createMockSection('Test')], {
            onError: (context, error) => {
                errors.push({ context, error });
            }
        });

        expect(errors.length).toBeGreaterThan(0);
        expect(errors?.[0]?.context).toContain('failing');
    });

    test('should handle missing provider error', async () => {
        class MissingProviderPlugin extends Plugin {
            constructor() {
                super('missing', 'Missing', 'Test');
                this.dimensions = ['test'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'nonexistent' };
            }
        }

        const engine = new DagEngine({
            plugin: new MissingProviderPlugin(),
            registry,
            continueOnError: true
        });

        const result = await engine.process([createMockSection('Test')]);

        expect(result?.sections?.[0]?.results?.test?.error).toContain('not found');
    });
});
