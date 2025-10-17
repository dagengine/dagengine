import { describe, test, expect, beforeEach, vi } from 'vitest';
import { DagEngine } from '../src/core/engine';
import { Plugin } from '../src/plugin';
import { ProviderRegistry } from '../src/providers/registry';
import { MockAIProvider, createMockSection } from './setup';

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