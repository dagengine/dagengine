import { jsonrepair } from 'jsonrepair';

export function parseJSON(raw: string): unknown {
  // Remove markdown code blocks
  let cleaned = raw.trim()
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '');

  // Extract JSON boundaries
  const start = Math.min(
      cleaned.indexOf('{') !== -1 ? cleaned.indexOf('{') : Infinity,
      cleaned.indexOf('[') !== -1 ? cleaned.indexOf('[') : Infinity
  );

  if (start !== Infinity) {
    cleaned = cleaned.substring(start);
    const end = Math.max(
        cleaned.lastIndexOf('}'),
        cleaned.lastIndexOf(']')
    );
    if (end !== -1) {
      cleaned = cleaned.substring(0, end + 1);
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to repair and parse
    const repaired = jsonrepair(cleaned);
    return JSON.parse(repaired);
  }
}