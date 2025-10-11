import { describe, test, expect } from '@jest/globals';
import { parseJSON } from '../src/utils';

describe('Utils - parseJSON Extended', () => {
    test('should handle nested markdown blocks', () => {
        const input = '```json\n```json\n{"nested": true}\n```\n```';
        const result = parseJSON(input);
        expect(result).toEqual({ nested: true });
    });

    test('should handle multiple JSON objects in text', () => {
        const input = 'First: {"a": 1} Second: {"b": 2}';
        const result = parseJSON(input);
        // Should extract the first valid JSON
        expect(result).toHaveProperty('a');
    });

    test('should handle JSON with escaped characters', () => {
        const input = '{"text": "Line 1\\nLine 2\\tTabbed"}';
        const result = parseJSON(input) as any;
        expect(result.text).toBe('Line 1\nLine 2\tTabbed');
    });

    test('should handle very large JSON objects', () => {
        const largeObject: any = {};
        for (let i = 0; i < 1000; i++) {
            largeObject[`key${i}`] = `value${i}`;
        }
        const input = JSON.stringify(largeObject);
        const result = parseJSON(input) as any;
        expect(Object.keys(result)).toHaveLength(1000);
    });

    test('should handle JSON with comments (via repair)', () => {
        const input = `{
      // This is a comment
      "key": "value"
    }`;
        const result = parseJSON(input);
        expect(result).toEqual({ key: 'value' });
    });

    test('should handle trailing commas (via repair)', () => {
        const input = '{"a": 1, "b": 2,}';
        const result = parseJSON(input);
        expect(result).toEqual({ a: 1, b: 2 });
    });

    test('should handle single quotes (via repair)', () => {
        const input = "{'key': 'value'}";
        const result = parseJSON(input);
        expect(result).toEqual({ key: 'value' });
    });

    test('should handle unquoted keys (via repair)', () => {
        const input = '{key: "value"}';
        const result = parseJSON(input);
        expect(result).toEqual({ key: 'value' });
    });

    test('should handle empty string input', () => {
        expect(() => parseJSON('')).toThrow();
    });

    test('should handle JSON with Unicode', () => {
        const input = '{"emoji": "🎉", "chinese": "你好"}';
        const result = parseJSON(input) as any;
        expect(result.emoji).toBe('🎉');
        expect(result.chinese).toBe('你好');
    });

    test('should extract JSON from markdown response', () => {
        const input = `Here is your result:
    
\`\`\`json
{
  "status": "success",
  "data": [1, 2, 3]
}
\`\`\`

That's all!`;
        const result = parseJSON(input) as any;
        expect(result.status).toBe('success');
        expect(result.data).toEqual([1, 2, 3]);
    });

    test('should handle JSON with nested objects', () => {
        const input = '{"level1": {"level2": {"level3": "value"}}}';
        const result = parseJSON(input) as any;
        expect(result.level1.level2.level3).toBe('value');
    });

    test('should handle JSON with nested arrays', () => {
        const input = '{"arrays": [[1, 2], [3, 4], [5, 6]]}';
        const result = parseJSON(input) as any;
        expect(result.arrays).toEqual([[1, 2], [3, 4], [5, 6]]);
    });

    test('should handle JSON with boolean values', () => {
        const input = '{"true_val": true, "false_val": false}';
        const result = parseJSON(input) as any;
        expect(result.true_val).toBe(true);
        expect(result.false_val).toBe(false);
    });

    test('should handle JSON with null values', () => {
        const input = '{"null_val": null}';
        const result = parseJSON(input) as any;
        expect(result.null_val).toBeNull();
    });

    test('should handle JSON with number values', () => {
        const input = '{"int": 42, "float": 3.14, "negative": -10}';
        const result = parseJSON(input) as any;
        expect(result.int).toBe(42);
        expect(result.float).toBe(3.14);
        expect(result.negative).toBe(-10);
    });

    test('should handle array at root level', () => {
        const input = '[1, 2, 3, 4, 5]';
        const result = parseJSON(input);
        expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    test('should handle array with objects', () => {
        const input = '[{"id": 1}, {"id": 2}, {"id": 3}]';
        const result = parseJSON(input) as any[];
        expect(result).toHaveLength(3);
        expect(result[0].id).toBe(1);
    });

    test('should handle mixed content before JSON', () => {
        const input = 'Some text before {"key": "value"}';
        const result = parseJSON(input);
        expect(result).toEqual({ key: 'value' });
    });

    test('should handle mixed content after JSON', () => {
        const input = '{"key": "value"} some text after';
        const result = parseJSON(input);
        expect(result).toEqual({ key: 'value' });
    });

    test('should handle JSON with special characters in values', () => {
        const input = '{"special": "!@#$%^&*()_+-=[]{}|;:,.<>?"}';
        const result = parseJSON(input) as any;
        expect(result.special).toBe('!@#$%^&*()_+-=[]{}|;:,.<>?');
    });

    test('should handle JSON with line breaks in strings', () => {
        const input = '{"multiline": "Line 1\\nLine 2\\nLine 3"}';
        const result = parseJSON(input) as any;
        expect(result.multiline).toBe('Line 1\nLine 2\nLine 3');
    });

    test('should handle empty object', () => {
        const input = '{}';
        const result = parseJSON(input);
        expect(result).toEqual({});
    });

    test('should handle empty array', () => {
        const input = '[]';
        const result = parseJSON(input);
        expect(result).toEqual([]);
    });

    test('should handle JSON with whitespace', () => {
        const input = `
    {
      "key1"  :  "value1"  ,
      "key2"  :  "value2"
    }
    `;
        const result = parseJSON(input);
        expect(result).toEqual({ key1: 'value1', key2: 'value2' });
    });

    test('should handle JSON in backticks without language', () => {
        const input = '```\n{"key": "value"}\n```';
        const result = parseJSON(input);
        expect(result).toEqual({ key: 'value' });
    });

    test('should handle multiple backtick blocks', () => {
        const input = '```\nignore this\n```\n```json\n{"key": "value"}\n```';
        const result = parseJSON(input);
        expect(result).toEqual({ key: 'value' });
    });

    test('should handle JSON with scientific notation', () => {
        const input = '{"sci": 1.5e10, "sci2": 2.3e-5}';
        const result = parseJSON(input) as any;
        expect(result.sci).toBe(1.5e10);
        expect(result.sci2).toBe(2.3e-5);
    });

    test('should handle deeply nested JSON', () => {
        const input = '{"a":{"b":{"c":{"d":{"e":{"f":"deep"}}}}}}';
        const result = parseJSON(input) as any;
        expect(result.a.b.c.d.e.f).toBe('deep');
    });

    test('should prioritize first JSON object when multiple exist', () => {
        const input = '{"first": 1} random text {"second": 2}';
        const result = parseJSON(input) as any;
        expect(result.first).toBe(1);
        expect(result.second).toBeUndefined();
    });
});