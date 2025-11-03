import { describe, test, expect } from "vitest";
import { parseJSON } from "../src/utils.ts";

/**
 * Type guard to check if result is an object with a specific property
 */
function hasProperty<T extends string>(
	obj: unknown,
	prop: T,
): obj is Record<T, unknown> {
	return typeof obj === "object" && obj !== null && prop in obj;
}

describe("Utils - parseJSON Extended", () => {
	test("should handle nested markdown blocks", () => {
		const input = '```json\n```json\n{"nested": true}\n```\n```';
		const result = parseJSON(input);
		expect(result).toEqual({ nested: true });
	});

	test("should handle multiple JSON objects in text", () => {
		const input = 'First: {"a": 1} Second: {"b": 2}';
		const result = parseJSON(input);
		// Should extract the first valid JSON
		expect(hasProperty(result, "a")).toBe(true);
	});

	test("should handle JSON with escaped characters", () => {
		const input = '{"text": "Line 1\\nLine 2\\tTabbed"}';
		const result = parseJSON(input);

		if (hasProperty(result, "text")) {
			expect(result.text).toBe("Line 1\nLine 2\tTabbed");
		} else {
			throw new Error("Expected text property");
		}
	});

	test("should handle very large JSON objects", () => {
		const largeObject: Record<string, string> = {};
		for (let i = 0; i < 1000; i++) {
			largeObject[`key${i}`] = `value${i}`;
		}
		const input = JSON.stringify(largeObject);
		const result = parseJSON(input);

		expect(typeof result === "object" && result !== null).toBe(true);
		expect(Object.keys(result as object)).toHaveLength(1000);
	});

	test("should handle JSON with comments (via repair)", () => {
		const input = `{
      // This is a comment
      "key": "value"
    }`;
		const result = parseJSON(input);
		expect(result).toEqual({ key: "value" });
	});

	test("should handle trailing commas (via repair)", () => {
		const input = '{"a": 1, "b": 2,}';
		const result = parseJSON(input);
		expect(result).toEqual({ a: 1, b: 2 });
	});

	test("should handle single quotes (via repair)", () => {
		const input = "{'key': 'value'}";
		const result = parseJSON(input);
		expect(result).toEqual({ key: "value" });
	});

	test("should handle unquoted keys (via repair)", () => {
		const input = '{key: "value"}';
		const result = parseJSON(input);
		expect(result).toEqual({ key: "value" });
	});

	test("should handle empty string input", () => {
		expect(() => parseJSON("")).toThrow();
	});

	test("should handle JSON with Unicode", () => {
		const input = '{"emoji": "🎉", "chinese": "你好"}';
		const result = parseJSON(input);

		if (hasProperty(result, "emoji") && hasProperty(result, "chinese")) {
			expect(result.emoji).toBe("🎉");
			expect(result.chinese).toBe("你好");
		} else {
			throw new Error("Expected emoji and chinese properties");
		}
	});

	test("should extract JSON from markdown response", () => {
		const input = `Here is your result:
    
\`\`\`json
{
  "status": "success",
  "data": [1, 2, 3]
}
\`\`\`

That's all!`;
		const result = parseJSON(input);

		if (hasProperty(result, "status") && hasProperty(result, "data")) {
			expect(result.status).toBe("success");
			expect(result.data).toEqual([1, 2, 3]);
		} else {
			throw new Error("Expected status and data properties");
		}
	});

	test("should handle JSON with nested objects", () => {
		const input = '{"level1": {"level2": {"level3": "value"}}}';
		const result = parseJSON(input) as {
			level1: { level2: { level3: string } };
		};
		expect(result.level1.level2.level3).toBe("value");
	});

	test("should handle JSON with nested arrays", () => {
		const input = '{"arrays": [[1, 2], [3, 4], [5, 6]]}';
		const result = parseJSON(input) as { arrays: number[][] };
		expect(result.arrays).toEqual([
			[1, 2],
			[3, 4],
			[5, 6],
		]);
	});

	test("should handle JSON with boolean values", () => {
		const input = '{"true_val": true, "false_val": false}';
		const result = parseJSON(input) as {
			true_val: boolean;
			false_val: boolean;
		};
		expect(result.true_val).toBe(true);
		expect(result.false_val).toBe(false);
	});

	test("should handle JSON with null values", () => {
		const input = '{"null_val": null}';
		const result = parseJSON(input) as { null_val: null };
		expect(result.null_val).toBeNull();
	});

	test("should handle JSON with number values", () => {
		const input = '{"int": 42, "float": 3.14, "negative": -10}';
		const result = parseJSON(input) as {
			int: number;
			float: number;
			negative: number;
		};
		expect(result.int).toBe(42);
		expect(result.float).toBe(3.14);
		expect(result.negative).toBe(-10);
	});

	test("should handle array at root level", () => {
		const input = "[1, 2, 3, 4, 5]";
		const result = parseJSON(input);
		expect(result).toEqual([1, 2, 3, 4, 5]);
	});

	test("should handle array with objects", () => {
		const input = '[{"id": 1}, {"id": 2}, {"id": 3}]';
		const result = parseJSON(input) as Array<{ id: number }>;
		expect(result).toHaveLength(3);
		expect(result[0]?.id).toBe(1);
	});

	test("should handle mixed content before JSON", () => {
		const input = 'Some text before {"key": "value"}';
		const result = parseJSON(input);
		expect(result).toEqual({ key: "value" });
	});

	test("should handle mixed content after JSON", () => {
		const input = '{"key": "value"} some text after';
		const result = parseJSON(input);
		expect(result).toEqual({ key: "value" });
	});

	test("should handle JSON with special characters in values", () => {
		const input = '{"special": "!@#$%^&*()_+-=[]{}|;:,.<>?"}';
		const result = parseJSON(input) as { special: string };
		expect(result.special).toBe("!@#$%^&*()_+-=[]{}|;:,.<>?");
	});

	test("should handle JSON with line breaks in strings", () => {
		const input = '{"multiline": "Line 1\\nLine 2\\nLine 3"}';
		const result = parseJSON(input) as { multiline: string };
		expect(result.multiline).toBe("Line 1\nLine 2\nLine 3");
	});

	test("should handle empty object", () => {
		const input = "{}";
		const result = parseJSON(input);
		expect(result).toEqual({});
	});

	test("should handle empty array", () => {
		const input = "[]";
		const result = parseJSON(input);
		expect(result).toEqual([]);
	});

	test("should handle JSON with whitespace", () => {
		const input = `
    {
      "key1"  :  "value1"  ,
      "key2"  :  "value2"
    }
    `;
		const result = parseJSON(input);
		expect(result).toEqual({ key1: "value1", key2: "value2" });
	});

	test("should handle JSON in backticks without language", () => {
		const input = '```\n{"key": "value"}\n```';
		const result = parseJSON(input);
		expect(result).toEqual({ key: "value" });
	});

	test("should handle multiple backtick blocks", () => {
		const input = '```\nignore this\n```\n```json\n{"key": "value"}\n```';
		const result = parseJSON(input);
		expect(result).toEqual({ key: "value" });
	});

	test("should handle JSON with scientific notation", () => {
		const input = '{"sci": 1.5e10, "sci2": 2.3e-5}';
		const result = parseJSON(input) as { sci: number; sci2: number };
		expect(result.sci).toBe(1.5e10);
		expect(result.sci2).toBe(2.3e-5);
	});

	test("should handle deeply nested JSON", () => {
		const input = '{"a":{"b":{"c":{"d":{"e":{"f":"deep"}}}}}}';
		const result = parseJSON(input) as {
			a: { b: { c: { d: { e: { f: string } } } } };
		};
		expect(result.a.b.c.d.e.f).toBe("deep");
	});

	test("should prioritize first JSON object when multiple exist", () => {
		const input = '{"first": 1} random text {"second": 2}';
		const result = parseJSON(input);

		if (hasProperty(result, "first")) {
			expect(result.first).toBe(1);
		} else {
			throw new Error("Expected first property");
		}

		expect(hasProperty(result, "second")).toBe(false);
	});
});

