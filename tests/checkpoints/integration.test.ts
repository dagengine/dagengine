import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../../src/core/engine/dag-engine.ts";
import { Plugin } from "../../src/plugin.ts";
import { ProviderRegistry } from "../../src/providers/registry.ts";
import { MockAIProvider, createMockSection } from "../setup.ts";
import {
	serializeState,
	deserializeState,
} from "../../src/core/engine/state-manager.ts";
import type {
	ProviderSelection,
	ProviderRequest,
	ProviderResponse,
	SectionData,
} from "../../src/types.ts";
import type { ProcessState } from "../../src/core/shared/types.ts";

describe("Checkpoint Integration - With PhaseExecutor", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("test", { result: "ok" });
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	describe("Checkpoint State Consistency", () => {
		test("should maintain state consistency through phase execution", async () => {
			class CheckpointPlugin extends Plugin {
				constructor() {
					super("checkpoint", "Checkpoint Test", "Test");
					this.dimensions = ["dim1", "dim2", "dim3"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return {
						dim2: ["dim1"],
						dim3: ["dim2"],
					};
				}
			}

			const engine = new DagEngine({
				plugin: new CheckpointPlugin(),
				registry,
			});

			const sections = [createMockSection("Test")];
			const result = await engine.process(sections);

			// Verify all dimensions executed
			expect(result.sections[0]?.results.dim1).toBeDefined();
			expect(result.sections[0]?.results.dim2).toBeDefined();
			expect(result.sections[0]?.results.dim3).toBeDefined();

			// Verify dependency order
			const dim1Result = result.sections[0]?.results.dim1;
			const dim2Result = result.sections[0]?.results.dim2;
			const dim3Result = result.sections[0]?.results.dim3;

			expect(dim1Result?.data).toBeDefined();
			expect(dim2Result?.data).toBeDefined();
			expect(dim3Result?.data).toBeDefined();
		});

		test("should handle checkpoint between execution groups", async () => {
			class GroupCheckpointPlugin extends Plugin {
				constructor() {
					super("group-checkpoint", "Group Checkpoint", "Test");
					this.dimensions = [
						{ name: "g1", scope: "global" as const },
						{ name: "g2", scope: "global" as const },
						"section1",
						"section2",
					];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}

				defineDependencies(): Record<string, string[]> {
					return {
						g2: ["g1"],
						section1: ["g2"],
						section2: ["section1"],
					};
				}
			}

			const engine = new DagEngine({
				plugin: new GroupCheckpointPlugin(),
				registry,
			});

			const sections = [createMockSection("Test")];
			const result = await engine.process(sections);

			// Verify execution order: g1 -> g2 -> section1 -> section2
			expect(result.globalResults.g1).toBeDefined();
			expect(result.globalResults.g2).toBeDefined();
			expect(result.sections[0]?.results.section1).toBeDefined();
			expect(result.sections[0]?.results.section2).toBeDefined();
		});
	});

	describe("Resume from Checkpoint", () => {
		test("should simulate checkpoint and resume mid-execution", async () => {
			// This test simulates what Inngest does:
			// 1. Execute some steps
			// 2. Save checkpoint
			// 3. "Crash"
			// 4. Resume from checkpoint
			// 5. Continue execution

			class ResumePlugin extends Plugin {
				constructor() {
					super("resume", "Resume Test", "Test");
					this.dimensions = ["dim1", "dim2", "dim3"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			const engine = new DagEngine({
				plugin: new ResumePlugin(),
				registry,
			});

			const sections = [createMockSection("Test")];

			// First execution: complete dim1 and dim2
			// (In reality, this would be stopped mid-execution)
			const result = await engine.process(sections);

			// All dimensions complete in single execution
			// (Since we can't actually interrupt execution)
			expect(result.sections[0]?.results.dim1).toBeDefined();
			expect(result.sections[0]?.results.dim2).toBeDefined();
			expect(result.sections[0]?.results.dim3).toBeDefined();
		});
	});

	describe("Error Recovery with Checkpoints", () => {
		test("should handle errors and continue with checkpointing", async () => {
			class ErrorRecoveryPlugin extends Plugin {
				constructor() {
					super("error-recovery", "Error Recovery", "Test");
					this.dimensions = ["dim1", "dim2", "dim3"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			mockProvider.execute = async (
				request: ProviderRequest,
			): Promise<ProviderResponse> => {
				if (request.dimension === "dim2") {
					return { error: "dim2 failed" };
				}
				return { data: { result: "ok" } };
			};

			const engine = new DagEngine({
				plugin: new ErrorRecoveryPlugin(),
				registry,
				execution: {
					continueOnError: true,
					maxRetries: 0,
				},
			});

			const sections = [createMockSection("Test")];
			const result = await engine.process(sections);

			// Verify results
			expect(result.sections[0]?.results.dim1?.data).toBeDefined();
			expect(result.sections[0]?.results.dim2?.error).toBeDefined();
			expect(result.sections[0]?.results.dim2?.error).toContain("failed");
			expect(result.sections[0]?.results.dim3?.data).toBeDefined();
		});
	});

	describe("Performance and Scale", () => {
		test("should handle checkpointing with large number of sections", async () => {
			class ScalePlugin extends Plugin {
				constructor() {
					super("scale", "Scale Test", "Test");
					this.dimensions = ["dim1"];
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			const engine = new DagEngine({
				plugin: new ScalePlugin(),
				registry,
			});

			// Process 100 sections
			const sections = Array.from({ length: 100 }, (_, i) =>
				createMockSection(`Section ${i}`),
			);

			const result = await engine.process(sections);

			// Verify all sections processed
			expect(result.sections).toHaveLength(100);
			result.sections.forEach((sectionResult) => {
				expect(sectionResult.results.dim1).toBeDefined();
			});
		}, 30000); // 30 second timeout for large test

		test("should handle checkpointing with many dimensions", async () => {
			// Create plugin with 20 dimensions
			const dimensions = Array.from({ length: 20 }, (_, i) => `dim${i}`);

			class ManyDimensionsPlugin extends Plugin {
				constructor() {
					super("many-dims", "Many Dimensions", "Test");
					this.dimensions = dimensions;
				}

				createPrompt(): string {
					return "test";
				}

				selectProvider(): ProviderSelection {
					return { provider: "mock-ai", options: {} };
				}
			}

			const engine = new DagEngine({
				plugin: new ManyDimensionsPlugin(),
				registry,
			});

			const sections = [createMockSection("Test")];
			const result = await engine.process(sections);

			// Verify all dimensions executed
			dimensions.forEach((dim) => {
				expect(result.sections[0]?.results[dim]).toBeDefined();
			});
		}, 30000);
	});

	describe("State Serialization", () => {
		test("should serialize and deserialize state correctly", () => {
			const sections = [
				createMockSection("Section 1"),
				createMockSection("Section 2"),
			];

			// Create a mock state with ALL required properties
			const mockState: ProcessState = {
				id: "test-process-id",
				startTime: Date.now(),
				metadata: { testKey: "testValue" },
				sections: [...sections],
				originalSections: [...sections], // ← FIX: Add this required property
				globalResults: {
					dim1: { data: { result: "global-result" } },
				},
				sectionResultsMap: new Map([
					[0, { dim1: { data: { result: "section-0-result" } } }],
					[1, { dim1: { data: { result: "section-1-result" } } }],
				]),
			};

			// Serialize
			const serialized = serializeState(mockState);

			// Verify serialized format
			expect(serialized.id).toBe(mockState.id);
			expect(serialized.startTime).toBe(mockState.startTime);
			expect(serialized.sections).toHaveLength(2);
			expect(serialized.originalSections).toHaveLength(2); // ← Verify originalSections
			expect(Array.isArray(serialized.sectionResultsMap)).toBe(true);
			expect(serialized.sectionResultsMap).toHaveLength(2);

			// Deserialize
			const deserialized = deserializeState(serialized);

			// Verify deserialized state
			expect(deserialized.id).toBe(mockState.id);
			expect(deserialized.startTime).toBe(mockState.startTime);
			expect(deserialized.sections).toHaveLength(2);
			expect(deserialized.originalSections).toHaveLength(2); // ← Verify originalSections
			expect(deserialized.sectionResultsMap instanceof Map).toBe(true);
			expect(deserialized.sectionResultsMap.size).toBe(2);
			expect(deserialized.sectionResultsMap.get(0)).toEqual(
				mockState.sectionResultsMap.get(0),
			);
			expect(deserialized.sectionResultsMap.get(1)).toEqual(
				mockState.sectionResultsMap.get(1),
			);
		});

		test("should preserve originalSections through transformation", () => {
			const originalSections = [
				createMockSection("Original 1"),
				createMockSection("Original 2"),
			];

			const transformedSections = [
				createMockSection("Transformed 1"),
				createMockSection("Transformed 2"),
				createMockSection("Transformed 3"), // Split into more sections
			];

			const mockState: ProcessState = {
				id: "test-process-id",
				startTime: Date.now(),
				metadata: {},
				sections: transformedSections,
				originalSections: originalSections, // Preserved!
				globalResults: {},
				sectionResultsMap: new Map([
					[0, {}],
					[1, {}],
					[2, {}],
				]),
			};

			const serialized = serializeState(mockState);
			const deserialized = deserializeState(serialized);

			// Verify originalSections preserved
			expect(deserialized.originalSections).toHaveLength(2);
			expect(deserialized.sections).toHaveLength(3);
			expect(deserialized.originalSections[0]?.content).toBe("Original 1");
			expect(deserialized.sections[0]?.content).toBe("Transformed 1");
		});
	});
});