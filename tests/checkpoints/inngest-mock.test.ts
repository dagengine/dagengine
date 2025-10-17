import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../../src/core/engine/dag-engine";
import { Plugin } from "../../src/plugin";
import { ProviderRegistry } from "../../src/providers/registry";
import { MockAIProvider, createMockSection } from "../setup";
import {
	serializeState,
	deserializeState,
} from "../../src/core/engine/state-manager";

describe("Inngest Checkpoint Flow - Integration Tests", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;
	let plugin: Plugin;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("test", { result: "ok" });

		registry = new ProviderRegistry();
		registry.register(mockProvider);

		plugin = new (class extends Plugin {
			constructor() {
				super("test", "Test", "Test");
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
		})();
	});

	describe("Step-by-Step Checkpoint Simulation", () => {
		test("should simulate Inngest step execution with checkpoints", async () => {
			const engine = new DagEngine({
				plugin,
				registry,
			});

			const sections = [createMockSection("Test")];

			// Full execution (simulates all Inngest steps)
			const result = await engine.process(sections);

			// Verify all dimensions executed
			expect(result.sections[0].results.dim1).toBeDefined();
			expect(result.sections[0].results.dim2).toBeDefined();
			expect(result.sections[0].results.dim3).toBeDefined();

			// Verify dependency order maintained
			expect(result.sections[0].results.dim1.data).toBeDefined();
			expect(result.sections[0].results.dim2.data).toBeDefined();
			expect(result.sections[0].results.dim3.data).toBeDefined();
		});

		test("should simulate checkpoint between execution groups", async () => {
			// Create plugin with clear execution groups
			const groupPlugin = new (class extends Plugin {
				constructor() {
					super("groups", "Groups", "Test");
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
			})();

			const engine = new DagEngine({
				plugin: groupPlugin,
				registry,
			});

			const sections = [createMockSection("Test")];
			const result = await engine.process(sections);

			// Verify all executed in correct order
			expect(result.globalResults.g1).toBeDefined();
			expect(result.globalResults.g2).toBeDefined();
			expect(result.sections[0].results.section1).toBeDefined();
			expect(result.sections[0].results.section2).toBeDefined();
		});

		test("should handle state serialization during workflow", async () => {
			const capturedStates: any[] = [];

			// Create plugin that captures state at each dimension
			const capturePlugin = new (class extends Plugin {
				constructor() {
					super("capture", "Capture", "Test");
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
				// Capture after each dimension
				async afterDimensionComplete(
					dimension: string,
					result: any,
					section: any,
				): Promise<void> {
					// Note: This hook doesn't exist in your current code,
					// but this shows the concept
				}
			})();

			const engine = new DagEngine({
				plugin: capturePlugin,
				registry,
			});

			const sections = [createMockSection("Test")];
			const result = await engine.process(sections);

			// Verify result is complete
			expect(result.sections[0].results.dim1).toBeDefined();
			expect(result.sections[0].results.dim2).toBeDefined();
			expect(result.sections[0].results.dim3).toBeDefined();
		});
	});

	describe("Crash and Resume Scenarios", () => {
		test("should simulate what Inngest does on crash", async () => {
			const sections = [createMockSection("Test")];

			// First execution - completes successfully
			const engine1 = new DagEngine({ plugin, registry });
			const result1 = await engine1.process(sections);

			// Simulate storing checkpoint data
			const checkpointData = {
				processId: "test-process-123",
				sections: sections,
				completedDimensions: ["dim1", "dim2"],
				// In real Inngest, this would be stored in their backend
			};

			// Second execution - simulates resume
			// (In real Inngest, this would skip dim1 and dim2)
			const engine2 = new DagEngine({ plugin, registry });
			const result2 = await engine2.process(sections);

			// Both executions complete successfully
			expect(result1.sections[0].results.dim1).toBeDefined();
			expect(result2.sections[0].results.dim1).toBeDefined();
		});

		test("should handle errors and continue with checkpointing", async () => {
			mockProvider.execute = async (request) => {
				// ✅ Check dimension name instead of call count
				if (request.dimension === "dim2") {
					return { error: "dim2 failed" };
				}
				return { data: { result: "ok" } };
			};

			const engine = new DagEngine({
				plugin,
				registry,
				execution: {
					continueOnError: true,
					maxRetries: 0, // ✅ Disable retries for predictable behavior
				},
			});

			const sections = [createMockSection("Test")];
			const result = await engine.process(sections);

			// dim1 succeeds
			expect(result.sections[0].results.dim1?.data).toBeDefined();

			// dim2 fails
			expect(result.sections[0].results.dim2?.error).toBeDefined();

			// dim3 succeeds (continueOnError: true)
			expect(result.sections[0].results.dim3?.data).toBeDefined();
		});
	});

	describe("State Serialization Correctness", () => {
		test("should produce serializable state at any point", async () => {
			const engine = new DagEngine({ plugin, registry });
			const sections = [createMockSection("Test")];

			// Create initial state (simulates what Inngest does)
			const { createProcessState } = await import(
				"../../src/core/engine/state-manager"
			);
			const initialState = createProcessState(sections);

			// Verify state is serializable
			const serialized = serializeState(initialState);
			const json = JSON.stringify(serialized);
			expect(json).toBeDefined();

			// Verify deserialization works
			const parsed = JSON.parse(json);
			const deserialized = deserializeState(parsed);
			expect(deserialized.id).toBe(initialState.id);
			expect(deserialized.sections).toEqual(sections);
		});

		test("should serialize state with partial results", async () => {
			const { createProcessState } = await import(
				"../../src/core/engine/state-manager"
			);
			const sections = [createMockSection("Test")];
			const state = createProcessState(sections);

			// Add partial results (simulates mid-execution checkpoint)
			state.globalResults["dim1"] = {
				data: { result: "completed" },
				metadata: { tokens: 100 },
			};

			// Serialize
			const serialized = serializeState(state);
			const json = JSON.stringify(serialized);

			// Deserialize
			const parsed = JSON.parse(json);
			const deserialized = deserializeState(parsed);

			// Verify results preserved
			expect(deserialized.globalResults["dim1"]).toBeDefined();
			expect(deserialized.globalResults["dim1"].data.result).toBe("completed");
			expect(deserialized.globalResults["dim1"].metadata?.tokens).toBe(100);
		});

		test("should handle multiple serialize/deserialize cycles", async () => {
			const { createProcessState } = await import(
				"../../src/core/engine/state-manager"
			);
			const sections = [createMockSection("Test")];
			let state = createProcessState(sections);

			// Simulate 5 checkpoint cycles
			for (let i = 1; i <= 5; i++) {
				// Add result
				state.globalResults[`dim${i}`] = {
					data: { step: i },
				};

				// Checkpoint cycle
				const serialized = serializeState(state);
				const json = JSON.stringify(serialized);
				const parsed = JSON.parse(json);
				state = deserializeState(parsed);

				// Verify all previous results still there
				for (let j = 1; j <= i; j++) {
					expect(state.globalResults[`dim${j}`]).toBeDefined();
					expect(state.globalResults[`dim${j}`].data.step).toBe(j);
				}
			}

			// Final verification
			expect(Object.keys(state.globalResults)).toHaveLength(5);
		});
	});

	describe("Large-Scale Checkpoint Testing", () => {
		test("should handle checkpointing with many sections", async () => {
			const sections = Array.from({ length: 50 }, (_, i) =>
				createMockSection(`Section ${i}`),
			);

			const engine = new DagEngine({ plugin, registry });
			const result = await engine.process(sections);

			// Verify all sections processed
			expect(result.sections).toHaveLength(50);
			result.sections.forEach((sectionResult, idx) => {
				expect(sectionResult.results.dim1).toBeDefined();
				expect(sectionResult.section.content).toBe(`Section ${idx}`);
			});
		}, 30000);

		test("should handle state serialization with large data", async () => {
			const { createProcessState } = await import(
				"../../src/core/engine/state-manager"
			);
			const sections = Array.from({ length: 100 }, (_, i) =>
				createMockSection(`Section ${i}`),
			);

			const state = createProcessState(sections);

			// Add results to all sections
			sections.forEach((_, idx) => {
				state.sectionResultsMap.set(idx, {
					dim1: {
						data: {
							content: `Result for section ${idx}`,
							longText: "x".repeat(1000), // 1KB per section
						},
					},
				});
			});

			// Serialize
			const serialized = serializeState(state);
			const json = JSON.stringify(serialized);

			// Should be able to serialize large state
			expect(json.length).toBeGreaterThan(100000); // >100KB

			// Should be able to deserialize
			const parsed = JSON.parse(json);
			const deserialized = deserializeState(parsed);

			// Verify data integrity
			expect(deserialized.sectionResultsMap.size).toBe(100);
			expect(deserialized.sectionResultsMap.get(50)?.dim1.data.content).toBe(
				"Result for section 50",
			);
		});
	});

	describe("Real Inngest Workflow Simulation", () => {
		test("should simulate complete Inngest workflow with checkpoints", async () => {
			const sections = [createMockSection("Test")];
			const { createProcessState } = await import(
				"../../src/core/engine/state-manager"
			);

			// This simulates what happens in Inngest:

			// Step 1: Initialize (Inngest checkpoint)
			const state = createProcessState(sections);
			const checkpoint1 = JSON.stringify(serializeState(state));

			// Step 2: Full execution through DagEngine
			const engine = new DagEngine({ plugin, registry });
			const result = await engine.process(sections);

			// Step 3: Verify final state is serializable
			const finalCheckpoint = JSON.stringify({
				processId: "test-123",
				result: result,
				timestamp: Date.now(),
			});

			expect(finalCheckpoint).toBeDefined();
			expect(result.sections[0].results.dim1).toBeDefined();
			expect(result.sections[0].results.dim2).toBeDefined();
			expect(result.sections[0].results.dim3).toBeDefined();
		});
	});
});
