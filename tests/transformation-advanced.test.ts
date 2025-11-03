import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../src/core/engine/dag-engine.ts";
import { Plugin } from "../src/plugin.ts";
import { ProviderRegistry } from "../src/providers/registry.ts";
import { MockAIProvider, createMockSection } from "./setup.ts";
import type {
	SectionData,
	DimensionResult,
} from "../src/types.ts";

/**
 * Transform function type
 */
type TransformFunction = (
	result: DimensionResult,
	sections: SectionData[],
) => SectionData[] | Promise<SectionData[]>;

describe("DagEngine - Advanced Transformations", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("test", { result: "ok" });
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should handle multiple transformations in sequence", async () => {
		const mergeTransform: TransformFunction = (
			_result,
			sections,
		): SectionData[] => {
			// Merge every 2 sections into 1
			// Example: ['A', 'B', 'C', 'D'] → ['A-B', 'C-D']
			const merged: SectionData[] = [];
			for (let i = 0; i < sections.length; i += 2) {
				const first = sections[i]?.content ?? "";
				const second = sections[i + 1]?.content ?? "";
				merged.push({
					content: `${first}-${second}`,
					metadata: { merged: true },
				});
			}
			return merged;
		};

		const splitTransform: TransformFunction = (
			_result,
			sections,
		): SectionData[] => {
			// Split each section by '-' separator
			// Example: ['A-B', 'C-D'] → ['A', 'B', 'C', 'D']
			return sections.flatMap((s) =>
				s.content.split("-").map((word) => ({
					content: word,
					metadata: { ...s.metadata, split: true },
				})),
			);
		};

		class MultiTransformPlugin extends Plugin {
			constructor() {
				super("multi-transform", "Multi Transform", "Test");
				this.dimensions = [
					{
						name: "merge_transform",
						scope: "global" as const,
						transform: mergeTransform,
					},
					{
						name: "split_transform",
						scope: "global" as const,
						transform: splitTransform,
					},
					"final_analysis",
				];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new MultiTransformPlugin(),
			registry,
		});

		// Start with 4 sections
		const sections = [
			createMockSection("A"),
			createMockSection("B"),
			createMockSection("C"),
			createMockSection("D"),
		];

		const result = await engine.process(sections);

		// Transformation chain:
		// Step 1: ['A', 'B', 'C', 'D'] (4 sections)
		// Step 2: merge_transform → ['A-B', 'C-D'] (2 sections)
		// Step 3: split_transform → ['A', 'B', 'C', 'D'] (4 sections)
		expect(result.transformedSections).toHaveLength(4);
		expect(result.transformedSections[0]?.content).toBe("A");
		expect(result.transformedSections[1]?.content).toBe("B");
		expect(result.transformedSections[2]?.content).toBe("C");
		expect(result.transformedSections[3]?.content).toBe("D");
	});

	test("should validate transformation return values", async () => {
		class InvalidTransformPlugin extends Plugin {
			constructor() {
				super("invalid", "Invalid", "Test");
				this.dimensions = [
					{
						name: "bad_transform",
						scope: "global" as const,
						transform: (): SectionData[] => {
							// Return null (invalid) - will be caught by engine
							return null as unknown as SectionData[];
						},
					},
					"analysis",
				];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new InvalidTransformPlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Test")]);

		// Should preserve original sections when transform returns invalid value
		expect(result.transformedSections).toHaveLength(1);
		expect(result.transformedSections[0]?.content).toBe("Test");
	});

	test("should handle transformation errors gracefully", async () => {
		class ErrorTransformPlugin extends Plugin {
			constructor() {
				super("error-transform", "Error Transform", "Test");
				this.dimensions = [
					{
						name: "failing_transform",
						scope: "global" as const,
						transform: (): SectionData[] => {
							throw new Error("Transform failed");
						},
					},
					"analysis",
				];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new ErrorTransformPlugin(),
			registry,
			continueOnError: true,
		});

		const result = await engine.process([createMockSection("Test")]);

		// Should preserve original sections on transform error
		expect(result.transformedSections).toHaveLength(1);
		expect(result.transformedSections[0]?.content).toBe("Test");
	});

	test("should preserve metadata during transformation", async () => {
		interface SectionMetadata {
			id?: number;
			tag?: string;
			transformed?: boolean;
			originalLength?: number;
		}

		class MetadataTransformPlugin extends Plugin {
			constructor() {
				super("metadata", "Metadata", "Test");
				this.dimensions = [
					{
						name: "transform",
						scope: "global" as const,
						transform: (_result, sections): SectionData[] => {
							return sections.map((s) => ({
								content: s.content.toUpperCase(),
								metadata: {
									...s.metadata,
									transformed: true,
									originalLength: s.content.length,
								},
							}));
						},
					},
				];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new MetadataTransformPlugin(),
			registry,
		});

		const result = await engine.process([
			createMockSection("test", { id: 1, tag: "important" }),
		]);

		const metadata = result.transformedSections[0]?.metadata as SectionMetadata;
		expect(metadata.id).toBe(1);
		expect(metadata.tag).toBe("important");
		expect(metadata.transformed).toBe(true);
		expect(metadata.originalLength).toBe(4);
	});

	test("should handle transformation that returns empty array", async () => {
		class EmptyTransformPlugin extends Plugin {
			constructor() {
				super("empty", "Empty", "Test");
				this.dimensions = [
					{
						name: "filter_all",
						scope: "global" as const,
						transform: (): SectionData[] => [],
					},
					"analysis",
				];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new EmptyTransformPlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Test")]);

		// Should preserve original sections if transform returns empty
		expect(result.transformedSections).toHaveLength(1);
	});

	test("should handle transformation that increases section count", async () => {
		class ExpandTransformPlugin extends Plugin {
			constructor() {
				super("expand", "Expand", "Test");
				this.dimensions = [
					{
						name: "expand",
						scope: "global" as const,
						transform: (_result, sections): SectionData[] => {
							// Duplicate each section 3 times
							return sections.flatMap((s) => [
								{ ...s },
								{ ...s, metadata: { ...s.metadata, copy: 1 } },
								{ ...s, metadata: { ...s.metadata, copy: 2 } },
							]);
						},
					},
					"analysis",
				];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new ExpandTransformPlugin(),
			registry,
		});

		const result = await engine.process([
			createMockSection("Section 1"),
			createMockSection("Section 2"),
		]);

		// 2 sections × 3 = 6 sections
		expect(result.transformedSections).toHaveLength(6);
		expect(result.sections).toHaveLength(6); // Downstream should process all 6
	});

	test("should handle transformation that splits sections", async () => {
		class SplitTransformPlugin extends Plugin {
			constructor() {
				super("split", "Split", "Test");
				this.dimensions = [
					{
						name: "split",
						scope: "global" as const,
						transform: (_result, sections): SectionData[] => {
							return sections.flatMap((s) =>
								s.content
									.split(".")
									.filter(Boolean)
									.map((sentence) => ({
										content: sentence.trim(),
										metadata: { ...s.metadata, sentence: true },
									})),
							);
						},
					},
					"analysis",
				];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new SplitTransformPlugin(),
			registry,
		});

		const result = await engine.process([
			createMockSection("First sentence. Second sentence. Third sentence"),
		]);

		expect(result.transformedSections).toHaveLength(3);
		expect(result.transformedSections[0]?.content).toBe("First sentence");
		expect(result.transformedSections[1]?.content).toBe("Second sentence");
		expect(result.transformedSections[2]?.content).toBe("Third sentence");
	});

	test("should handle transformation that reorders sections", async () => {
		class ReorderTransformPlugin extends Plugin {
			constructor() {
				super("reorder", "Reorder", "Test");
				this.dimensions = [
					{
						name: "reorder",
						scope: "global" as const,
						transform: (_result, sections): SectionData[] => {
							// Reverse order
							return [...sections].reverse();
						},
					},
					"analysis",
				];
			}

			createPrompt(): string {
				return "test";
			}

			selectProvider() {
				return { provider: "mock-ai", options: {} };
			}
		}

		const engine = new DagEngine({
			plugin: new ReorderTransformPlugin(),
			registry,
		});

		const result = await engine.process([
			createMockSection("First"),
			createMockSection("Second"),
			createMockSection("Third"),
		]);

		expect(result.transformedSections[0]?.content).toBe("Third");
		expect(result.transformedSections[1]?.content).toBe("Second");
		expect(result.transformedSections[2]?.content).toBe("First");
	});
});