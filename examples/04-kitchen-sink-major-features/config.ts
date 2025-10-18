/**
 * Configuration constants
 */

import type { ProviderSelection } from '../../src';

export const PROVIDER_STRATEGIES: Record<string, ProviderSelection> = {
	quality_check: {
		provider: 'gemini',
		options: { model: 'gemini-2.5-flash', temperature: 0.1 },
		fallbacks: [
			{ provider: 'anthropic', options: { model: 'claude-3-5-haiku-20241022' } }
		]
	},

	sentiment: {
		provider: 'anthropic',
		options: { model: 'claude-3-5-haiku-20241022', temperature: 0.1 },
		fallbacks: [
			{ provider: 'openai', options: { model: 'gpt-4o-mini' } },
			{ provider: 'gemini', options: { model: 'gemini-2.5-flash' } }
		]
	},

	topics: {
		provider: 'anthropic',
		options: { model: 'claude-3-5-haiku-20241022', temperature: 0.2 },
		fallbacks: [
			{ provider: 'openai', options: { model: 'gpt-4o-mini' } }
		]
	},

	group_by_sentiment: {
		provider: 'anthropic',
		options: { model: 'claude-sonnet-4-5-20250929', temperature: 0.1 }
	},

	deep_analysis: {
		provider: 'anthropic',
		options: { model: 'claude-sonnet-4-5-20250929', temperature: 0.3, max_tokens: 2000 },
		fallbacks: [
			{ provider: 'openai', options: { model: 'gpt-4o', max_tokens: 2000 } }
		]
	},

	competitive_compare: {
		provider: 'anthropic',
		options: { model: 'claude-sonnet-4-5-20250929', temperature: 0.2 }
	},

	executive_summary: {
		provider: 'anthropic',
		options: { model: 'claude-sonnet-4-5-20250929', temperature: 0.1 }
	},

	default: {
		provider: 'anthropic',
		options: { model: 'claude-3-5-haiku-20241022' }
	}
};

export const MODEL_PRICING = {
	'claude-sonnet-4-5-20250929': { inputPer1M: 3.00, outputPer1M: 15.00 },
	'claude-3-5-haiku-20241022': { inputPer1M: 0.80, outputPer1M: 4.00 },
	'gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00 },
	'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.60 },
	'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5.00 },
	'gemini-2.5-flash': { inputPer1M: 0.075, outputPer1M: 0.30 }
};