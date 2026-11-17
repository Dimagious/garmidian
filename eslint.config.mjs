import { obsidianPlugin } from 'obsidian-plugin-dev-kit/eslint';

export default [
  ...obsidianPlugin({
    rootDir: import.meta.dirname,
    ignores: [
      // Build output of the e2e runs.
      '.e2e/**',
      'playwright-report/**',
      'test-results/**',
      // Build output of the preview stand and the capture run: bundles, and
      // one of them is a symlink to main.js inside a generated vault.
      '.preview/**',
      '.capture/**',
      // Developer tooling that runs under Node, never shipped: probes, the Health Sync comparison.
      'tools/**',
      // The GitHub Pages site and its assembled copy: a static web page, not
      // plugin code. The plugin preset's rules (App#saveLocalStorage, popout
      // timers) have no meaning there, and none of it ships in main.js.
      'site/**',
      '_site/**',
      // The YouTube overview: a Remotion project with its own tsconfig, React
      // and node_modules link, rendered on the author's machine, never shipped.
      'video/**',
      // Its recording config: a Playwright config like playwright.config.ts, which the kit already leaves out.
      'playwright.video.config.ts',
      // Test scaffolding: the fake Obsidian, the DOM shim, the fake vault.
      // None of it is bundled, and the preset forbids silencing its DOM rules
      // per line, rightly, since in plugin code they are never negotiable.
      // The shim cannot call createEl: it is what provides createEl.
      'src/test/**',
    ],
  }),
];
