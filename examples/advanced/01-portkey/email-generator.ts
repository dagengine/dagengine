/**
 * Email Generator Utility
 *
 * Generates realistic test emails for parallel processing demos
 */

import type { SectionData } from "../../../src";

interface EmailTemplate {
	type: string;
	weight: number;
	templates: string[];
	domain: string;
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
	{
		type: "work",
		weight: 0.40,
		domain: "@company.com",
		templates: [
			"Hi team, please review the Q{quarter} budget proposal. Deadline is Friday.",
			"Meeting scheduled for {day} at {time} to discuss the {project} roadmap.",
			"Can you send me the latest {metric} figures for the board meeting?",
			"Action required: Please approve the {document} by EOD {day}.",
			"Reminder: {project} milestone due on {day}. Current status?",
		]
	},
	{
		type: "spam",
		weight: 0.30,
		domain: "@spam.com",
		templates: [
			"URGENT!!! Click here to claim your ${amount} prize NOW!!!",
			"You've inherited ${amount} million! Reply with your bank details.",
			"Congratulations! You've won a FREE {item}! Click to claim!!!",
			"AMAZING OFFER: Get {item} for ${amount}! Limited time!!!",
			"Make ${amount}/day working from home! No experience needed!!!",
		]
	},
	{
		type: "newsletter",
		weight: 0.20,
		domain: "@newsletter.com",
		templates: [
			"Weekly digest: Top {number} {topic} trends you need to know",
			"Your {service} monthly report is ready to view",
			"{Company} Newsletter: {topic} updates and industry insights",
			"New features available in {product} - check them out!",
		]
	},
	{
		type: "personal",
		weight: 0.10,
		domain: "@gmail.com",
		templates: [
			"Hey! Want to grab coffee on {day}? Haven't seen you in ages!",
			"Happy birthday! Hope you have an amazing day! 🎂",
			"Can you help me with {topic}? You're the expert!",
			"Thanks for the {item}! Really appreciate it.",
		]
	}
];

const REPLACEMENTS: Record<string, string[]> = {
	quarter: ["Q1", "Q2", "Q3", "Q4"],
	day: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
	time: ["10am", "2pm", "3pm", "4pm"],
	project: ["Phoenix", "Atlas", "Nexus", "Horizon"],
	metric: ["sales", "revenue", "engagement", "conversion"],
	topic: ["AI", "cloud", "security", "performance"],
	document: ["proposal", "report", "analysis", "budget"],
	amount: ["1000", "5000", "10000"],
	item: ["iPhone", "laptop", "vacation"],
	service: ["Netflix", "Spotify", "email"],
	product: ["app", "tool", "platform"],
	number: ["5", "10", "7"],
	Company: ["TechCorp", "DataFlow", "CloudNine"],
};

/**
 * Replace template placeholders with random values
 */
function interpolateTemplate(text: string): string {
	return text.replace(/\{(\w+)\}/g, (_, key) => {
		const options = REPLACEMENTS[key];
		return options ? options[Math.floor(Math.random() * options.length)]! : key;
	});
}

/**
 * Select email type based on weighted distribution
 */
function selectEmailType(): EmailTemplate {
	const rand = Math.random();
	let cumulative = 0;

	for (const template of EMAIL_TEMPLATES) {
		cumulative += template.weight;
		if (rand <= cumulative) {
			return template;
		}
	}

	return EMAIL_TEMPLATES[0]!;
}

/**
 * Generate realistic test emails
 *
 * @param count Number of emails to generate (default: 100)
 * @returns Array of email sections with metadata
 *
 * @example
 * ```typescript
 * const emails = generateEmails(100);
 * console.log(emails.length); // 100
 * console.log(emails[0].content); // "Hi team, please review the Q2 budget proposal..."
 * ```
 */
export function generateEmails(count: number = 100): SectionData[] {
	const emails: SectionData[] = [];

	for (let i = 0; i < count; i++) {
		const emailType = selectEmailType();
		const template = emailType.templates[
			Math.floor(Math.random() * emailType.templates.length)
			]!;
		const content = interpolateTemplate(template);

		emails.push({
			content,
			metadata: {
				id: `email-${i + 1}`,
				from: `user${i}${emailType.domain}`,
				actualType: emailType.type
			}
		});
	}

	return emails;
}

/**
 * Get distribution statistics for generated emails
 *
 * @param emails Array of generated emails
 * @returns Distribution by type with counts and percentages
 *
 * @example
 * ```typescript
 * const emails = generateEmails(100);
 * const stats = getEmailDistribution(emails);
 * console.log(stats); // { work: 40, spam: 30, newsletter: 20, personal: 10 }
 * ```
 */
export function getEmailDistribution(emails: SectionData[]): Record<string, number> {
	return emails.reduce((acc, email) => {
		const type = (email.metadata.actualType as string) || "unknown";
		acc[type] = (acc[type] || 0) + 1;
		return acc;
	}, {} as Record<string, number>);
}

/**
 * Display email distribution statistics
 *
 * @param emails Array of generated emails
 */
export function displayEmailStats(emails: SectionData[]): void {
	const distribution = getEmailDistribution(emails);
	const total = emails.length;

	console.log("   Email types:");
	Object.entries(distribution).forEach(([type, count]) => {
		const pct = ((count / total) * 100).toFixed(0);
		console.log(`     - ${type}: ${count} (${pct}%)`);
	});
}