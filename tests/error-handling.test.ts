import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../src/core/engine/dag-engine.ts";
import { MockAIProvider, createMockSection } from "./setup.ts";
import { ProviderRegistry } from "../src/providers/registry.ts";
import { Plugin } from "../src/plugin.ts";
import type {
	PromptContext,
	ProviderSelection,
	ProviderRequest,
	ProviderResponse,
} from "../src/types.ts";

/**
 * Error tracking structure
 */
interface ErrorEntry {
	context: string;
	error: Error;
}

describe("DagEngine - Error Handling", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should continue processing with continueOnError=true", async () => {
		class ErrorPlugin extends Plugin {
			constructor() {
				super("error", "Error", "Test errors");
				this.dimensions = ["failing", "succeeding"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.execute = async (
			request: ProviderRequest,
		): Promise<ProviderResponse> => {
			if (request.input === "failing") {
				return { error: "Failing dimension error" };
			}
			return { data: { result: "ok" } };
		};

		const engine = new DagEngine({
			plugin: new ErrorPlugin(),
			registry,
			continueOnError: true,
			maxRetries: 0,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(result.sections[0]?.results.failing?.error).toBeDefined();
		expect(result.sections[0]?.results.succeeding?.data).toBeDefined();
	}, 15000);

	test("should call onError callback", async () => {
		const errors: ErrorEntry[] = [];

		class ErrorPlugin extends Plugin {
			constructor() {
				super("error", "Error", "Test");
				this.dimensions = ["failing", "succeeding"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.execute = async (
			request: ProviderRequest,
		): Promise<ProviderResponse> => {
			if (request.input === "failing") {
				return { error: "Intentional failure" };
			}
			return { data: { result: "ok" } };
		};

		const engine = new DagEngine({
			plugin: new ErrorPlugin(),
			registry,
			continueOnError: true,
			maxRetries: 0,
		});

		await engine.process([createMockSection("Test")], {
			onError: (context: string, error: Error) => {
				errors.push({ context, error });
			},
		});

		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]?.context).toContain("failing");
	}, 15000);

	test("should handle missing provider error", async () => {
		class MissingProviderPlugin extends Plugin {
			constructor() {
				super("missing", "Missing", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "nonexistent", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new MissingProviderPlugin(),
			registry,
			continueOnError: true,
		});

		const result = await engine.process([createMockSection("Test")]);

		const error = result.sections[0]?.results.test?.error;

		expect(error).toBeDefined();
		expect(error).toContain('Provider "nonexistent" not found');
		expect(error).toContain("Available:");
	});

	test("should throw when continueOnError is false", async () => {
		class FailPlugin extends Plugin {
			constructor() {
				super("fail", "Fail", "Test");
				this.dimensions = ["failing"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.execute = async (): Promise<ProviderResponse> => {
			return { error: "Critical failure" };
		};

		const engine = new DagEngine({
			plugin: new FailPlugin(),
			registry,
			continueOnError: false,
			maxRetries: 0,
		});

		await expect(engine.process([createMockSection("Test")])).rejects.toThrow();
	});

	test("should handle errors in multiple sections independently", async () => {
		class MultiSectionErrorPlugin extends Plugin {
			constructor() {
				super("multi-error", "Multi Error", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		let sectionCount = 0;
		mockProvider.execute = async (): Promise<ProviderResponse> => {
			sectionCount++;
			// Fail on even sections
			if (sectionCount % 2 === 0) {
				return { error: "Even section error" };
			}
			return { data: { result: "ok" } };
		};

		const engine = new DagEngine({
			plugin: new MultiSectionErrorPlugin(),
			registry,
			continueOnError: true,
			maxRetries: 0,
		});

		const sections = [
			createMockSection("Section 1"),
			createMockSection("Section 2"),
			createMockSection("Section 3"),
			createMockSection("Section 4"),
		];

		const result = await engine.process(sections);

		// Sections 1 and 3 should succeed
		expect(result.sections[0]?.results.test?.data).toBeDefined();
		expect(result.sections[2]?.results.test?.data).toBeDefined();

		// Sections 2 and 4 should have errors
		expect(result.sections[1]?.results.test?.error).toBeDefined();
		expect(result.sections[3]?.results.test?.error).toBeDefined();
	});
});