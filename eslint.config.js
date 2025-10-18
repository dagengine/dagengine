import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";

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
			"import": importPlugin,
		},
		rules: {
			...tseslint.configs.recommended.rules,
			"no-undef": "off",  // Turn off for TypeScript - TS handles this
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_"
				}
			],
			"@typescript-eslint/explicit-function-return-type": "warn",
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/prefer-readonly": "error",

			"import/extensions": [
				"error",
				"ignorePackages",
				{
					"js": "always",
					"ts": "never"
				}
			],
		},
		settings: {
			"import/resolver": {
				"typescript": {
					"alwaysTryTypes": true,
					"project": "./tsconfig.json"
				},
				"node": true
			}
		}
	},
	{
		ignores: ["dist/", "node_modules/", "*.js", "*.mjs"],
	},
];