import type { ProgressUpdate } from "../../types";

/**
 * CLI Progress bar instance type
 */
interface CliProgressBar {
	start(
		total: number,
		startValue: number,
		payload?: Record<string, unknown>,
	): void;
	update(current: number, payload?: Record<string, unknown>): void;
	stop(): void;
	readonly isActive: boolean;
}

/**
 * CLI Progress MultiBar instance type
 */
interface CliProgressMultiBar {
	create(
		total: number,
		startValue: number,
		payload?: Record<string, unknown>,
	): CliProgressBar;
	stop(): void;
}

/**
 * CLI Progress constructor options
 */
interface CliProgressOptions {
	format?: string;
	barCompleteChar?: string;
	barIncompleteChar?: string;
	hideCursor?: boolean;
	clearOnComplete?: boolean;
}

/**
 * CLI Progress module interface
 */
interface CliProgressModule {
	SingleBar: new (options: CliProgressOptions) => CliProgressBar;
	MultiBar: new (options: CliProgressOptions) => CliProgressMultiBar;
}

/**
 * Check if CLI progress is available
 */
function hasCliProgress(): boolean {
	try {
		require.resolve("cli-progress");
		return true;
	} catch {
		return false;
	}
}

/**
 * Safely require cli-progress
 */
function requireCliProgress(): CliProgressModule | undefined {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		return require("cli-progress") as CliProgressModule;
	} catch {
		return undefined;
	}
}

/**
 * Progress display options
 */
export interface ProgressDisplayOptions {
	/**
	 * Display style
	 * - 'simple': Single line output (no dependencies)
	 * - 'bar': Single progress bar (requires cli-progress)
	 * - 'multi': Multiple bars per dimension (requires cli-progress)
	 * - 'none': No display
	 *
	 * @default 'bar'
	 */
	display?: "simple" | "bar" | "multi" | "none";

	/**
	 * Custom format for progress bar
	 *
	 * Available tokens:
	 * - {bar}: Progress bar
	 * - {percentage}: Percentage complete
	 * - {value}: Current value
	 * - {total}: Total value
	 * - {cost}: Current cost
	 * - {eta}: Estimated time remaining
	 * - {dimension}: Current dimension (for multi-bar)
	 */
	format?: string;

	/**
	 * Show dimension information
	 * @default true
	 */
	showDimensions?: boolean;

	/**
	 * Update frequency (throttle updates - milliseconds)
	 * @default 100
	 */
	throttleMs?: number;
}

/**
 * Progress display manager
 */
export class ProgressDisplay {
	private readonly display: "simple" | "bar" | "multi" | "none";
	private readonly showDimensions: boolean;
	private readonly throttleMs: number;
	private bar?: CliProgressBar;
	private multibar?: CliProgressMultiBar;
	private readonly dimensionBars = new Map<string, CliProgressBar>();
	private lastUpdate = 0;

	constructor(options: ProgressDisplayOptions = {}) {
		this.display = options.display ?? "bar";
		this.showDimensions = options.showDimensions ?? true;
		this.throttleMs = options.throttleMs ?? 100;

		// Check if cli-progress is available
		if (
			(this.display === "bar" || this.display === "multi") &&
			!hasCliProgress()
		) {
			console.warn(
				"cli-progress not installed. Install with: npm install cli-progress\n" +
					"Falling back to simple display.",
			);
			this.display = "simple";
		}

		// Initialize display
		if (this.display === "bar") {
			this.initSingleBar(options.format);
		} else if (this.display === "multi") {
			this.initMultiBar(options.format);
		}
	}

	/**
	 * Update display with progress
	 */
	update(progress: ProgressUpdate): void {
		// Throttle updates
		const now = Date.now();
		if (now - this.lastUpdate < this.throttleMs) {
			return;
		}
		this.lastUpdate = now;

		switch (this.display) {
			case "simple":
				this.updateSimple(progress);
				break;
			case "bar":
				this.updateBar(progress);
				break;
			case "multi":
				this.updateMultiBar(progress);
				break;
			case "none":
				// No display
				break;
		}
	}

	/**
	 * Stop display
	 */
	stop(): void {
		if (this.bar) {
			this.bar.stop();
		}
		if (this.multibar) {
			this.multibar.stop();
		}
		if (this.display === "simple") {
			process.stdout.write("\n");
		}
	}

	// ============================================================================
	// PRIVATE: Initialize Displays
	// ============================================================================

	private initSingleBar(format?: string): void {
		const cliProgress = requireCliProgress();
		if (!cliProgress) return;

		this.bar = new cliProgress.SingleBar({
			format:
				format ??
				"Progress |{bar}| {percentage}% | {value}/{total} | ${cost} | ETA: {eta}s",
			barCompleteChar: "\u2588",
			barIncompleteChar: "\u2591",
			hideCursor: true,
		});
	}

	private initMultiBar(format?: string): void {
		const cliProgress = requireCliProgress();
		if (!cliProgress) return;

		this.multibar = new cliProgress.MultiBar({
			clearOnComplete: false,
			hideCursor: true,
			format:
				format ?? "{dimension} |{bar}| {percentage}% | ${cost} | ETA: {eta}s",
		});
	}

	// ============================================================================
	// PRIVATE: Update Displays
	// ============================================================================

	private updateSimple(progress: ProgressUpdate): void {
		let output = `\r${progress.percent.toFixed(1)}% | `;
		output += `${progress.completed}/${progress.total} | `;
		output += `$${progress.cost} | `;
		output += `ETA: ${progress.etaSeconds}s`;

		if (this.showDimensions && progress.currentDimension) {
			output += ` | ${progress.currentDimension}`;
		}

		// Clear to end of line
		output += "    ";

		process.stdout.write(output);
	}

	private updateBar(progress: ProgressUpdate): void {
		if (!this.bar) return;

		if (!this.bar.isActive) {
			this.bar.start(progress.total, 0);
		}

		this.bar.update(progress.completed, {
			cost: progress.cost,
			eta: progress.etaSeconds.toString(),
		});
	}

	private updateMultiBar(progress: ProgressUpdate): void {
		if (!this.multibar) return;

		for (const [name, stats] of Object.entries(progress.dimensions)) {
			let bar = this.dimensionBars.get(name);

			if (!bar && stats.completed > 0) {
				// Create bar when dimension starts
				bar = this.multibar.create(stats.total, 0, {
					dimension: name.padEnd(15),
					percentage: "0.0",
					cost: "0.00",
					eta: "?",
				});
				this.dimensionBars.set(name, bar);
			}

			if (bar) {
				bar.update(stats.completed, {
					dimension: name.padEnd(15),
					percentage: stats.percent.toFixed(1),
					cost: stats.cost,
					eta: stats.etaSeconds.toString(),
				});
			}
		}
	}
}
