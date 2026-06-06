import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default [
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    ignores: ['dist/**/*', 'node_modules/**/*', '*.js', '.next/**/*'],
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: { ...reactHooks.configs.recommended.rules, ...jsxA11y.configs.recommended.rules },
  },
  {
    rules: {
      'no-console': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-has-content': 'warn',
      'prefer-const': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Disable Next.js rules (plugin may not be installed in all environments)
      '@next/next/no-img-element': 'off',
      // Disable overly strict rules that cause noise in complex UI components
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-autofocus': 'off',
      'jsx-a11y/img-redundant-alt': 'off',
      'jsx-a11y/heading-has-content': 'off',
      'jsx-a11y/no-noninteractive-tabindex': 'off',
      'jsx-a11y/interactive-supports-focus': 'off',
      'jsx-a11y/aria-role': 'off',
    },
  },
]
