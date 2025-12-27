import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
	{
		ignores: ['main.js', '*.mjs', 'node_modules/**'],
	},
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 2020,
				sourceType: 'module',
			},
			globals: {
				console: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				navigator: 'readonly',
				fetch: 'readonly',
				TextDecoder: 'readonly',
				NodeJS: 'readonly',
			},
		},
		plugins: {
			'@typescript-eslint': tseslint,
			prettier: prettier,
		},
		rules: {
			...eslint.configs.recommended.rules,
			...tseslint.configs.recommended.rules,
			...prettierConfig.rules,
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off',
			'prettier/prettier': 'error',
			'no-console': 'off',
			'no-undef': 'off', // TypeScript handles this
		},
	},
];
