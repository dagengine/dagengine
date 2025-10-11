import { describe, test, expect, beforeEach } from '@jest/globals';
import { DagEngine } from '../src/engine';
import { Plugin } from '../src/plugin';
import { ProviderRegistry } from '../src/providers/registry';
import { MockAIProvider, createMockSection } from './setup';

describe('DagEngine - Edge Cases', () => {
    let mockProvider: MockAIProvider;
    let registry: ProviderRegistry;

    beforeEach(() => {
        mockProvider = new MockAIProvider();
        mockProvider.setMockResponse('test', { result: 'ok' });
        registry = new ProviderRegistry();
        registry.register(mockProvider);
    });

    test('should handle very large number of sections (100+)', async () => {
        class LargePlugin extends Plugin {
            constructor() {
                super('large', 'Large', 'Test');
                this.dimensions = ['analysis'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const engine = new DagEngine({
            plugin: new LargePlugin(),
            registry,
            concurrency: 10
        });

        const sections = Array.from({ length: 150 }, (_, i) =>
            createMockSection(`Section ${i}`)
        );

        const result = await engine.process(sections);

        expect(result.sections).toHaveLength(150);
        result.sections.forEach(s => {
            expect(s.results.analysis).toBeDefined();
        });
    });

    test('should handle very long content in sections', async () => {
        class LongContentPlugin extends Plugin {
            constructor() {
                super('long', 'Long', 'Test');
                this.dimensions = ['analysis'];
            }

            createPrompt(context: any): string {
                return context.sections[0]?.content.substring(0, 100);
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const engine = new DagEngine({
            plugin: new LongContentPlugin(),
            registry
        });

        // 10MB content
        const longContent = 'A'.repeat(10 * 1024 * 1024);
        const result = await engine.process([createMockSection(longContent)]);

        expect(result.sections[0]?.results?.analysis).toBeDefined();
    });

    test('should handle special characters in content', async () => {
        class SpecialCharsPlugin extends Plugin {
            constructor() {
                super('special', 'Special', 'Test');
                this.dimensions = ['analysis'];
            }

            createPrompt(context: any): string {
                return context.sections[0]?.content;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const engine = new DagEngine({
            plugin: new SpecialCharsPlugin(),
            registry
        });

        const specialContent = '!@#$%^&*()_+-=[]{}|;\':",./<>?`~\\';
        const result = await engine.process([createMockSection(specialContent)]);

        expect(result.sections[0]?.section.content).toBe(specialContent);
    });

    test('should handle Unicode characters', async () => {
        class UnicodePlugin extends Plugin {
            constructor() {
                super('unicode', 'Unicode', 'Test');
                this.dimensions = ['analysis'];
            }

            createPrompt(context: any): string {
                return context.sections[0]?.content;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const engine = new DagEngine({
            plugin: new UnicodePlugin(),
            registry
        });

        const unicodeContent = '你好世界 مرحبا العالم Здравствуй мир 🌍🎉🚀';
        const result = await engine.process([createMockSection(unicodeContent)]);

        expect(result.sections[0]?.section.content).toBe(unicodeContent);
    });

    test('should handle empty content sections', async () => {
        class EmptyPlugin extends Plugin {
            constructor() {
                super('empty', 'Empty', 'Test');
                this.dimensions = ['analysis'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const engine = new DagEngine({
            plugin: new EmptyPlugin(),
            registry
        });

        const result = await engine.process([createMockSection('')]);

        expect(result.sections[0]?.section.content).toBe('');
        expect(result.sections[0]?.results?.analysis).toBeDefined();
    });

    test('should handle null/undefined metadata', async () => {
        class MetadataPlugin extends Plugin {
            constructor() {
                super('metadata', 'Metadata', 'Test');
                this.dimensions = ['analysis'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const engine = new DagEngine({
            plugin: new MetadataPlugin(),
            registry
        });

        const sections = [
            { content: 'Test 1', metadata: null as any },
            { content: 'Test 2', metadata: undefined as any },
            { content: 'Test 3', metadata: {} }
        ];

        const result = await engine.process(sections);

        expect(result.sections).toHaveLength(3);
    });

    test('should handle circular references in metadata', async () => {
        class CircularPlugin extends Plugin {
            constructor() {
                super('circular', 'Circular', 'Test');
                this.dimensions = ['analysis'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const engine = new DagEngine({
            plugin: new CircularPlugin(),
            registry
        });

        const metadata: any = { a: 1 };
        metadata.self = metadata; // Circular reference

        const result = await engine.process([
            { content: 'Test', metadata }
        ]);

        expect(result.sections[0]?.section.metadata.a).toBe(1);
    });

    test('should handle very deep dependency chains (10+ levels)', async () => {
        class DeepChainPlugin extends Plugin {
            constructor() {
                super('deep-chain', 'Deep Chain', 'Test');
                this.dimensions = Array.from({ length: 15 }, (_, i) => `level${i}`);
            }

            createPrompt(context: any): string {
                return context.dimension;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }

            getDependencies(): Record<string, string[]> {
                const deps: Record<string, string[]> = {};
                for (let i = 1; i < 15; i++) {
                    deps[`level${i}`] = [`level${i - 1}`];
                }
                return deps;
            }
        }

        const engine = new DagEngine({
            plugin: new DeepChainPlugin(),
            registry
        });

        const result = await engine.process([createMockSection('Test')]);

        expect(Object.keys(result.sections[0]?.results || {})).toHaveLength(15);
    });

    test('should handle whitespace-only content', async () => {
        class WhitespacePlugin extends Plugin {
            constructor() {
                super('whitespace', 'Whitespace', 'Test');
                this.dimensions = ['analysis'];
            }

            createPrompt(context: any): string {
                return `Content length: ${context.sections[0]?.content.length}`;
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const engine = new DagEngine({
            plugin: new WhitespacePlugin(),
            registry
        });

        const result = await engine.process([
            createMockSection('   \n\t\r   ')
        ]);

        expect(result.sections[0]?.section.content).toBe('   \n\t\r   ');
    });

    test('should handle sections with only newlines', async () => {
        class NewlinePlugin extends Plugin {
            constructor() {
                super('newline', 'Newline', 'Test');
                this.dimensions = ['analysis'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const engine = new DagEngine({
            plugin: new NewlinePlugin(),
            registry
        });

        const result = await engine.process([
            createMockSection('\n\n\n\n\n')
        ]);

        expect(result.sections[0]?.section.content).toBe('\n\n\n\n\n');
    });

    test('should handle deeply nested metadata objects', async () => {
        class DeepMetadataPlugin extends Plugin {
            constructor() {
                super('deep-meta', 'Deep Meta', 'Test');
                this.dimensions = ['analysis'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const engine = new DagEngine({
            plugin: new DeepMetadataPlugin(),
            registry
        });

        let deepMeta: any = { level: 0 };
        for (let i = 1; i < 50; i++) {
            deepMeta.nested = { level: i };
            deepMeta = deepMeta.nested;
        }

        const result = await engine.process([
            createMockSection('Test', deepMeta)
        ]);

        expect(result.sections[0]?.section.metadata).toBeDefined();
    });

    test('should handle metadata with various data types', async () => {
        class MixedMetadataPlugin extends Plugin {
            constructor() {
                super('mixed', 'Mixed', 'Test');
                this.dimensions = ['analysis'];
            }

            createPrompt(): string {
                return 'test';
            }

            selectProvider(): any {
                return { provider: 'mock-ai' };
            }
        }

        const engine = new DagEngine({
            plugin: new MixedMetadataPlugin(),
            registry
        });

        const mixedMetadata = {
            string: 'value',
            number: 123,
            boolean: true,
            null: null,
            undefined: undefined,
            array: [1, 2, 3],
            object: { nested: 'value' },
            date: new Date(),
            regex: /test/g
        };

        const result = await engine.process([
            createMockSection('Test', mixedMetadata)
        ]);

        expect(result.sections[0]?.section.metadata.string).toBe('value');
        expect(result.sections[0]?.section.metadata.number).toBe(123);
    });
});