describe("Edge Cases - Complete Coverage", () => {
	test("should handle escaped backslash in string", () => {
		const input = '{"path": "C:\\\\Users\\\\file.txt"}';
		const result = parseJSON(input) as { path: string };
		expect(result.path).toBe("C:\\Users\\file.txt");
	});

	test("should handle escaped quote in string", () => {
		const input = '{"quote": "He said \\"Hello\\""}';
		const result = parseJSON(input) as { quote: string };
		expect(result.quote).toBe('He said "Hello"');
	});

	test("should handle multiple escaped characters in sequence", () => {
		const input = '{"text": "Line\\n\\t\\r\\"Quote\\""}';
		const result = parseJSON(input) as { text: string };
		expect(result.text).toBe('Line\n\t\r"Quote"');
	});

	test("should handle JSON with quotes inside strings", () => {
		const input = '{"message": "She said: \\"Stop!\\""}';
		const result = parseJSON(input) as { message: string };
		expect(result.message).toBe('She said: "Stop!"');
	});

	test("should extract first complete JSON object when multiple exist", () => {
		const input = '{"first": {"nested": true}} {"second": false}';
		const result = parseJSON(input);
		expect(result).toEqual({ first: { nested: true } });
	});

	test("should extract first complete JSON array when multiple exist", () => {
		const input = '[1, 2, 3] [4, 5, 6]';
		const result = parseJSON(input);
		expect(result).toEqual([1, 2, 3]);
	});

	test("should handle object with nested arrays and closing braces", () => {
		const input = '{"data": [[1, 2], [3, 4]]}';
		const result = parseJSON(input) as { data: number[][] };
		expect(result.data).toEqual([[1, 2], [3, 4]]);
	});

	test("should handle array with nested objects and closing brackets", () => {
		const input = '[{"id": 1}, {"id": 2}]';
		const result = parseJSON(input) as Array<{ id: number }>;
		expect(result).toEqual([{ id: 1 }, { id: 2 }]);
	});

	test("should handle incomplete JSON (jsonrepair fixes it)", () => {
		const input = '{"key": "value"';
		const result = parseJSON(input);
		expect(result).toEqual({ key: "value" });
	});

	test("should handle incomplete array (jsonrepair fixes it)", () => {
		const input = '[1, 2, 3';
		const result = parseJSON(input);
		expect(result).toEqual([1, 2, 3]);
	});

	test("should handle nested objects with strings containing braces", () => {
		const input = '{"msg": "text with { and } chars", "nested": {"val": 1}}';
		const result = parseJSON(input) as { msg: string; nested: { val: number } };
		expect(result.msg).toBe("text with { and } chars");
		expect(result.nested.val).toBe(1);
	});

	test("should handle nested arrays with strings containing brackets", () => {
		const input = '["text with [ and ] chars", ["nested"]]';
		const result = parseJSON(input) as [string, string[]];
		expect(result[0]).toBe("text with [ and ] chars");
		expect(result[1]).toEqual(["nested"]);
	});

	test("should stop at first complete JSON object", () => {
		const input = '{"complete": true} extra text {"another": true}';
		const result = parseJSON(input);
		expect(result).toEqual({ complete: true });
	});

	test("should stop at first complete JSON array", () => {
		const input = '[1, 2, 3] extra text [4, 5, 6]';
		const result = parseJSON(input);
		expect(result).toEqual([1, 2, 3]);
	});

	test("should handle malformed JSON that jsonrepair can fix", () => {
		const input = "{key: 'value'}";
		const result = parseJSON(input);
		expect(result).toEqual({ key: "value" });
	});

	test("should handle object followed by closing brackets in text", () => {
		const input = '{"data": [1, 2]} ] } extra';
		const result = parseJSON(input);
		expect(result).toEqual({ data: [1, 2] });
	});

	test("should handle array followed by closing braces in text", () => {
		const input = '[{"id": 1}] } } extra';
		const result = parseJSON(input);
		expect(result).toEqual([{ id: 1 }]);
	});

	test("should handle whitespace before JSON", () => {
		const input = '   \n\t  {"key": "value"}';
		const result = parseJSON(input);
		expect(result).toEqual({ key: "value" });
	});

	test("should handle markdown with extra backticks", () => {
		const input = '```json```\n{"key": "value"}\n```';
		const result = parseJSON(input);
		expect(result).toEqual({ key: "value" });
	});

	test("should handle case-insensitive markdown json tag", () => {
		const input = '```JSON\n{"key": "value"}\n```';
		const result = parseJSON(input);
		expect(result).toEqual({ key: "value" });
	});

	test("should handle mixed case markdown json tag", () => {
		const input = '```JsOn\n{"key": "value"}\n```';
		const result = parseJSON(input);
		expect(result).toEqual({ key: "value" });
	});

	test("should handle deeply nested mixed structures", () => {
		const input = '{"a": [{"b": {"c": [1, 2, {"d": "deep"}]}}]}';
		const result = parseJSON(input) as {
			a: Array<{ b: { c: Array<number | { d: string }> } }>;
		};
		expect(result.a[0]?.b.c[2]).toEqual({ d: "deep" });
	});

	test("should handle string with only escaped characters", () => {
		const input = '{"text": "\\n\\t\\r"}';
		const result = parseJSON(input) as { text: string };
		expect(result.text).toBe("\n\t\r");
	});

	test("should handle consecutive escaped quotes", () => {
		const input = '{"quotes": "\\"\\"\\""}';
		const result = parseJSON(input) as { quotes: string };
		expect(result.quotes).toBe('"""');
	});

	test("should handle backslash at end of string", () => {
		const input = '{"path": "C:\\\\"}';
		const result = parseJSON(input) as { path: string };
		expect(result.path).toBe("C:\\");
	});

	test("should handle object with no spaces", () => {
		const input = '{"a":1,"b":2,"c":3}';
		const result = parseJSON(input);
		expect(result).toEqual({ a: 1, b: 2, c: 3 });
	});

	test("should handle array with no spaces", () => {
		const input = '[1,2,3,4,5]';
		const result = parseJSON(input);
		expect(result).toEqual([1, 2, 3, 4, 5]);
	});

	test("should handle text before array start", () => {
		const input = 'prefix text [1, 2, 3]';
		const result = parseJSON(input);
		expect(result).toEqual([1, 2, 3]);
	});

	test("should handle text before object start", () => {
		const input = 'prefix text {"key": "value"}';
		const result = parseJSON(input);
		expect(result).toEqual({ key: "value" });
	});

	test("should prioritize object over array when object comes first", () => {
		const input = '{"obj": true} [1, 2, 3]';
		const result = parseJSON(input);
		expect(result).toEqual({ obj: true });
	});

	test("should prioritize array over object when array comes first", () => {
		const input = '[1, 2, 3] {"obj": true}';
		const result = parseJSON(input);
		expect(result).toEqual([1, 2, 3]);
	});

	test("should handle multiple levels of nested quotes", () => {
		const input = '{"outer": "value with \\"inner quotes\\" here"}';
		const result = parseJSON(input) as { outer: string };
		expect(result.outer).toBe('value with "inner quotes" here');
	});

	test("should handle complex nesting with all bracket/brace types", () => {
		const input = '{"a": [{"b": [{"c": {"d": [1, 2]}}]}]}';
		const result = parseJSON(input) as {
			a: Array<{ b: Array<{ c: { d: number[] } }> }>;
		};
		expect(result.a[0]?.b[0]?.c.d).toEqual([1, 2]);
	});

	test("should handle JSON where depth becomes 0 multiple times", () => {
		const input = '{"first": 1} {"second": 2}';
		const result = parseJSON(input);
		expect(result).toEqual({ first: 1 });
	});
});

describe("Error Handling", () => {
	test("should throw when no JSON-like structure exists", () => {
		const input = 'Just plain text';
		expect(() => parseJSON(input)).toThrow("No JSON found in input");
	});

	test("should throw on only whitespace", () => {
		const input = '   \n\t  ';
		expect(() => parseJSON(input)).toThrow("No JSON found in input");
	});

	test("should throw on markdown without content", () => {
		const input = '```json\n\n```';
		expect(() => parseJSON(input)).toThrow("No JSON found in input");
	});
});