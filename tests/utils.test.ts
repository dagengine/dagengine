import {describe, test, expect} from 'vitest';

import { parseJSON } from "../src/utils";

describe("Utils", () => {
	describe("parseJSON", () => {
		test("should parse clean JSON", () => {
			const result = parseJSON('{"key": "value"}');
			expect(result).toEqual({ key: "value" });
		});

		test("should parse JSON with markdown", () => {
			const result = parseJSON('```json\n{"key": "value"}\n```');
			expect(result).toEqual({ key: "value" });
		});

		test("should parse JSON with extra text", () => {
			const result = parseJSON(
				'Here is the result: {"key": "value"} and more text',
			);
			expect(result).toEqual({ key: "value" });
		});

		test("should handle arrays", () => {
			const result = parseJSON("[1, 2, 3]");
			expect(result).toEqual([1, 2, 3]);
		});

		test("should repair malformed JSON", () => {
			const result = parseJSON('{key: "value"}'); // Missing quotes
			expect(result).toEqual({ key: "value" });
		});
	});
});
