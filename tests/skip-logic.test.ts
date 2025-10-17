import { describe, test, expect, beforeEach, vi } from "vitest";
import { DagEngine } from "../src/core/engine";
import { Plugin } from "../src/plugin";
import { ProviderRegistry } from "../src/providers/registry";
import { MockAIProvider, createMockSection } from "./setup";
import type { SectionDimensionContext } from "../src/types";

describe("DagEngine - Dynamic Skipping", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("check", { quality: "good" });
		mockProvider.setMockResponse("analysis", { result: "deep" });
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should skip dimensions based on shouldSkipDimension with dependency access", async () => {
		class SkipPlugin extends Plugin {
			constructor() {
				super("skip", "Skip", "Test skip");
				this.dimensions = ["check", "analysis"];
			}

			createPrompt(context: any): string {
				return context.dimension;
			}

			selectProvider(): any {
				return { provider: "mock-ai" };
			}

			defineDependencies(): Record<string, string[]> {
				return {
					analysis: ["check"], // analysis depends on check
				};
			}

			// ✅ FIXED: Use correct signature with SectionDimensionContext
			shouldSkipDimension(context: SectionDimensionContext): boolean {
				const { dimension, dependencies } = context;

				if (dimension === "analysis") {
					// ✅ Access 'check' through dependencies
					// 'check' is available because it's declared as a dependency
					return dependencies?.check?.data?.quality === "good";
				}
				return false;
			}
		}

		const engine = new DagEngine({
			plugin: new SkipPlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Test")]);

		// check dimension executes normally
		expect(result.sections[0]?.results?.check?.data).toEqual({
			quality: "good",
		});

		// analysis dimension is skipped because check.quality === 'good'
		expect(result.sections[0]?.results?.analysis?.data).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipDimension",
		});
	});

	test("should execute dimension when skip condition not met", async () => {
		class SkipPlugin extends Plugin {
			constructor() {
				super("skip", "Skip", "Test");
				this.dimensions = ["check", "analysis"];
			}

			createPrompt(context: any): string {
				return context.dimension;
			}

			selectProvider(): any {
				return { provider: "mock-ai" };
			}

			defineDependencies(): Record<string, string[]> {
				return {
					analysis: ["check"],
				};
			}

			// ✅ FIXED: Use correct signature
			shouldSkipDimension(context: SectionDimensionContext): boolean {
				const { dimension, dependencies } = context;

				if (dimension === "analysis") {
					// ✅ Access through dependencies
					return dependencies?.check?.data?.quality === "good";
				}
				return false;
			}
		}

		mockProvider.setMockResponse("check", { quality: "poor" });
		mockProvider.setMockResponse("analysis", { result: "deep" });

		const engine = new DagEngine({
			plugin: new SkipPlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Test")]);

		// check executes and returns 'poor'
		expect(result.sections[0]?.results?.check?.data).toEqual({
			quality: "poor",
		});

		// analysis executes because check.quality !== 'good'
		expect(result.sections[0]?.results?.analysis?.data).toEqual({
			result: "deep",
		});
	});

	test("should skip dimension without dependencies (content-based)", async () => {
		class ContentSkipPlugin extends Plugin {
			constructor() {
				super("content-skip", "Content Skip", "Test content skip");
				this.dimensions = ["process"];
			}

			createPrompt(context: any): string {
				return context.dimension;
			}

			selectProvider(): any {
				return { provider: "mock-ai" };
			}

			// ✅ FIXED: Use correct signature
			shouldSkipDimension(context: SectionDimensionContext): boolean {
				const { section } = context;
				// Skip if content is too short
				return section.content.length < 10;
			}
		}

		mockProvider.setMockResponse("process", { result: "processed" });

		const engine = new DagEngine({
			plugin: new ContentSkipPlugin(),
			registry,
		});

		const result = await engine.process([
			createMockSection("Hi"), // Too short - skip
			createMockSection("Long enough content"), // Long enough - process
		]);

		// First section skipped
		expect(result.sections[0]?.results?.process?.data).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipDimension",
		});

		// Second section processed
		expect(result.sections[1]?.results?.process?.data).toEqual({
			result: "processed",
		});
	});
});

describe("Dependency-Based Skipping", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("check", { quality: "good" });
		mockProvider.setMockResponse("analysis", { result: "deep" });
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should skip dimensions based on dependency results", async () => {
		class SkipPlugin extends Plugin {
			constructor() {
				super("skip", "Skip", "Test skip");
				this.dimensions = ["check", "analysis"];
			}

			createPrompt(context: any): string {
				return context.dimension;
			}

			selectProvider(): any {
				return { provider: "mock-ai" };
			}

			defineDependencies(): Record<string, string[]> {
				return { analysis: ["check"] };
			}

			shouldSkipDimension(context: SectionDimensionContext): boolean {
				const { dimension, dependencies } = context;

				if (dimension === "analysis") {
					return dependencies?.check?.data?.quality === "good";
				}
				return false;
			}
		}

		mockProvider.setMockResponse("check", { quality: "good" });
		mockProvider.setMockResponse("analysis", { result: "deep" });

		const engine = new DagEngine({
			plugin: new SkipPlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(result.sections[0]?.results?.check?.data).toEqual({
			quality: "good",
		});
		expect(result.sections[0]?.results?.analysis?.data).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipDimension",
		});
	});

	test("should execute dimension when skip condition not met", async () => {
		class SkipPlugin extends Plugin {
			constructor() {
				super("skip", "Skip", "Test");
				this.dimensions = ["check", "analysis"];
			}

			createPrompt(context: any): string {
				return context.dimension;
			}

			selectProvider(): any {
				return { provider: "mock-ai" };
			}

			defineDependencies(): Record<string, string[]> {
				return { analysis: ["check"] };
			}

			shouldSkipDimension(context: SectionDimensionContext): boolean {
				const { dimension, dependencies } = context;

				if (dimension === "analysis") {
					return dependencies?.check?.data?.quality === "good";
				}
				return false;
			}
		}

		mockProvider.setMockResponse("check", { quality: "poor" });
		mockProvider.setMockResponse("analysis", { result: "deep" });

		const engine = new DagEngine({
			plugin: new SkipPlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Test")]);

		expect(result.sections[0]?.results?.analysis?.data).toEqual({
			result: "deep",
		});
	});
});
