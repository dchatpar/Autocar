import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import-x'

export default [
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    ignores: ['dist/**/*', 'node_modules/**/*', '*.js'],
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { import: importPlugin },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'import/order': ['error', { groups: [['builtin', 'external']], 'newlines-between': 'always' }],
      'prefer-const': 'error',
      'no-var': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },
]
