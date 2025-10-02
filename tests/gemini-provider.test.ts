// tests/gemini-provider.test.ts
import { GeminiProvider, GEMINI_DEFAULTS } from '../src/providers/gemini-provider';

// Mock fetch
global.fetch = jest.fn();

describe('GeminiProvider', () => {
    let provider: GeminiProvider;

    beforeEach(() => {
        provider = new GeminiProvider({ apiKey: 'test-api-key' });
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        test('should throw error if no API key provided', () => {
            expect(() => {
                new GeminiProvider({ apiKey: '' });
            }).toThrow('Gemini API key is required');
        });

        test('should set provider name correctly', () => {
            expect(provider.name).toBe('gemini');
        });

        test('should use custom baseUrl when provided', () => {
            const customProvider = new GeminiProvider({
                apiKey: 'test',
                baseUrl: 'https://custom.googleapis.com'
            });
            expect(customProvider.name).toBe('gemini');
        });
    });

    describe('Input validation', () => {
        test('should reject empty prompt', async () => {
            await expect(provider.process('', {
                provider: 'gemini',
                model: 'gemini-1.5-pro'
            })).rejects.toThrow('Prompt cannot be empty');
        });

        test('should reject whitespace-only prompt', async () => {
            await expect(provider.process('   ', {
                provider: 'gemini',
                model: 'gemini-1.5-pro'
            })).rejects.toThrow('Prompt cannot be empty');
        });
    });

    describe('API interaction', () => {
        test('should handle successful response with JSON content', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{ text: '{"result": "success"}' }]
                        }
                    }]
                })
            });

            const result = await provider.process('test prompt', {
                provider: 'gemini',
                model: 'gemini-1.5-pro'
            });

            expect(result.success).toBe(true);
            expect(result.provider).toBe('gemini');
            expect(result.data).toEqual({ result: 'success' });
            expect(result.rawContent).toBe('{"result": "success"}');
        });

        test('should handle successful response with plain text', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{ text: 'plain text response' }]
                        }
                    }]
                })
            });

            const result = await provider.process('test prompt', {
                provider: 'gemini',
                model: 'gemini-1.5-pro'
            });

            expect(result.success).toBe(true);
            expect(result.data).toBe('plain text response');
        });

        test('should handle API error response', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 403,
                text: () => Promise.resolve('Forbidden')
            });

            await expect(provider.process('test prompt', {
                provider: 'gemini',
                model: 'gemini-1.5-pro'
            })).rejects.toThrow('Gemini API request failed (403): Forbidden');
        });

        test('should handle network error', async () => {
            (fetch as jest.Mock).mockRejectedValue(new Error('Network timeout'));

            await expect(provider.process('test prompt', {
                provider: 'gemini',
                model: 'gemini-1.5-pro'
            })).rejects.toThrow('Network timeout');
        });

        test('should handle malformed JSON response', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.reject(new Error('Invalid JSON'))
            });

            await expect(provider.process('test prompt', {
                provider: 'gemini',
                model: 'gemini-1.5-pro'
            })).rejects.toThrow('Failed to parse Gemini API response as JSON');
        });

        test('should handle missing content in response', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    candidates: []
                })
            });

            await expect(provider.process('test prompt', {
                provider: 'gemini',
                model: 'gemini-1.5-pro'
            })).rejects.toThrow('No content found in Gemini API response');
        });

        test('should handle missing text in parts', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: []
                        }
                    }]
                })
            });

            await expect(provider.process('test prompt', {
                provider: 'gemini',
                model: 'gemini-1.5-pro'
            })).rejects.toThrow('No content found in Gemini API response');
        });
    });

    describe('Configuration handling', () => {
        test('should use default model when not provided', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{ text: 'test' }]
                        }
                    }]
                })
            });

            await provider.process('test prompt', {
                provider: 'gemini',
                model: ''
            });

            const fetchCall = (fetch as jest.Mock).mock.calls[0];
            const url = fetchCall[0];
            expect(url).toContain(GEMINI_DEFAULTS.MODEL);
        });

        test('should use provided custom values', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{ text: 'test' }]
                        }
                    }]
                })
            });

            await provider.process('test prompt', {
                provider: 'gemini',
                model: 'gemini-1.0-pro',
                temperature: 0.8,
                maxTokens: 2000
            });

            const fetchCall = (fetch as jest.Mock).mock.calls[0];
            const url = fetchCall[0];
            const body = JSON.parse(fetchCall[1].body);

            expect(url).toContain('gemini-1.0-pro');
            expect(body.generationConfig.temperature).toBe(0.8);
            expect(body.generationConfig.maxOutputTokens).toBe(2000);
        });

        test('should make correct API call', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{ text: 'test' }]
                        }
                    }]
                })
            });

            await provider.process('hello world', {
                provider: 'gemini',
                model: 'gemini-1.5-pro'
            });

            const expectedUrl = `${GEMINI_DEFAULTS.BASE_URL}/models/gemini-1.5-pro:generateContent?key=test-api-key`;

            expect(fetch).toHaveBeenCalledWith(
                expectedUrl,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: 'hello world' }] }],
                        generationConfig: {
                            temperature: 0.1,
                            maxOutputTokens: 4000,
                            responseMimeType: 'application/json'
                        }
                    })
                }
            );
        });
    });
});