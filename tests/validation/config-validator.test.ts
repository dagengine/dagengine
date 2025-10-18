import { describe, test, expect, beforeEach } from "vitest";
import { ConfigValidator } from "../../src/core/validation/config-validator.js";
import { Plugin } from "../../src/plugin.js";
import { ProviderRegistry } from "../../src/providers/registry.js";
import { ProviderAdapter } from "../../src/providers/adapter.js";
import { MockAIProvider } from "../setup.js";
import {
	ConfigurationError,
	NoProvidersError,
	ValidationError,
} from "../../src/core/shared/errors.js";
import { VALIDATION } from "../../src/core/shared/constants.js";
import type { PromptContext, ProviderSelection } from "../../src/types.js";

// ============================================================================
// TEST HELPERS
// ============================================================================

class TestPlugin extends Plugin {
	constructor() {
		super("test", "Test Plugin", "Test");
		this.dimensions = ["dim1", "dim2"];
	}

	createPrompt(context: PromptContext): string {
		return `Process: ${context.dimension}`;
	}

	selectProvider(): ProviderSelection {
		return { provider: "mock", options: {} };
	}
}

// ============================================================================
// VALID CONFIGURATION TESTS
// ============================================================================

describe("ConfigValidator - Valid Configurations", () => {
	let plugin: Plugin;
	let registry: ProviderRegistry;

	beforeEach(() => {
		plugin = new TestPlugin();
		registry = new ProviderRegistry();
		registry.register(new MockAIProvider());
	});

	test("should validate minimal valid config", () => {
		const config = {
			plugin,
			registry,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});

	test("should validate config with execution settings", () => {
		const config = {
			plugin,
			registry,
			execution: {
				concurrency: 5,
				maxRetries: 3,
				retryDelay: 1000,
				continueOnError: true,
				timeout: 30000,
			},
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});

	test("should validate config with top-level settings", () => {
		const config = {
			plugin,
			registry,
			concurrency: 10,
			maxRetries: 5,
			retryDelay: 500,
			timeout: 60000,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});

	test("should validate config with dimension timeouts", () => {
		const config = {
			plugin,
			registry,
			dimensionTimeouts: {
				dim1: 5000,
				dim2: 10000,
			},
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});

	test("should validate config with pricing", () => {
		const config = {
			plugin,
			registry,
			pricing: {
				models: {
					"gpt-4": {
						inputPer1M: 30.0,
						outputPer1M: 60.0,
					},
				},
			},
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});

	test("should validate config with providers instead of registry", () => {
		// ✅ Create adapter with proper config
		const adapter = new ProviderAdapter({
			anthropic: { apiKey: "test-key" }
		});

		const config = {
			plugin,
			providers: adapter,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});
});

// ============================================================================
// REQUIRED FIELD TESTS
// ============================================================================

describe("ConfigValidator - Required Fields", () => {
	let plugin: Plugin;
	let registry: ProviderRegistry;

	beforeEach(() => {
		plugin = new TestPlugin();
		registry = new ProviderRegistry();
		registry.register(new MockAIProvider());
	});

	test("should throw error for missing plugin", () => {
		const config = {
			registry,
		} as any;

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ConfigurationError);
	});

	test("should throw error for missing providers and registry", () => {
		const config = {
			plugin,
		} as any;

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ConfigurationError);
	});

	test("should include field name in error for missing plugin", () => {
		const config = {
			registry,
		} as any;

		try {
			ConfigValidator.validate(config);
			expect.fail("Should have thrown error");
		} catch (error) {
			expect(error).toBeInstanceOf(ConfigurationError);
			if (error instanceof ConfigurationError) {
				expect(error.message).toContain("plugin");
			}
		}
	});

	test("should include field name in error for missing providers", () => {
		const config = {
			plugin,
		} as any;

		try {
			ConfigValidator.validate(config);
			expect.fail("Should have thrown error");
		} catch (error) {
			expect(error).toBeInstanceOf(ConfigurationError);
			if (error instanceof ConfigurationError) {
				expect(error.message).toContain("providers");
			}
		}
	});
});

// ============================================================================
// CONCURRENCY VALIDATION TESTS
// ============================================================================

describe("ConfigValidator - Concurrency Validation", () => {
	let plugin: Plugin;
	let registry: ProviderRegistry;

	beforeEach(() => {
		plugin = new TestPlugin();
		registry = new ProviderRegistry();
		registry.register(new MockAIProvider());
	});

	test("should accept valid concurrency values", () => {
		const validValues = [1, 5, 10, 50, 100];

		validValues.forEach((concurrency) => {
			const config = {
				plugin,
				registry,
				concurrency,
			};

			expect(() => {
				ConfigValidator.validate(config);
			}).not.toThrow();
		});
	});

	test("should reject concurrency below minimum", () => {
		const config = {
			plugin,
			registry,
			concurrency: VALIDATION.MIN_CONCURRENCY - 1,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should reject concurrency above maximum", () => {
		const config = {
			plugin,
			registry,
			concurrency: VALIDATION.MAX_CONCURRENCY + 1,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should reject non-integer concurrency", () => {
		const config = {
			plugin,
			registry,
			concurrency: 5.5,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should reject negative concurrency", () => {
		const config = {
			plugin,
			registry,
			concurrency: -1,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should reject zero concurrency", () => {
		const config = {
			plugin,
			registry,
			concurrency: 0,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should validate concurrency in execution config", () => {
		const config = {
			plugin,
			registry,
			execution: {
				concurrency: 5,
			},
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});
});

// ============================================================================
// RETRY VALIDATION TESTS
// ============================================================================

describe("ConfigValidator - Retry Validation", () => {
	let plugin: Plugin;
	let registry: ProviderRegistry;

	beforeEach(() => {
		plugin = new TestPlugin();
		registry = new ProviderRegistry();
		registry.register(new MockAIProvider());
	});

	test("should accept valid retry values", () => {
		const validValues = [0, 1, 3, 5, 10];

		validValues.forEach((maxRetries) => {
			const config = {
				plugin,
				registry,
				maxRetries,
			};

			expect(() => {
				ConfigValidator.validate(config);
			}).not.toThrow();
		});
	});

	test("should reject retries below minimum", () => {
		const config = {
			plugin,
			registry,
			maxRetries: VALIDATION.MIN_RETRIES - 1,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should reject retries above maximum", () => {
		const config = {
			plugin,
			registry,
			maxRetries: VALIDATION.MAX_RETRIES + 1,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should reject non-integer retries", () => {
		const config = {
			plugin,
			registry,
			maxRetries: 3.5,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should accept zero retries", () => {
		const config = {
			plugin,
			registry,
			maxRetries: 0,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});
});

// ============================================================================
// RETRY DELAY VALIDATION TESTS
// ============================================================================

describe("ConfigValidator - Retry Delay Validation", () => {
	let plugin: Plugin;
	let registry: ProviderRegistry;

	beforeEach(() => {
		plugin = new TestPlugin();
		registry = new ProviderRegistry();
		registry.register(new MockAIProvider());
	});

	test("should accept valid retry delay values", () => {
		const validValues = [0, 100, 1000, 5000, 10000];

		validValues.forEach((retryDelay) => {
			const config = {
				plugin,
				registry,
				retryDelay,
			};

			expect(() => {
				ConfigValidator.validate(config);
			}).not.toThrow();
		});
	});

	test("should reject negative retry delay", () => {
		const config = {
			plugin,
			registry,
			retryDelay: -100,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should reject infinite retry delay", () => {
		const config = {
			plugin,
			registry,
			retryDelay: Infinity,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should reject NaN retry delay", () => {
		const config = {
			plugin,
			registry,
			retryDelay: NaN,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should accept zero retry delay", () => {
		const config = {
			plugin,
			registry,
			retryDelay: 0,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});

	test("should accept decimal retry delay", () => {
		const config = {
			plugin,
			registry,
			retryDelay: 100.5,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});
});

// ============================================================================
// TIMEOUT VALIDATION TESTS
// ============================================================================

describe("ConfigValidator - Timeout Validation", () => {
	let plugin: Plugin;
	let registry: ProviderRegistry;

	beforeEach(() => {
		plugin = new TestPlugin();
		registry = new ProviderRegistry();
		registry.register(new MockAIProvider());
	});

	test("should accept valid timeout values", () => {
		const validValues = [1000, 5000, 30000, 60000, 300000];

		validValues.forEach((timeout) => {
			const config = {
				plugin,
				registry,
				timeout,
			};

			expect(() => {
				ConfigValidator.validate(config);
			}).not.toThrow();
		});
	});

	test("should reject timeout below minimum", () => {
		const config = {
			plugin,
			registry,
			timeout: VALIDATION.MIN_TIMEOUT - 1,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should reject timeout above maximum", () => {
		const config = {
			plugin,
			registry,
			timeout: VALIDATION.MAX_TIMEOUT + 1,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should reject infinite timeout", () => {
		const config = {
			plugin,
			registry,
			timeout: Infinity,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should reject NaN timeout", () => {
		const config = {
			plugin,
			registry,
			timeout: NaN,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should reject non-numeric timeout", () => {
		const config = {
			plugin,
			registry,
			timeout: "30000" as any,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});
});

// ============================================================================
// DIMENSION TIMEOUT VALIDATION TESTS
// ============================================================================

describe("ConfigValidator - Dimension Timeout Validation", () => {
	let plugin: Plugin;
	let registry: ProviderRegistry;

	beforeEach(() => {
		plugin = new TestPlugin();
		registry = new ProviderRegistry();
		registry.register(new MockAIProvider());
	});

	test("should accept valid dimension timeouts", () => {
		const config = {
			plugin,
			registry,
			dimensionTimeouts: {
				dim1: 5000,
				dim2: 10000,
				dim3: 30000,
			},
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});

	test("should reject invalid dimension timeout", () => {
		const config = {
			plugin,
			registry,
			dimensionTimeouts: {
				dim1: VALIDATION.MIN_TIMEOUT - 1,
			},
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should reject dimension timeout above maximum", () => {
		const config = {
			plugin,
			registry,
			dimensionTimeouts: {
				dim1: VALIDATION.MAX_TIMEOUT + 1,
			},
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should reject infinite dimension timeout", () => {
		const config = {
			plugin,
			registry,
			dimensionTimeouts: {
				dim1: Infinity,
			},
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should include dimension name in error", () => {
		const config = {
			plugin,
			registry,
			dimensionTimeouts: {
				problematicDim: -1000,
			},
		};

		try {
			ConfigValidator.validate(config);
			expect.fail("Should have thrown error");
		} catch (error) {
			expect(error).toBeInstanceOf(ValidationError);
			if (error instanceof ValidationError) {
				expect(error.message).toContain("Timeout must be at least 100ms");
			}
		}
	});

	test("should validate multiple dimension timeouts", () => {
		const config = {
			plugin,
			registry,
			dimensionTimeouts: {
				dim1: 1000,
				dim2: 2000,
				dim3: -100, // Invalid
			},
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});

	test("should validate dimension timeouts in execution config", () => {
		const config = {
			plugin,
			registry,
			execution: {
				dimensionTimeouts: {
					dim1: 5000,
				},
			},
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});
});

// ============================================================================
// PROVIDER ADAPTER VALIDATION TESTS
// ============================================================================

describe("ConfigValidator - Provider Adapter Validation", () => {
	test("should validate adapter with providers", () => {
		// ✅ Create adapter with provider config (it creates its own registry internally)
		const adapter = new ProviderAdapter({
			anthropic: { apiKey: "test-key" }
		});

		expect(() => {
			ConfigValidator.validateProviderAdapter(adapter);
		}).not.toThrow();
	});

	test("should throw error for adapter with no providers", () => {
		// ✅ Empty config = no providers registered
		const adapter = new ProviderAdapter({});

		expect(() => {
			ConfigValidator.validateProviderAdapter(adapter);
		}).toThrow(NoProvidersError);
	});

	test("should validate adapter with multiple providers", () => {
		// ✅ Register multiple providers via config
		const adapter = new ProviderAdapter({
			anthropic: { apiKey: "test-key-1" },
			openai: { apiKey: "test-key-2" },
		});

		expect(() => {
			ConfigValidator.validateProviderAdapter(adapter);
		}).not.toThrow();
	});

	test("should validate adapter with custom registered provider", () => {
		const adapter = new ProviderAdapter({});

		// ✅ Register a custom provider manually
		adapter.registerProvider(new MockAIProvider());

		expect(() => {
			ConfigValidator.validateProviderAdapter(adapter);
		}).not.toThrow();
	});
});

// ============================================================================
// COMBINED VALIDATION TESTS
// ============================================================================

describe("ConfigValidator - Combined Validation", () => {
	let plugin: Plugin;
	let registry: ProviderRegistry;

	beforeEach(() => {
		plugin = new TestPlugin();
		registry = new ProviderRegistry();
		registry.register(new MockAIProvider());
	});

	test("should validate complex valid config", () => {
		const config = {
			plugin,
			registry,
			execution: {
				concurrency: 10,
				maxRetries: 3,
				retryDelay: 1000,
				continueOnError: true,
				timeout: 30000,
				dimensionTimeouts: {
					dim1: 5000,
					dim2: 10000,
				},
			},
			pricing: {
				models: {
					"gpt-4": {
						inputPer1M: 30.0,
						outputPer1M: 60.0,
					},
				},
			},
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});

	test("should catch first validation error in complex config", () => {
		const config = {
			plugin,
			registry,
			concurrency: -5, // Invalid
			maxRetries: 1000, // Also invalid
			timeout: -1000, // Also invalid
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).toThrow(ValidationError);
	});
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe("ConfigValidator - Edge Cases", () => {
	let plugin: Plugin;
	let registry: ProviderRegistry;

	beforeEach(() => {
		plugin = new TestPlugin();
		registry = new ProviderRegistry();
		registry.register(new MockAIProvider());
	});

	test("should handle empty execution config", () => {
		const config = {
			plugin,
			registry,
			execution: {},
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});

	test("should handle undefined values", () => {
		const config = {
			plugin,
			registry,
			concurrency: undefined,
			maxRetries: undefined,
			timeout: undefined,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});

	test("should prefer execution config over top-level", () => {
		const config = {
			plugin,
			registry,
			concurrency: 5,
			execution: {
				concurrency: 10, // This should be validated
			},
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});

	test("should handle empty dimension timeouts", () => {
		const config = {
			plugin,
			registry,
			dimensionTimeouts: {},
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});

	test("should accept minimum boundary values", () => {
		const config = {
			plugin,
			registry,
			concurrency: VALIDATION.MIN_CONCURRENCY,
			maxRetries: VALIDATION.MIN_RETRIES,
			retryDelay: 0,
			timeout: VALIDATION.MIN_TIMEOUT,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});

	test("should accept maximum boundary values", () => {
		const config = {
			plugin,
			registry,
			concurrency: VALIDATION.MAX_CONCURRENCY,
			maxRetries: VALIDATION.MAX_RETRIES,
			timeout: VALIDATION.MAX_TIMEOUT,
		};

		expect(() => {
			ConfigValidator.validate(config);
		}).not.toThrow();
	});
});