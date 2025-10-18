import chalk from "chalk";
import boxen from "boxen";
import Table from "cli-table3";
import gradient from "gradient-string";
import ora, { type Ora } from "ora";

/**
 * Generic console UI utilities for beautiful output
 */
export class ConsoleUI {
	/**
	 * Clear console and show gradient header
	 */
	public static showHeader(title: string): void {
		console.clear();

		const paddedTitle = title.padStart(Math.floor((53 + title.length) / 2)).padEnd(53);

		const header = gradient.rainbow.multiline([
			"╔═══════════════════════════════════════════════════════════╗",
			"║                                                           ║",
			`║  ${paddedTitle}`,
			"║                                                           ║",
			"╚═══════════════════════════════════════════════════════════╝",
		].join("\n"));

		console.log("\n" + header + "\n");
	}

	/**
	 * Create a spinner for processing
	 */
	public static spinner(text: string): Ora {
		return ora({
			text: chalk.cyan(text),
			spinner: "dots12",
		}).start();
	}

	/**
	 * Render any value with smart formatting
	 */
	public static renderValue(value: unknown, indent = 0): string {
		const spacing = "  ".repeat(indent);

		// Null/undefined
		if (value === null || value === undefined) {
			return chalk.dim("null");
		}

		// Boolean
		if (typeof value === "boolean") {
			return value ? chalk.green("true") : chalk.red("false");
		}

		// Number
		if (typeof value === "number") {
			return chalk.yellow(String(value));
		}

		// String
		if (typeof value === "string") {
			// If it's a long string, wrap it
			if (value.length > 60) {
				return chalk.white(value);
			}
			return chalk.white(value);
		}

		// Array
		if (Array.isArray(value)) {
			if (value.length === 0) {
				return chalk.dim("[]");
			}

			// Simple array (primitives)
			if (value.every(v => typeof v !== "object" || v === null)) {
				return value.map((item, i) => {
					const colors = [chalk.red, chalk.yellow, chalk.green, chalk.blue, chalk.magenta];
					const color = colors[i % colors.length];
					return `\n${spacing}  ${color?.("▪")} ${this.renderValue(item, 0)}`;
				}).join("");
			}

			// Complex array (objects)
			return value.map((item, i) => {
				return `\n${spacing}  ${chalk.cyan(`[${i}]`)} ${this.renderValue(item, indent + 1)}`;
			}).join("");
		}

		// Object
		if (typeof value === "object") {
			const entries = Object.entries(value);

			if (entries.length === 0) {
				return chalk.dim("{}");
			}

			return entries.map(([key, val]) => {
				return `\n${spacing}  ${chalk.cyan(key)}: ${this.renderValue(val, indent + 1)}`;
			}).join("");
		}

		return String(value);
	}

	/**
	 * Render results as a table - works with any result structure
	 */
	public static renderResults(results: Record<string, unknown>): void {
		const table = new Table({
			head: [
				chalk.bold.cyan("📊 DIMENSION"),
				chalk.bold.cyan("📈 RESULT"),
			],
			colWidths: [25, 60],
			style: {
				head: [],
				border: ["cyan"],
			},
			chars: {
				'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗',
				'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝',
				'left': '║', 'left-mid': '╟', 'mid': '─', 'mid-mid': '┼',
				'right': '║', 'right-mid': '╢', 'middle': '│',
			},
		});

		for (const [dimension, result] of Object.entries(results)) {
			// Add emoji based on dimension name (smart detection)
			let emoji = "📄";
			const dimLower = dimension.toLowerCase();

			if (dimLower.includes("topic")) emoji = "🎯";
			else if (dimLower.includes("sentiment") || dimLower.includes("emotion")) emoji = "💭";
			else if (dimLower.includes("summary") || dimLower.includes("report")) emoji = "📝";
			else if (dimLower.includes("score") || dimLower.includes("rating")) emoji = "⭐";
			else if (dimLower.includes("tag")) emoji = "🏷️";
			else if (dimLower.includes("category")) emoji = "📁";
			else if (dimLower.includes("extract")) emoji = "🔍";
			else if (dimLower.includes("analyze") || dimLower.includes("analysis")) emoji = "🔬";

			const formattedDim = chalk.yellow.bold(`${emoji} ${this.formatDimensionName(dimension)}`);
			const formattedResult = this.renderValue(result);

			table.push([formattedDim, formattedResult]);
		}

		console.log("\n" + table.toString());
	}

	/**
	 * Format dimension name (convert snake_case to Title Case)
	 */
	private static formatDimensionName(name: string): string {
		return name
			.split("_")
			.map(word => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");
	}

	/**
	 * Render a box around text
	 */
	public static renderBox(text: string, color: "cyan" | "green" | "yellow" | "red" = "cyan"): string {
		return boxen(chalk.white(text), {
			padding: 1,
			margin: 0,
			borderStyle: "round",
			borderColor: color,
			dimBorder: true,
		});
	}

	/**
	 * Show performance stats
	 */
	public static showStats(stats: Record<string, string | number>): void {
		console.log("\n" + gradient.pastel("═".repeat(87)));

		const items = Object.entries(stats).map(([key, value]) => {
			// Smart emoji selection
			let emoji = "📊";
			const keyLower = key.toLowerCase();

			if (keyLower.includes("time") || keyLower.includes("duration")) emoji = "⚡";
			else if (keyLower.includes("task") || keyLower.includes("dimension")) emoji = "🔄";
			else if (keyLower.includes("cost") || keyLower.includes("price")) emoji = "💰";
			else if (keyLower.includes("token")) emoji = "🎫";
			else if (keyLower.includes("success")) emoji = "✅";
			else if (keyLower.includes("error") || keyLower.includes("fail")) emoji = "❌";

			return `${emoji} ${chalk.bold(String(value))} ${chalk.dim(key)}`;
		});

		console.log(chalk.dim("\n  " + items.join(chalk.dim("  •  "))));
		console.log("\n" + gradient.pastel("═".repeat(87)) + "\n");
	}

	/**
	 * Show success message with features
	 */
	public static showSuccess(message: string, features?: string[]): void {
		let content = chalk.green.bold("✓ ") + chalk.white(message);

		if (features && features.length > 0) {
			const featureList = features.map(f => chalk.cyan("  • " + f)).join("\n");
			content += "\n\n" + chalk.dim("This example demonstrated:") + "\n" + featureList;
		}

		console.log(
			boxen(content, {
				padding: 1,
				margin: 1,
				borderStyle: "round",
				borderColor: "green",
			})
		);
	}

	/**
	 * Show error message
	 */
	public static showError(error: unknown): void {
		const message = error instanceof Error ? error.message : String(error);

		console.error("\n" + boxen(
			chalk.red.bold("❌ Error\n\n") + chalk.white(message),
			{
				padding: 1,
				margin: 1,
				borderStyle: "round",
				borderColor: "red",
			}
		));
	}

	/**
	 * Show a section header
	 */
	public static showSection(title: string, icon?: string): void {
		const fullTitle = icon ? `${icon}  ${title}` : title;
		console.log("\n" + chalk.bold.cyan(fullTitle));
		console.log(chalk.dim("─".repeat(60)));
	}

	/**
	 * Pretty print any object (for debugging)
	 */
	public static prettyPrint(data: unknown, title?: string): void {
		if (title) {
			this.showSection(title);
		}
		console.log(this.renderValue(data));
	}
}