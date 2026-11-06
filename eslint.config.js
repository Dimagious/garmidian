import obsidianmd from 'eslint-plugin-obsidianmd';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  // Base JavaScript recommended
  js.configs.recommended,

  // TypeScript recommended (without type checking for faster linting)
  ...tseslint.configs.recommended,

  // Type-aware rules, scoped to the TypeScript sources because the config
  // files are not in the tsconfig project. The catalogue's reviewer runs these
  // and reported three findings we never saw; a gate that stops short of the
  // reviewer's is a gate that tells you afterwards.
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({ ...c, files: ['**/*.ts'] })),

  // The plugin's own `recommended` preset, not a hand-picked subset of it.
  // Picking rules by hand is picking which parts of the review to fail: the
  // list here was 27 of the 39 the preset enables, and the twelve missing ones
  // included `no-unsupported-api` at error level and the console-logging rule
  // straight out of the plugin guidelines.
  ...obsidianmd.configs.recommended,

  // Our own overrides on top, each one deliberate.
  {
    plugins: {
      obsidianmd: obsidianmd,
    },
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        process: 'readonly',
      },
    },
    rules: {
      // Timers go through `window`, not `activeWindow`: a popout window gets a
      // `window` that resolves correctly through the timer's own closure.
      'obsidianmd/prefer-window-timers': 'error',
      // Presence-only check: it flags a PluginSettingTab without a
      // getSettingDefinitions() method. See src/ui/settings.ts, which has one.
      'obsidianmd/settings-tab/prefer-setting-definitions': 'error',

      // Off: it reads diagnostics and button labels as headings and asks for
      // sentence case where the text is already a sentence.
      'obsidianmd/ui/sentence-case': 'off',

      // Match the Obsidian scorecard scanner's strict no-unused-vars policy:
      // every declared argument must be used (or prefixed with `_`).
      '@typescript-eslint/no-unused-vars': ['error', {
        args: 'all',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
      }],

      // A Promise returned where a void-typed callback is expected, a DOM
      // listener for instance, drops its rejection in silence. Needs the type
      // information that parserOptions.project above provides.
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  
  // Config files - no type checking
  {
    files: ['*.config.ts', '*.config.js', 'vitest.config.ts'],
    languageOptions: {
      parser: tseslint.parser,
      // No parserOptions.project for config files to avoid parsing errors
    },
    rules: {
      // Disable rules that require type checking for config files
      'obsidianmd/no-plugin-as-component': 'off',
    },
  },
  
  // Ignore patterns
  {
    ignores: [
      // Scenes for the stageshow skill: React, built in that skill's playground
      'design/**',
      'node_modules/**',
      'coverage/**',
      'dist/**',
      'main.js',
      '.e2e/**',
      'playwright-report/**',
      'test-results/**',
      // Build output of the preview stand and the capture run: bundles, and
      // one of them is a symlink to main.js inside a generated vault.
      '.preview/**',
      '.capture/**',
      'scripts/**',
      // Developer tooling that runs under Node, never shipped: probes, the screenshot tour, the Health Sync comparison.
      'tools/**',
      // The GitHub Pages site and its assembled copy: a static web page, not
      // plugin code. The plugin preset's rules (App#saveLocalStorage, popout
      // timers) have no meaning there, and none of it ships in main.js.
      'site/**',
      '_site/**',
      // Test scaffolding: the fake Obsidian, the DOM shim, the fake vault.
      // None of it is bundled, and the preset forbids silencing its DOM rules
      // per line — rightly, since in plugin code they are never negotiable.
      // The shim cannot call createEl: it is what provides createEl.
      'src/test/**',
      'src/**/*.test.ts',
      'vitest.config.ts', // Exclude from type checking to avoid parsing errors
      // e2e/**, e2e-vault.pristine/**, and playwright.config.ts are
      // git-tracked, but outside tsconfig's `include` (`src/**/*.ts`
      // only), so the type-aware rules can't parse them ("file not
      // found in any of the provided project(s)"); none of this code
      // ships in main.js. E2E lint setup (its own tsconfig + config
      // block) is a separate future task.
      // .obsidian-unpacked/** is a local/untracked unpacked-vault
      // artifact, not source.
      '.obsidian-unpacked/**',
      'e2e-vault.pristine/**',
      'e2e/**',
      'e2e-vault.pristine/**',
      'playwright.config.ts',
    ],
  },
];

