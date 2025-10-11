import { describe, test, expect, afterEach } from 'vitest';
import { GeminiProvider } from '../../src/providers/ai/gemini.ts';

const originalFetch = global.fetch;

describe('GeminiProvider', () => {
    afterEach(() => {
        global.fetch = originalFetch;
    });

    test('should initialize with API key', () => {
        const provider = new GeminiProvider({ apiKey: 'test-key' });

        expect(provider.name).toBe('gemini');
    });

    test('should throw error without API key', () => {
        expect(() => {
            new GeminiProvider({});
        }).toThrow('API key is required');
    });

    test('should execute request successfully', async () => {
        const mockResponse = {
            candidates: [{
                content: { parts: [{ text: '{"result": "success"}' }], role: 'model' },
                finishReason: 'STOP'
            }]
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        } as Response);

        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const result = await provider.execute({
            input: 'test prompt',
            options: {}
        });

        expect(result.data).toEqual({ result: 'success' });
        expect(result.error).toBeUndefined();
    });

    test('should handle safety filters', async () => {
        const mockResponse = {
            candidates: [{
                content: { parts: [{ text: '{"result": "ok"}' }], role: 'model' },
                finishReason: 'SAFETY',
                safetyRatings: [
                    { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'HIGH' }
                ]
            }]
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        } as Response);

        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const result = await provider.execute({
            input: 'test',
            options: {}
        });

        expect(result.error).toContain('safety filters');
    });

    test('should handle content blocking', async () => {
        const mockResponse = {
            promptFeedback: {
                blockReason: 'SAFETY'
            }
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        } as Response);

        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const result = await provider.execute({
            input: 'blocked content',
            options: {}
        });

        expect(result.error).toContain('blocked');
    });

    test('should reject batch inputs', async () => {
        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const result = await provider.execute({
            input: ['input1', 'input2'],
            options: {}
        });

        expect(result.error).toContain('does not support batch inputs');
    });

    test('should handle finish reasons', async () => {
        const mockResponse = {
            candidates: [{
                content: { parts: [{ text: '{"result": "truncated"}' }], role: 'model' },
                finishReason: 'MAX_TOKENS'
            }]
        };

        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation();

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        } as Response);

        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const result = await provider.execute({
            input: 'test',
            options: {}
        });

        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('MAX_TOKENS'));
        expect(result.data).toEqual({ result: 'truncated' });

        consoleWarnSpy.mockRestore();
    });

    test('should estimate token count', async () => {
        const mockResponse = {
            candidates: [{
                content: { parts: [{ text: '{"result": "ok"}' }], role: 'model' },
                finishReason: 'STOP'
            }]
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        } as Response);

        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const result = await provider.execute({
            input: 'test',
            options: {}
        });

        expect(result.metadata?.tokenCount).toBeDefined();
        expect(typeof result.metadata?.tokenCount).toBe('number');
    });

    test('should handle custom baseUrl', async () => {
        const mockResponse = {
            candidates: [{
                content: { parts: [{ text: '{"result": "ok"}' }], role: 'model' },
                finishReason: 'STOP'
            }]
        };

        let capturedUrl: string = '';

        global.fetch = vi.fn().mockImplementation(async (url) => {
            capturedUrl = url as string;
            return {
                ok: true,
                json: async () => mockResponse
            } as Response;
        });

        const provider = new GeminiProvider({
            apiKey: 'test-key',
            baseUrl: 'https://custom.api.com/v1'
        });

        await provider.execute({
            input: 'test',
            options: {}
        });

        expect(capturedUrl).toContain('https://custom.api.com/v1');
    });

    test('should handle topP and topK parameters', async () => {
        let capturedBody: any;

        const mockResponse = {
            candidates: [{
                content: { parts: [{ text: '{"result": "ok"}' }], role: 'model' },
                finishReason: 'STOP'
            }]
        };

        global.fetch = vi.fn().mockImplementation(async (url, options) => {
            capturedBody = JSON.parse(options?.body as string);
            return {
                ok: true,
                json: async () => mockResponse
            } as Response;
        });

        const provider = new GeminiProvider({ apiKey: 'test-key' });
        await provider.execute({
            input: 'test',
            options: { topP: 0.9, topK: 40 }
        });

        expect(capturedBody.generationConfig.topP).toBe(0.9);
        expect(capturedBody.generationConfig.topK).toBe(40);
    });

    test('should use default model gemini-1.5-pro', async () => {
        let capturedUrl: string = '';

        const mockResponse = {
            candidates: [{
                content: { parts: [{ text: '{"result": "ok"}' }], role: 'model' },
                finishReason: 'STOP'
            }]
        };

        global.fetch = vi.fn().mockImplementation(async (url) => {
            capturedUrl = url as string;
            return {
                ok: true,
                json: async () => mockResponse
            } as Response;
        });

        const provider = new GeminiProvider({ apiKey: 'test-key' });
        await provider.execute({
            input: 'test',
            options: {}
        });

        expect(capturedUrl).toContain('gemini-1.5-pro');
    });

    test('should handle empty candidates', async () => {
        const mockResponse = {
            candidates: []
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        } as Response);

        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const result = await provider.execute({
            input: 'test',
            options: {}
        });

        expect(result.error).toContain('no candidates');
    });

    test('should handle API errors', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            text: async () => 'Bad Request'
        } as Response);

        const provider = new GeminiProvider({ apiKey: 'test-key' });
        const result = await provider.execute({
            input: 'test',
            options: {}
        });

        expect(result.error).toContain('400');
        expect(result.error).toContain('Bad Request');
    });

    test('should force JSON response format', async () => {
        let capturedBody: any;

        const mockResponse = {
            candidates: [{
                content: { parts: [{ text: '{"result": "ok"}' }], role: 'model' },
                finishReason: 'STOP'
            }]
        };

        global.fetch = vi.fn().mockImplementation(async (url, options) => {
            capturedBody = JSON.parse(options?.body as string);
            return {
                ok: true,
                json: async () => mockResponse
            } as Response;
        });

        const provider = new GeminiProvider({ apiKey: 'test-key' });
        await provider.execute({
            input: 'test',
            options: {}
        });

        expect(capturedBody.generationConfig.responseMimeType).toBe('application/json');
    });

    test('should handle MAX_TOKENS finish reason warning', async () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

        const mockResponse = {
            candidates: [{
                content: { parts: [{ text: '{"result": "truncated"}' }], role: 'model' },
                finishReason: 'MAX_TOKENS'
            }]
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        } as Response);

        const provider = new GeminiProvider({ apiKey: 'test-key' });
        await provider.execute({ input: 'test', options: {} });

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});