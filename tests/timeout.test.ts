import { DagEngine } from '../src'

import { MockAIProvider, createMockSection } from './setup'
import { ProviderRegistry } from '../src/providers/registry'
import { Plugin } from '../src/plugin'

describe('DagEngine - Timeout Handling', () => {
    let mockProvider: MockAIProvider;
    let registry: ProviderRegistry;

    beforeEach(() => {
        mockProvider = new MockAIProvider();
        registry = new ProviderRegistry();
        registry.register(mockProvider);
    });

    test('should timeout slow dimensions with global timeout', async () => {
        class SlowPlugin extends Plugin {
            constructor() {
                super('slow', 'Slow', 'Test timeout');
                this.dimensions = ['slow_dimension'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        mockProvider.delay = 2000; // 2 second delay

        const engine = new DagEngine({
            plugin: new SlowPlugin(),
            registry,
            timeout: 500,  // 500ms timeout
            continueOnError: true
        });

        const result = await engine.process([createMockSection('Test')]);

        expect(result.sections[0]?.results?.slow_dimension?.error).toContain('Dimension "slow_dimension" timed out after 500ms');
    });

    test('should respect per-dimension timeout', async () => {
        class TimeoutPlugin extends Plugin {
            constructor() {
                super('timeout', 'Timeout', 'Test');
                this.dimensions = ['fast', 'slow'];
            }

            createPrompt(context: any): string {
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        mockProvider.setMockResponse('fast', { result: 'fast' });
        mockProvider.setMockResponse('slow', { result: 'slow' });

        const engine = new DagEngine({
            plugin: new TimeoutPlugin(),
            registry,
            timeout: 5000,
            dimensionTimeouts: {
                slow: 100  // Only 100ms for slow dimension
            },
            continueOnError: true
        });

        mockProvider.delay = 200; // 200ms delay

        const result = await engine.process([createMockSection('Test')]);

        // Slow should timeout
        expect(result?.sections[0]?.results?.slow?.error).toContain('Dimension "slow" timed out after 100ms');
    });
});