import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist/**', '**/*.{js,mjs,cjs}']),
  {
    files: ['**/*.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended, tseslint.configs.stylistic],
    rules: {
      // 通常のforスタイルが理解しやすい場合もあるため強制はしない。
      '@typescript-eslint/prefer-for-of': 'off',
      // Azure Functionsのハンドラーはランタイムが決めた引数順で呼ばれるため、
      // 使わない引数も残す必要がある。`_` 始まりの引数は未使用でも許可する。
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]);
