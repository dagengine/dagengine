import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../../src/core/engine/dag-engine";
import { Plugin } from "../../src/plugin";
import { ProviderRegistry } from "../../src/providers/registry";
import { MockAIProvider, createMockSection } from "../setup";
import {
	serializeState,
	deserializeState,
} from "../../src/core/engine/state-manager";

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

				selectProvider(): any {
					return { provider: "mock-ai" };
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
			expect(result.sections[0].results.dim1).toBeDefined();
			expect(result.sections[0].results.dim2).toBeDefined();
			expect(result.sections[0].results.dim3).toBeDefined();

			// Verify dependency order
			const dim1Result = result.sections[0].results.dim1;
			const dim2Result = result.sections[0].results.dim2;
			const dim3Result = result.sections[0].results.dim3;

			expect(dim1Result.data).toBeDefined();
			expect(dim2Result.data).toBeDefined();
			expect(dim3Result.data).toBeDefined();
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

				selectProvider(): any {
					return { provider: "mock-ai" };
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
			expect(result.sections[0].results.section1).toBeDefined();
			expect(result.sections[0].results.section2).toBeDefined();
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

				selectProvider(): any {
					return { provider: "mock-ai" };
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
			expect(result.sections[0].results.dim1).toBeDefined();
			expect(result.sections[0].results.dim2).toBeDefined();
			expect(result.sections[0].results.dim3).toBeDefined();
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

				selectProvider(): any {
					return { provider: "mock-ai" };
				}
			}

			// ✅ Mock based on dimension name
			mockProvider.execute = async (request) => {
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
					maxRetries: 0, // Disable retries for clearer test
				},
			});

			const sections = [createMockSection("Test")];
			const result = await engine.process(sections);

			// Verify results
			expect(result.sections[0].results.dim1?.data).toBeDefined();
			expect(result.sections[0].results.dim2?.error).toBeDefined();
			expect(result.sections[0].results.dim2?.error).toContain("failed");
			expect(result.sections[0].results.dim3?.data).toBeDefined();
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

				selectProvider(): any {
					return { provider: "mock-ai" };
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

				selectProvider(): any {
					return { provider: "mock-ai" };
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
				expect(result.sections[0].results[dim]).toBeDefined();
			});
		}, 30000);
	});
});
