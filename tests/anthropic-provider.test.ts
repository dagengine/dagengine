import { AnthropicProvider, ANTHROPIC_DEFAULTS } from '../src/providers/anthropic-provider';

// Mock fetch
global.fetch = jest.fn();

describe('AnthropicProvider', () => {
    let provider: AnthropicProvider;

    beforeEach(() => {
        provider = new AnthropicProvider({ apiKey: 'test-api-key' });
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        test('should throw error if no API key provided', () => {
            expect(() => {
                new AnthropicProvider({ apiKey: '' });
            }).toThrow('Anthropic API key is required');
        });

        test('should set provider name correctly', () => {
            expect(provider.name).toBe('anthropic');
        });

        test('should use default values', () => {
            const provider = new AnthropicProvider({ apiKey: 'test' });
            // We can't directly test private properties, but we can test behavior
            expect(provider.name).toBe('anthropic');
        });
    });

    describe('Input validation', () => {
        test('should reject empty prompt', async () => {
            await expect(provider.process('', {
                provider: 'anthropic',
                model: 'claude-3-5-sonnet'
            })).rejects.toThrow('Prompt cannot be empty');
        });

        test('should reject whitespace-only prompt', async () => {
            await expect(provider.process('   ', {
                provider: 'anthropic',
                model: 'claude-3-5-sonnet'
            })).rejects.toThrow('Prompt cannot be empty');
        });
    });

    describe('API interaction', () => {
        test('should handle successful response with JSON content', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    content: [{ text: '{"result": "success"}' }]
                })
            });

            const result = await provider.process('test prompt', {
                provider: 'anthropic',
                model: 'claude-3-5-sonnet'
            });

            expect(result.success).toBe(true);
            expect(result.provider).toBe('anthropic');
            expect(result.data).toEqual({ result: 'success' });
            expect(result.rawContent).toBe('{"result": "success"}');
        });

        test('should handle successful response with plain text', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    content: [{ text: 'plain text response' }]
                })
            });

            const result = await provider.process('test prompt', {
                provider: 'anthropic',
                model: 'claude-3-5-sonnet'
            });

            expect(result.success).toBe(true);
            expect(result.data).toBe('plain text response');
        });

        test('should handle API error response', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 401,
                text: () => Promise.resolve('Unauthorized')
            });

            await expect(provider.process('test prompt', {
                provider: 'anthropic',
                model: 'claude-3-5-sonnet'
            })).rejects.toThrow('Anthropic API request failed (401): Unauthorized');
        });

        test('should handle network error', async () => {
            (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            await expect(provider.process('test prompt', {
                provider: 'anthropic',
                model: 'claude-3-5-sonnet'
            })).rejects.toThrow('Network error');
        });

        test('should handle malformed JSON response', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.reject(new Error('Invalid JSON'))
            });

            await expect(provider.process('test prompt', {
                provider: 'anthropic',
                model: 'claude-3-5-sonnet'
            })).rejects.toThrow('Failed to parse Anthropic API response as JSON');
        });

        test('should handle missing content in response', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    content: []
                })
            });

            await expect(provider.process('test prompt', {
                provider: 'anthropic',
                model: 'claude-3-5-sonnet'
            })).rejects.toThrow('No content found in Anthropic API response');
        });
    });

    describe('Configuration handling', () => {
        test('should use default model when not provided', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    content: [{ text: 'test' }]
                })
            });

            await provider.process('test prompt', {
                provider: 'anthropic',
                model: ''
            });

            const fetchCall = (fetch as jest.Mock).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.model).toBe(ANTHROPIC_DEFAULTS.MODEL);
        });

        test('should use provided custom values', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    content: [{ text: 'test' }]
                })
            });

            await provider.process('test prompt', {
                provider: 'anthropic',
                model: 'claude-3-opus',
                temperature: 0.8,
                maxTokens: 2000
            });

            const fetchCall = (fetch as jest.Mock).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.model).toBe('claude-3-opus');
            expect(body.temperature).toBe(0.8);
            expect(body.max_tokens).toBe(2000);
        });

        test('should make correct API call', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    content: [{ text: 'test' }]
                })
            });

            await provider.process('hello world', {
                provider: 'anthropic',
                model: 'claude-3-5-sonnet'
            });

            expect(fetch).toHaveBeenCalledWith(
                'https://api.anthropic.com/v1/messages',
                {
                    method: 'POST',
                    headers: {
                        'x-api-key': 'test-api-key',
                        'Content-Type': 'application/json',
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: 'claude-3-5-sonnet',
                        max_tokens: 4000,
                        temperature: 0.1,
                        messages: [{ role: 'user', content: 'hello world' }]
                    })
                }
            );
        });
    });
});