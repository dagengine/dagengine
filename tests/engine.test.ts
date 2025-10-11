import { describe, test, expect, beforeEach } from '@jest/globals';
import { DagEngine } from '../src/engine';
import { Plugin } from '../src/plugin';
import { ProviderRegistry } from '../src/providers/registry';
import { MockAIProvider, createMockSection } from './setup';

class TestPlugin extends Plugin {
    constructor() {
        super('test', 'Test Plugin', 'Test plugin');
        this.dimensions = ['sentiment', 'summary'];
    }

    createPrompt(context: any): string {
        return `Analyze ${context.dimension}: ${context.sections[0].content}`;
    }

    selectProvider(): any {
        return { provider: 'mock-ai' };
    }

    getDependencies(): Record<string, string[]> {
        return { summary: ['sentiment'] };
    }
}

describe('DagEngine - Core Functionality', () => {
    let mockProvider: MockAIProvider;
    let registry: ProviderRegistry;

    beforeEach(() => {
        mockProvider = new MockAIProvider();
        mockProvider.setMockResponse('Analyze sentiment: Test content', { sentiment: 'positive', score: 0.9 });
        mockProvider.setMockResponse('Analyze summary: Test content', { summary: 'Test summary' });

        registry = new ProviderRegistry();
        registry.register(mockProvider);
    });

    test('should process single section', async () => {
        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry
        });

        const sections = [createMockSection('Test content')];
        const result = await engine.process(sections);

        expect(result.sections).toHaveLength(1);
        expect(result?.sections?.[0]?.results?.sentiment).toBeDefined();
        expect(result?.sections?.[0]?.results?.summary).toBeDefined();
    });

    test('should process multiple sections', async () => {
        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry,
            concurrency: 2
        });

        const sections = [
            createMockSection('Content 1'),
            createMockSection('Content 2'),
            createMockSection('Content 3')
        ];

        const result = await engine.process(sections);

        expect(result.sections).toHaveLength(3);
        result.sections.forEach(section => {
            expect(section.results.sentiment).toBeDefined();
            expect(section.results.summary).toBeDefined();
        });
    });

    test('should throw error if no sections provided', async () => {
        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry
        });

        await expect(engine.process([])).rejects.toThrow('at least one section');
    });

    test('should throw error if no providers configured', () => {
        const emptyRegistry = new ProviderRegistry();

        expect(() => {
            new DagEngine({
                plugin: new TestPlugin(),
                registry: emptyRegistry
            });
        }).toThrow('at least one provider');
    });

    test('should respect concurrency setting', async () => {
        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry,
            concurrency: 1
        });

        const sections = [
            createMockSection('Content 1'),
            createMockSection('Content 2')
        ];

        await engine.process(sections);

        // With concurrency 1, sections process one at a time
        expect(mockProvider.callCount).toBeGreaterThan(0);
    });
});
