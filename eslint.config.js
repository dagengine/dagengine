import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
	js.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
				project: "./tsconfig.json",
			},
		},
		plugins: {
			"@typescript-eslint": tseslint,
		},
		rules: {
			...tseslint.configs.recommended.rules,
			"no-undef": "off",  // Turn off for TypeScript - TS handles this
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", }
			],
			"@typescript-eslint/explicit-function-return-type": "warn",
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/prefer-readonly": "error",
		},
	},
	{
		ignores: ["dist/", "node_modules/", "*.js", "*.mjs"],
	},
];