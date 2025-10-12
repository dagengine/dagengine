import { DagEngine } from '../src'

import { MockAIProvider, createMockSection } from './setup'
import { ProviderRegistry } from '../src/providers/registry'
import { Plugin } from '../src/plugin'

describe('Integration Tests', () => {
    test('should handle complete workflow', async () => {
        class CompletePlugin extends Plugin {
            constructor() {
                super('complete', 'Complete', 'Complete workflow');
                this.dimensions = [
                    { name: 'global_scan', scope: 'global' as const },
                    'sentiment',
                    'topics',
                    { name: 'global_summary', scope: 'global' as const }
                ];
            }

            createPrompt(context: any): string {
                return `${context.dimension}:${context.sections[0]?.content}`;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            defineDependencies(): Record<string, string[]> {
                return {
                    topics: ['sentiment'],
                    global_summary: ['sentiment', 'topics']
                };
            }
        }

        const mockProvider = new MockAIProvider();
        mockProvider.setMockResponse('global_scan:Section 1', { themes: ['tech'] });
        mockProvider.setMockResponse('sentiment:Section 1', { sentiment: 'positive' });
        mockProvider.setMockResponse('topics:Section 1', { topics: ['AI'] });
        mockProvider.setMockResponse('global_summary:Section 1', { summary: 'Good' });

        const registry = new ProviderRegistry();
        registry.register(mockProvider);

        const engine = new DagEngine({
            plugin: new CompletePlugin(),
            registry
        });

        const result = await engine.process([createMockSection('Section 1')]);

        expect(result.globalResults.global_scan).toBeDefined();
        expect(result.globalResults.global_summary).toBeDefined();
        expect(result.sections[0]?.results.sentiment).toBeDefined();
        expect(result.sections[0]?.results.topics).toBeDefined();
    });
});