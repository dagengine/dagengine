import { Plugin, type PromptContext, type ProviderSelection } from "../../src/plugin";
import type { SectionData } from "../../src/types";

/**
 * Base test plugin with default implementations for testing
 * Extend this in tests to avoid boilerplate
 */
export class TestPlugin extends Plugin {
	/**
	 * Default provider selection - returns 'mock' provider
	 * Override if you need custom provider logic
	 */
	selectProvider(dimension: string, sections?: SectionData[]): ProviderSelection {
		return {
			provider: "mock",
			options: {},
		};
	}

	/**
	 * Default prompt creation - returns dimension name
	 * Override if you need custom prompt logic
	 */
	createPrompt(context: PromptContext): string {
		return context.dimension || "test";
	}
}
