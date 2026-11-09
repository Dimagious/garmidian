# Garmidian - Claude project notes

> Keep short. Memory lives in `.claude/brain/`.

## Where the rest lives

- `.claude/brain/index.md` - entry point; `current-context.md` - what is in flight; `backlog.md` - what is next; `decisions/` - ADRs.
- `docs/design.md` - the wizard design brief and the "Requests for the developer" list.
- At the start of a session: read `backlog.md` and the latest file in `sessions/`.

## What this is

**Garmidian** (plugin name **Garmy**, id `garmidian`) builds a Garmin dashboard inside Obsidian: the user pastes a Garmin Personal API key, the plugin loads history into one note per day, the user picks sports and metrics, and gets a ready [Dashy](https://github.com/Dimagious/dashsidian) dashboard. Third plugin of the author after Snipsy and Dashy; the harness (lint, release gates, e2e) is copied from Dashy.

Name vs id: `name` must not resemble "Obsidian" (the catalog review rejects that, which is why `Snipsidian` became `Snipsy`). So `id` and repo are `garmidian`, `name` is `Garmy`. Do not rename `name` to `Garmidian`.

## Layout

```
src/core   pure: catalog (metrics, sports, ru/en labels), profile (what data exists), mapping (API JSON -> fields), compose (profile + choices -> Dashy markdown)
src/api    GarminClient with an injected transport (Obsidian requestUrl in the plugin, a fake in tests)
src/i18n   one file per language (en, ru, es, de, fr, pt, ja) typed as `Locale`; `index.ts` picks the language from Obsidian's code
src/app    wizard modal, media slots, vault storage, settings tab, i18n strings
src/main.ts  plugin entry
e2e/       Playwright specs against real Obsidian (fake Garmin by default, live with GARMIN_LIVE=1)
tools/     developer scripts, not shipped: screenshot tour, comparison with Health Sync, API probes
```

`core` and `api` import nothing from Obsidian. Keep it that way: they carry the unit-test coverage gate (90 percent).

## Commands

```bash
npm run lint && npm run typecheck && npm test && npm run build   # the gates
npm run release:check                                             # everything incl. versions and scorecard
npm run e2e                                                       # needs macOS Obsidian and a Dashy build (DASHY_DIST, default ../dashsidian)
GARMIN_LIVE=1 npm run e2e -- e2e/live.spec.ts                     # real API, key from Keychain service garmin-personal-api
npm run capture                                                   # retake README pictures and clips (real Obsidian, demo data, needs ffmpeg); output docs/screens
npm run listing                                                   # headline-and-frame pictures for the community directory, docs/listing (desktop 1200x800, phone 900x1600)
node tools/tour.mjs --days=30                                     # screenshots of every wizard state, output in .e2e/
```

## Rules that cost us something

- Obsidian collects `getSettingDefinitions()` early for search. Anything that can change (is a key saved?) must be read inside the row's `render`, not outside it.
- Timers go through `window.setTimeout`; DOM and media queries through `activeDocument` / `activeWindow` (popout windows). The scorecard gate checks this.
- "Today" is the local day (`core/dates.ts`), never `toISOString()`. Date arithmetic goes through `addDays`.
- Directory pictures live in `docs/listing` and are uploaded by hand on community.obsidian.md (Edit listing). The phone ones are Obsidian's mobile interface in a 390 px window (`app.emulateMobile`), not a device.
- README pictures must come from `npm run capture` (real plugin, generated demo data). Never put a real person's health data into a picture. `npm run readme:check` verifies links, images and dashes.
- The rebuild region is `%% garmy:start %%` ... `%% garmy:end %%` plus one `garmy` property (core/region.ts). It stores the sports the user switched off, not the ones chosen, so a rebuild picks up new sports.
- The three latest days are overwritten on sync, older days only filled (`core/merge.ts`, ADR 0005).
- A day split across two activity pages must be summed after all pages are read, not per page.
- Do not write `distance_km`: range endpoints give walking distance, not the day's total.
- Every user-visible string lives in `src/i18n/<lang>.ts`. A new string goes into `types.ts` and all seven files; `locales.test.ts` fails on a missing key, an empty text, a lost product name (Garmin Connect, Dashy...) or an untranslated long text. Default language is Obsidian's, English when unsupported.
- Never print or store the key. Tests use a fake key; the live spec reads the Keychain.
- No em dashes anywhere (code, copy, docs).
- Git: commits are authored by the developer only, no Claude trailers.

## Сайт

- `site/` - GitHub Pages в стиле Dashy (ribbon, дерево заметок, Cmd/Ctrl+K), свои цвета (teal) и знак Garmy. Общая оболочка `site/_shell.html`, страницы дописывают ее через `<!--shell:top tab="..."-->` и `<!--shell:bottom-->`. Одна страница `index.html` из секций-"файлов" и пять гайдов в `site/guides/`.
- `npm run site:check` (битые картинки, якоря, тире, обязательные файлы, sitemap), `npm run site:assemble` собирает `_site/`: `site/` плюс картинки из `docs/screens`, `docs/listing` и `media/help-key.png` в `img/` (одна карта источников `listImageSources` в `scripts/site-check.cjs`).
- Pages выкатывается по тегу `x.y.z` (`.github/workflows/pages.yml`), версия подставляется из `manifest.json`. Карточку для соцсетей рисует `npm run site:card` в `docs/screens/social-preview.png`; ту же картинку руками загрузить в GitHub Settings, Social preview.
- Тексты на сайте: английский, без em/en-дефисов, примеры YAML брать из `compose`, а не писать от руки. Тег google-site-verification добавляется владельцем позже.
