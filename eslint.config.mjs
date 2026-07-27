// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Global ignores — legacy/ (quarantined old app) and foundation/ (frozen,
    // non-compiling reference specs) must never be linted or type-checked.
    ignores: [
      'legacy/**',
      'foundation/**',
      'docs/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/*.d.ts',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
    ],
  },
  {
    // T-1701a adds `packages/desktop/e2e` beside `packages/ui/e2e`: the gate
    // requires lint to cover e2e specs, and the desktop suite is a second e2e
    // root (it owns the `electron` dep and must not change the shape of the web
    // suite or its flake gate). `packages/*/src/**` already covers the shell's
    // own sources.
    files: ['packages/*/src/**/*.{ts,tsx}', 'packages/*/e2e/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Engine purity: async work must be awaited or explicitly handled.
      '@typescript-eslint/no-floating-promises': 'error',
      // Unused imports/vars are errors (acceptance criterion).
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);
