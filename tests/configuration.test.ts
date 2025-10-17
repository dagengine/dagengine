// tests/engine-config.test.ts

import { describe, test, expect } from 'vitest';
import { DagEngine } from '../src/core/engine/dag-engine';
import { Plugin } from '../src/plugin';
import { ProviderRegistry } from '../src/providers/registry';
import { ProviderAdapter } from '../src/providers/adapter';
import { MockAIProvider } from './setup';

class TestPlugin extends Plugin {
    constructor() {
        super('test', 'Test', 'Test plugin');
        this.dimensions = ['test'];
    }

    createPrompt(): string {
        return 'test';
    }

    selectProvider(): any {
        return { provider: 'mock-ai' };
    }
}

describe('DagEngine - Configuration Validation', () => {
    test('should require plugin in config', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        expect(() => {
            new DagEngine({
                plugin: null as any,
                registry
            });
        }).toThrow();
    });

    test('should require either providers or registry', () => {
        expect(() => {
            new DagEngine({
                plugin: new TestPlugin()
            });
        }).toThrow('requires either "providers" or "registry"');
    });

    test('should accept providers config', () => {
        const adapter = new ProviderAdapter({});
        adapter.registerProvider(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            providers: adapter
        });

        expect(engine).toBeInstanceOf(DagEngine);
    });

    test('should throw error when providers config is empty', () => {
        expect(() => {
            new DagEngine({
                plugin: new TestPlugin(),
                providers: new ProviderAdapter({})
            });
        }).toThrow('at least one provider');
    });

    test('should accept registry config', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry
        });

        expect(engine).toBeInstanceOf(DagEngine);
    });

    test('should use default concurrency value', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry
        });

        const config = engine.getExecutionConfig();
        expect(config.concurrency).toBe(5);
    });

    test('should accept custom concurrency', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry,
            concurrency: 15
        });

        const config = engine.getExecutionConfig();
        expect(config.concurrency).toBe(15);
    });

    test('should use default maxRetries value', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry
        });

        const config = engine.getExecutionConfig();
        expect(config.maxRetries).toBe(3);
    });

    test('should accept custom maxRetries', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry,
            maxRetries: 10
        });

        const config = engine.getExecutionConfig();
        expect(config.maxRetries).toBe(10);
    });

    test('should use default retryDelay value', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry
        });

        const config = engine.getExecutionConfig();
        expect(config.retryDelay).toBe(1000);
    });

    test('should accept custom retryDelay', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry,
            retryDelay: 500
        });

        const config = engine.getExecutionConfig();
        expect(config.retryDelay).toBe(500);
    });

    test('should use default timeout value', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry
        });

        const config = engine.getExecutionConfig();
        expect(config.timeout).toBe(60000);
    });

    test('should accept custom timeout', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry,
            timeout: 30000
        });

        const config = engine.getExecutionConfig();
        expect(config.timeout).toBe(30000);
    });

    test('should use default continueOnError value', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry
        });

        const config = engine.getExecutionConfig();
        expect(config.continueOnError).toBe(true);
    });

    test('should accept custom continueOnError', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry,
            continueOnError: false
        });

        const config = engine.getExecutionConfig();
        expect(config.continueOnError).toBe(false);
    });

    test('should accept dimensionTimeouts', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry,
            dimensionTimeouts: {
                dim1: 5000,
                dim2: 10000
            }
        });

        const config = engine.getExecutionConfig();
        expect(config.dimensionTimeouts).toEqual({
            dim1: 5000,
            dim2: 10000
        });
    });

    test('should use empty dimensionTimeouts by default', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry
        });

        const config = engine.getExecutionConfig();
        expect(config.dimensionTimeouts).toEqual({});
    });

    test('should throw error when no providers available', () => {
        const emptyRegistry = new ProviderRegistry();

        expect(() => {
            new DagEngine({
                plugin: new TestPlugin(),
                registry: emptyRegistry
            });
        }).toThrow('at least one provider');
    });

    test('should reject zero concurrency with clear error', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        expect(() => {
            new DagEngine({
                plugin: new TestPlugin(),
                registry,
                concurrency: 0
            });
        }).toThrow('Concurrency must be at least 1');
    });

    test('should reject negative concurrency', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        expect(() => {
            new DagEngine({
                plugin: new TestPlugin(),
                registry,
                concurrency: -5
            });
        }).toThrow('Concurrency must be at least 1');
    });

    test('should accept zero retries', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry,
            maxRetries: 0
        });

        const config = engine.getExecutionConfig();
        expect(config.maxRetries).toBe(0);
    });

    test('should get adapter from engine', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry
        });

        const adapter = engine.getAdapter();
        expect(adapter).toBeInstanceOf(ProviderAdapter);
    });

    test('should get available providers', () => {
        const registry = new ProviderRegistry();
        registry.register(new MockAIProvider());

        const engine = new DagEngine({
            plugin: new TestPlugin(),
            registry
        });

        const providers = engine.getAvailableProviders();
        expect(providers).toContain('mock-ai');
    });
});