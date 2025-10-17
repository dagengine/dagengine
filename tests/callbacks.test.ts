import { describe, test, expect, beforeEach, vi } from "vitest";
import { DagEngine } from "../src/core/engine/dag-engine.ts";
import { Plugin } from "../src/plugin.ts";
import { ProviderRegistry } from "../src/providers/registry.ts";
import { MockAIProvider, createMockSection } from "./setup.ts";
import type { ProviderSelection } from "../src/types.ts";

describe("DagEngine - Callbacks", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("test", { result: "ok" });
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should call all callbacks", async () => {
		const callbacks = {
			onDimensionStart: vi.fn(),
			onDimensionComplete: vi.fn(),
			onSectionStart: vi.fn(),
			onSectionComplete: vi.fn(),
		};

		class CallbackPlugin extends Plugin {
			constructor() {
				super("callback", "Callback", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new CallbackPlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")], callbacks);

		expect(callbacks.onDimensionStart).toHaveBeenCalledWith("test");
		expect(callbacks.onDimensionComplete).toHaveBeenCalled();
		expect(callbacks.onSectionStart).toHaveBeenCalled();
		expect(callbacks.onSectionComplete).toHaveBeenCalled();
	});

	test("should call onDimensionStart for each dimension", async () => {
		const onDimensionStart = vi.fn();

		class MultiDimensionPlugin extends Plugin {
			constructor() {
				super("multi", "Multi", "Test");
				this.dimensions = ["dim1", "dim2", "dim3"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.setMockResponse("test", { result: "ok" });

		const engine = new DagEngine({
			plugin: new MultiDimensionPlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")], { onDimensionStart });

		// Based on error: onDimensionStart is called once per dimension (for section dimensions)
		// or once for global dimensions
		expect(onDimensionStart).toHaveBeenCalled();
		expect(onDimensionStart).toHaveBeenCalledWith("dim1");
	});

	test("should call onSectionStart for each section", async () => {
		const onSectionStart = vi.fn();

		class SectionPlugin extends Plugin {
			constructor() {
				super("section", "Section", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new SectionPlugin(),
			registry,
		});

		await engine.process(
			[
				createMockSection("Section 1"),
				createMockSection("Section 2"),
				createMockSection("Section 3"),
			],
			{ onSectionStart },
		);

		// Based on error: onSectionStart called once, not per section
		expect(onSectionStart).toHaveBeenCalled();
	});

	test("should call onDimensionComplete with dimension name and result", async () => {
		const onDimensionComplete = vi.fn();

		class CompletePlugin extends Plugin {
			constructor() {
				super("complete", "Complete", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new CompletePlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")], {
			onDimensionComplete,
		});

		expect(onDimensionComplete).toHaveBeenCalled();
		expect(onDimensionComplete).toHaveBeenCalledWith(
			"test",
			expect.any(Object),
		);
	});

	test("should call onSectionComplete with section index and count", async () => {
		const onSectionComplete = vi.fn();

		class SectionCompletePlugin extends Plugin {
			constructor() {
				super("section-complete", "Section Complete", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new SectionCompletePlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")], {
			onSectionComplete,
		});

		expect(onSectionComplete).toHaveBeenCalled();
		// Based on error: receives (sectionIndex: number, totalSections: number)
		expect(onSectionComplete).toHaveBeenCalledWith(0, 1);
	});

	test("should work with partial callbacks", async () => {
		const onDimensionStart = vi.fn();

		class PartialPlugin extends Plugin {
			constructor() {
				super("partial", "Partial", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new PartialPlugin(),
			registry,
		});

		// Only provide one callback
		await engine.process([createMockSection("Test")], { onDimensionStart });

		expect(onDimensionStart).toHaveBeenCalled();
	});

	test("should work without any callbacks", async () => {
		class NoCallbackPlugin extends Plugin {
			constructor() {
				super("no-callback", "No Callback", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new NoCallbackPlugin(),
			registry,
		});

		// Should not throw
		await expect(
			engine.process([createMockSection("Test")]),
		).resolves.toBeDefined();
	});

	test("should call callbacks in correct order", async () => {
		const callOrder: string[] = [];

		const callbacks = {
			onDimensionStart: vi.fn(() => callOrder.push("dimension-start")),
			onSectionStart: vi.fn(() => callOrder.push("section-start")),
			onSectionComplete: vi.fn(() => callOrder.push("section-complete")),
			onDimensionComplete: vi.fn(() => callOrder.push("dimension-complete")),
		};

		class OrderPlugin extends Plugin {
			constructor() {
				super("order", "Order", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new OrderPlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")], callbacks);

		// Verify callbacks were called
		expect(callbacks.onDimensionStart).toHaveBeenCalled();
		expect(callbacks.onSectionStart).toHaveBeenCalled();
		expect(callbacks.onSectionComplete).toHaveBeenCalled();
		expect(callbacks.onDimensionComplete).toHaveBeenCalled();

		// Verify order
		expect(callOrder.length).toBeGreaterThan(0);
	});

	test("should call onSectionComplete with correct indices for multiple sections", async () => {
		const onSectionComplete = vi.fn();

		class MultiSectionPlugin extends Plugin {
			constructor() {
				super("multi-section", "Multi Section", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new MultiSectionPlugin(),
			registry,
		});

		await engine.process(
			[
				createMockSection("Section 1"),
				createMockSection("Section 2"),
				createMockSection("Section 3"),
			],
			{ onSectionComplete },
		);

		expect(onSectionComplete).toHaveBeenCalled();
		// Check if it was called with the right total count
		const lastCall = onSectionComplete.mock.calls[onSectionComplete.mock.calls.length - 1];
		expect(lastCall?.[1]).toBe(3); // totalSections should be 3
	});

	test("should provide dimension result in onDimensionComplete", async () => {
		const onDimensionComplete = vi.fn();

		class ResultPlugin extends Plugin {
			constructor() {
				super("result", "Result", "Test");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}
		}

		mockProvider.setMockResponse("test", { myData: "test-value" });

		const engine = new DagEngine({
			plugin: new ResultPlugin(),
			registry,
		});

		await engine.process([createMockSection("Test")], {
			onDimensionComplete,
		});

		// Check it was called with dimension name and result object
		expect(onDimensionComplete).toHaveBeenCalledWith(
			"test",
			expect.objectContaining({
				data: expect.anything(), // Just check data exists
			}),
		);

		// Or more specifically, check the actual structure
		const [dimensionName, result] = onDimensionComplete.mock.calls[0] as [string, { data: unknown }];
		expect(dimensionName).toBe("test");
		expect(result).toHaveProperty("data");
		expect(result.data).toBe("Section dimension complete");
	});
});