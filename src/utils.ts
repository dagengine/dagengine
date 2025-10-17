import { jsonrepair } from "jsonrepair";

export function parseJSON(raw: string): unknown {
	// Remove markdown code blocks
	let cleaned = raw
		.trim()
		.replace(/```json\s*/gi, "")
		.replace(/```\s*/g, "");

	// Find the start of JSON (either { or [)
	const startBrace = cleaned.indexOf("{");
	const startBracket = cleaned.indexOf("[");

	let start = -1;
	let openChar = "";
	let closeChar = "";

	// Determine which comes first: object or array
	if (startBrace !== -1 && (startBracket === -1 || startBrace < startBracket)) {
		start = startBrace;
		openChar = "{";
		closeChar = "}";
	} else if (startBracket !== -1) {
		start = startBracket;
		openChar = "[";
		closeChar = "]";
	}

	if (start === -1) {
		throw new Error("No JSON found in input");
	}

	// Extract from the first JSON start
	cleaned = cleaned.substring(start);

	// Find the end of the first complete JSON by counting depth
	let depth = 0;
	let inString = false;
	let escapeNext = false;
	let end = -1;

	for (let i = 0; i < cleaned.length; i++) {
		const char = cleaned[i];

		// Handle string escaping
		if (escapeNext) {
			escapeNext = false;
			continue;
		}

		if (char === "\\") {
			escapeNext = true;
			continue;
		}

		// Handle string boundaries
		if (char === '"') {
			inString = !inString;
			continue;
		}

		// Only count braces/brackets outside of strings
		if (!inString) {
			if (char === openChar) {
				depth++;
			} else if (char === closeChar) {
				depth--;
				if (depth === 0) {
					end = i;
					break;
				}
			}
		}
	}

	if (end !== -1) {
		cleaned = cleaned.substring(0, end + 1);
	}

	try {
		return JSON.parse(cleaned);
	} catch {
		// Try to repair and parse
		const repaired = jsonrepair(cleaned);
		return JSON.parse(repaired);
	}
}
