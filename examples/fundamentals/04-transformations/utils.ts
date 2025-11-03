export function printPattern(): void {
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("THE PATTERN: Many Items → Few Groups");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("Transformation reduces processing:");
	console.log("  Classify individual items → Group items → Analyze groups");
	console.log("  Result: Fewer expensive analysis calls\n");

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("EXECUTION FLOW");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("Phase 1: CLASSIFY (section, parallel)");
	console.log("  Classify reviews into categories\n");

	console.log("Phase 2: GROUP (global, sequential)");
	console.log("  Group reviews into categories\n");

	console.log("Phase 3: TRANSFORMATION 🔄");
	console.log("  transformSections() called");
	console.log("  Input: Individual review sections");
	console.log("  Output: Category group sections\n");

	console.log("Phase 4: ANALYZE (section, parallel)");
	console.log("  Analyze category groups");
	console.log("  ✅ Processing groups instead of individual reviews!\n");

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}