/**
 * Result display utilities
 */

import type { ProcessResult } from '../../../dist/index';
import type { SmartReviewAnalyzer } from './plugin';
import chalk from 'chalk';
import gradient from 'gradient-string';

export function displayResults(result: ProcessResult, plugin: SmartReviewAnalyzer): void {
	// Header
	console.log('\n' + gradient.rainbow('═'.repeat(70)));
	console.log(chalk.bold.cyan('            📊 SMART REVIEW ANALYZER RESULTS\n'));
	console.log(gradient.rainbow('═'.repeat(70)) + '\n');

	// Executive Summary
	console.log(chalk.bold.cyan('📈 Executive Summary'));
	console.log(chalk.dim('─'.repeat(60)));
	const summary = result.globalResults['executive_summary']?.data as any;
	if (summary) {
		console.log(JSON.stringify(summary, null, 2));
	}

	// Optimization Stats
	console.log(chalk.bold.cyan('\n⚡ Optimization Stats'));
	console.log(chalk.dim('─'.repeat(60)));
	const saved = plugin.stats.skipped + plugin.stats.lowQuality + plugin.stats.cached;
	console.log(`  ${chalk.green('✓')} Saved calls: ${chalk.yellow.bold(saved)}`);
	console.log(`  ${chalk.green('✓')} Cached: ${chalk.yellow.bold(plugin.stats.cached)}`);
	console.log(`  ${chalk.green('✓')} Low quality: ${chalk.yellow.bold(plugin.stats.lowQuality)}`);
	console.log(`  ${chalk.green('✓')} Sentiment filtered: ${chalk.yellow.bold(plugin.stats.skipped)}`);

	// Cost Breakdown
	if (result.costs) {
		console.log(chalk.bold.cyan('\n💰 Cost Breakdown'));
		console.log(chalk.dim('─'.repeat(60)));
		console.log(`  Total: ${chalk.green.bold('$' + result.costs.totalCost.toFixed(4))}\n`);

		Object.entries(result.costs.byDimension)
			.sort(([, a], [, b]) => b.cost - a.cost)
			.forEach(([dim, cost]) => {
				const emoji = getDimensionEmoji(dim);
				console.log(
					`  ${emoji} ${chalk.cyan(dim.padEnd(25))} ` +
					chalk.yellow('$' + cost.cost.toFixed(4))
				);
			});
	}

	// Sentiment Distribution
	const grouping = result.globalResults['group_by_sentiment']?.data as any;
	if (grouping?.summary) {
		console.log(chalk.bold.cyan('\n💭 Sentiment Distribution'));
		console.log(chalk.dim('─'.repeat(60)));

		const total = (grouping.summary.positive_count || 0) +
			(grouping.summary.negative_count || 0) +
			(grouping.summary.neutral_count || 0);

		console.log(`  ${chalk.green('😊')} Positive: ${chalk.bold(grouping.summary.positive_count || 0)} ${chalk.dim(`(${((grouping.summary.positive_count || 0) / total * 100).toFixed(1)}%)`)}`);
		console.log(`  ${chalk.yellow('😐')} Neutral:  ${chalk.bold(grouping.summary.neutral_count || 0)} ${chalk.dim(`(${((grouping.summary.neutral_count || 0) / total * 100).toFixed(1)}%)`)}`);
		console.log(`  ${chalk.red('😞')} Negative: ${chalk.bold(grouping.summary.negative_count || 0)} ${chalk.dim(`(${((grouping.summary.negative_count || 0) / total * 100).toFixed(1)}%)`)}`);
	}

	// Footer
	console.log('\n' + gradient.pastel('═'.repeat(70)));
	console.log(chalk.green.bold('  ✨ Analysis Complete!\n'));
	console.log(gradient.pastel('═'.repeat(70)) + '\n');
}

// Helper function
function getDimensionEmoji(dimension: string): string {
	const dim = dimension.toLowerCase();
	if (dim.includes('quality')) return '✓';
	if (dim.includes('sentiment')) return '💭';
	if (dim.includes('topic')) return '🎯';
	if (dim.includes('group')) return '📊';
	if (dim.includes('deep') || dim.includes('analysis')) return '🔬';
	if (dim.includes('compare')) return '⚖️';
	if (dim.includes('summary')) return '📝';
	return '📄';
}