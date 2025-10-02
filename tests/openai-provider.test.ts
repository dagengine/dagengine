import { OpenAIProvider, OPENAI_DEFAULTS } from '../src/providers/openai-provider';

// Mock fetch
global.fetch = jest.fn();

describe('OpenAIProvider', () => {
    let provider: OpenAIProvider;

    beforeEach(() => {
        provider = new OpenAIProvider({ apiKey: 'test-api-key' });
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        test('should throw error if no API key provided', () => {
            expect(() => {
                new OpenAIProvider({ apiKey: '' });
            }).toThrow('OpenAI API key is required');
        });

        test('should set provider name correctly', () => {
            expect(provider.name).toBe('openai');
        });

        test('should handle organization header when provided', () => {
            const orgProvider = new OpenAIProvider({
                apiKey: 'test',
                organization: 'org-test123'
            });
            expect(orgProvider.name).toBe('openai');
        });

        test('should use custom baseUrl when provided', () => {
            const customProvider = new OpenAIProvider({
                apiKey: 'test',
                baseUrl: 'https://custom.openai.com'
            });
            expect(customProvider.name).toBe('openai');
        });
    });

    describe('Input validation', () => {
        test('should reject empty prompt', async () => {
            await expect(provider.process('', {
                provider: 'openai',
                model: 'gpt-4'
            })).rejects.toThrow('Prompt cannot be empty');
        });

        test('should reject whitespace-only prompt', async () => {
            await expect(provider.process('   ', {
                provider: 'openai',
                model: 'gpt-4'
            })).rejects.toThrow('Prompt cannot be empty');
        });
    });

    describe('API interaction', () => {
        test('should handle successful response with JSON content', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{
                        message: {
                            content: '{"result": "success"}'
                        }
                    }]
                })
            });

            const result = await provider.process('test prompt', {
                provider: 'openai',
                model: 'gpt-4'
            });

            expect(result.success).toBe(true);
            expect(result.provider).toBe('openai');
            expect(result.data).toEqual({ result: 'success' });
            expect(result.rawContent).toBe('{"result": "success"}');
        });

        test('should handle successful response with plain text', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{
                        message: {
                            content: 'plain text response'
                        }
                    }]
                })
            });

            const result = await provider.process('test prompt', {
                provider: 'openai',
                model: 'gpt-4'
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
                provider: 'openai',
                model: 'gpt-4'
            })).rejects.toThrow('OpenAI API request failed (401): Unauthorized');
        });

        test('should handle network error', async () => {
            (fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));

            await expect(provider.process('test prompt', {
                provider: 'openai',
                model: 'gpt-4'
            })).rejects.toThrow('Connection refused');
        });

        test('should handle malformed JSON response', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.reject(new Error('Invalid JSON'))
            });

            await expect(provider.process('test prompt', {
                provider: 'openai',
                model: 'gpt-4'
            })).rejects.toThrow('Failed to parse OpenAI API response as JSON');
        });

        test('should handle missing content in response', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: []
                })
            });

            await expect(provider.process('test prompt', {
                provider: 'openai',
                model: 'gpt-4'
            })).rejects.toThrow('No content found in OpenAI API response');
        });

        test('should handle null content in message', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{
                        message: {
                            content: null
                        }
                    }]
                })
            });

            await expect(provider.process('test prompt', {
                provider: 'openai',
                model: 'gpt-4'
            })).rejects.toThrow('No content found in OpenAI API response');
        });
    });

    describe('Configuration handling', () => {
        test('should use default model when not provided', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'test' } }]
                })
            });

            await provider.process('test prompt', {
                provider: 'openai',
                model: ''
            });

            const fetchCall = (fetch as jest.Mock).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body.model).toBe(OPENAI_DEFAULTS.MODEL);
        });

        test('should use provided custom values', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'test' } }]
                })
            });

            await provider.process('test prompt', {
                provider: 'openai',
                model: 'gpt-3.5-turbo',
                temperature: 0.8,
                maxTokens: 2000
            });

            const fetchCall = (fetch as jest.Mock).mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);

            expect(body.model).toBe('gpt-3.5-turbo');
            expect(body.temperature).toBe(0.8);
            expect(body.max_tokens).toBe(2000);
        });

        test('should make correct API call without organization', async () => {
            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'test' } }]
                })
            });

            await provider.process('hello world', {
                provider: 'openai',
                model: 'gpt-4'
            });

            expect(fetch).toHaveBeenCalledWith(
                'https://api.openai.com/v1/chat/completions',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer test-api-key',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'gpt-4',
                        messages: [{ role: 'user', content: 'hello world' }],
                        temperature: 0.1,
                        max_tokens: 4000
                    })
                }
            );
        });

        test('should include organization header when provided', async () => {
            const orgProvider = new OpenAIProvider({
                apiKey: 'test-key',
                organization: 'org-test123'
            });

            (fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'test' } }]
                })
            });

            await orgProvider.process('hello world', {
                provider: 'openai',
                model: 'gpt-4'
            });

            const fetchCall = (fetch as jest.Mock).mock.calls[0];
            const headers = fetchCall[1].headers;

            expect(headers['OpenAI-Organization']).toBe('org-test123');
            expect(headers['Authorization']).toBe('Bearer test-key');
        });
    });
});