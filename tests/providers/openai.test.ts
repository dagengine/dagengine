import { describe, test, expect, afterEach } from '@jest/globals';
import { OpenAIProvider } from '../../src/providers/ai/openai.ts';

const originalFetch = global.fetch;

describe('OpenAIProvider', () => {
    afterEach(() => {
        global.fetch = originalFetch;
    });

    test('should initialize with API key', () => {
        const provider = new OpenAIProvider({ apiKey: 'test-key' });

        expect(provider.name).toBe('openai');
    });

    test('should throw error without API key', () => {
        expect(() => {
            new OpenAIProvider({});
        }).toThrow('API key is required');
    });

    test('should execute request successfully', async () => {
        const mockResponse = {
            choices: [{ message: { content: '{"result": "success"}' } }]
        };

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        } as Response);

        const provider = new OpenAIProvider({ apiKey: 'test-key' });
        const result = await provider.execute({
            input: 'test prompt',
            options: {}
        });

        expect(result.data).toEqual({ result: 'success' });
        expect(result.error).toBeUndefined();
    });

    test('should handle API errors', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 401,
            text: async () => 'Invalid API key'
        } as Response);

        const provider = new OpenAIProvider({ apiKey: 'invalid-key' });
        const result = await provider.execute({
            input: 'test prompt',
            options: {}
        });

        expect(result.error).toContain('401');
        expect(result.error).toContain('Invalid API key');
        expect(result.data).toBeUndefined();
    });

    test('should use default model gpt-4o', async () => {
        let capturedBody: any;

        global.fetch = jest.fn().mockImplementation(async (url, options) => {
            capturedBody = JSON.parse(options?.body as string);
            return {
                ok: true,
                json: async () => ({ choices: [{ message: { content: '{"ok": true}' } }] })
            } as Response;
        });

        const provider = new OpenAIProvider({ apiKey: 'test-key' });
        await provider.execute({
            input: 'test',
            options: {}
        });

        expect(capturedBody.model).toBe('gpt-4o');
    });

    test('should handle custom model', async () => {
        let capturedBody: any;

        global.fetch = jest.fn().mockImplementation(async (url, options) => {
            capturedBody = JSON.parse(options?.body as string);
            return {
                ok: true,
                json: async () => ({ choices: [{ message: { content: '{"ok": true}' } }] })
            } as Response;
        });

        const provider = new OpenAIProvider({ apiKey: 'test-key' });
        await provider.execute({
            input: 'test',
            options: { model: 'gpt-4o-mini' }
        });

        expect(capturedBody.model).toBe('gpt-4o-mini');
    });

    test('should handle custom parameters', async () => {
        let capturedBody: any;

        global.fetch = jest.fn().mockImplementation(async (url, options) => {
            capturedBody = JSON.parse(options?.body as string);
            return {
                ok: true,
                json: async () => ({ choices: [{ message: { content: '{"ok": true}' } }] })
            } as Response;
        });

        const provider = new OpenAIProvider({ apiKey: 'test-key' });
        await provider.execute({
            input: 'test',
            options: {
                maxTokens: 2048,
                temperature: 0.7
            }
        });

        expect(capturedBody.max_tokens).toBe(2048);
        expect(capturedBody.temperature).toBe(0.7);
    });

    test('should parse JSON responses', async () => {
        const mockResponse = {
            choices: [{ message: { content: '```json\n{"parsed": true}\n```' } }]
        };

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        } as Response);

        const provider = new OpenAIProvider({ apiKey: 'test-key' });
        const result = await provider.execute({
            input: 'test',
            options: {}
        });

        expect(result.data).toEqual({ parsed: true });
    });

    test('should use default temperature 0.1', async () => {
        let capturedBody: any;

        global.fetch = jest.fn().mockImplementation(async (url, options) => {
            capturedBody = JSON.parse(options?.body as string);
            return {
                ok: true,
                json: async () => ({ choices: [{ message: { content: '{"ok": true}' } }] })
            } as Response;
        });

        const provider = new OpenAIProvider({ apiKey: 'test-key' });
        await provider.execute({
            input: 'test',
            options: {}
        });

        expect(capturedBody.temperature).toBe(0.1);
    });

    test('should handle empty response', async () => {
        const mockResponse = {
            choices: []
        };

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        } as Response);

        const provider = new OpenAIProvider({ apiKey: 'test-key' });
        const result = await provider.execute({
            input: 'test',
            options: {}
        });

        expect(result.error).toBeDefined();
    });

    test('should include metadata in response', async () => {
        const mockResponse = {
            choices: [{ message: { content: '{"result": "ok"}' } }]
        };

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        } as Response);

        const provider = new OpenAIProvider({ apiKey: 'test-key' });
        const result = await provider.execute({
            input: 'test',
            options: { model: 'gpt-4o', maxTokens: 1024 }
        });

        expect(result.metadata).toBeDefined();
        expect(result.metadata?.model).toBe('gpt-4o');
        expect(result.metadata?.tokens).toBe(1024);
    });
});