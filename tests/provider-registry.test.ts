import { describe, test, expect, beforeEach } from '@jest/globals';
import { Plugin } from '../src/plugin';
import { ProviderRegistry } from '../src/providers/registry';
import { MockAIProvider, createMockSection } from './setup';

describe('ProviderRegistry', () => {
    test('should register and retrieve providers', () => {
        const registry = new ProviderRegistry();
        const provider = new MockAIProvider();

        registry.register(provider);

        expect(registry.has('mock-ai')).toBe(true);
        expect(registry.get('mock-ai')).toBe(provider);
    });

    test('should throw error for duplicate registration', () => {
        const registry = new ProviderRegistry();
        const provider = new MockAIProvider();

        registry.register(provider);

        expect(() => registry.register(provider)).toThrow('already registered');
    });

    test('should throw error for missing provider', () => {
        const registry = new ProviderRegistry();

        expect(() => registry.get('nonexistent')).toThrow('not found');
    });

    test('should list all providers', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const list = registry.list();

        expect(list).toContain('mock-ai');
    });
});

// ============================================================================
// tests/plugin.test.ts - Plugin Tests
// ============================================================================

describe('Plugin', () => {
    test('should get dimension names', () => {
        class TestPlugin extends Plugin {
            constructor() {
                super('test', 'Test', 'Test');
                this.dimensions = [
                    'simple',
                    { name: 'complex', scope: 'global' as const }
                ];
            }

            createPrompt(): string {
                return '';
            }

            selectProvider(): any {
                return { provider: 'test' };
            }
        }

        const plugin = new TestPlugin();
        const names = plugin.getDimensionNames();

        expect(names).toEqual(['simple', 'complex']);
    });

    test('should identify global dimensions', () => {
        class TestPlugin extends Plugin {
            constructor() {
                super('test', 'Test', 'Test');
                this.dimensions = [
                    'section',
                    { name: 'global', scope: 'global' as const }
                ];
            }

            createPrompt(): string {
                return '';
            }

            selectProvider(): any {
                return { provider: 'test' };
            }
        }

        const plugin = new TestPlugin();

        expect(plugin.isGlobalDimension('section')).toBe(false);
        expect(plugin.isGlobalDimension('global')).toBe(true);
    });

    test('should throw error for unknown dimension', () => {
        class TestPlugin extends Plugin {
            constructor() {
                super('test', 'Test', 'Test');
                this.dimensions = ['known'];
            }

            createPrompt(): string {
                return '';
            }

            selectProvider(): any {
                return { provider: 'test' };
            }
        }

        const plugin = new TestPlugin();

        expect(() => plugin.getDimensionConfig('unknown')).toThrow('not found');
    });
});