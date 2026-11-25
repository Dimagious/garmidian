# Garmidian - Claude project notes

> Keep short. Memory lives in `.claude/brain/`.

## Where the rest lives

- `.claude/brain/index.md` - entry point; `current-context.md` - what is in flight; `backlog.md` - what is next; `decisions/` - ADRs.
- `docs/design.md` - the wizard design brief and the "Requests for the developer" list.
- At the start of a session: read `backlog.md` and the latest file in `sessions/`.

## What this is

**Garmidian** (plugin name **Garmy**, id `garmidian`) builds a Garmin dashboard inside Obsidian: the user pastes a Garmin Personal API key, the plugin loads history into one note per day, the user picks sports and metrics, and gets a ready [Dashy](https://github.com/Dimagious/dashsidian) dashboard. Third plugin of the author after Snipsy and Dashy; the harness (build, lint, scanner, release, e2e, README films) comes from `obsidian-plugin-dev-kit` (`opdk`).

Name vs id: `name` must not resemble "Obsidian" (the catalog review rejects that, which is why `Snipsidian` became `Snipsy`). So `id` and repo are `garmidian`, `name` is `Garmy`. Do not rename `name` to `Garmidian`.

## Layout

```
src/core   pure: catalog (metrics, sports), profile (what data exists), mapping (API JSON -> fields), compose (profile + choices -> Dashy markdown)
src/api    GarminClient with an injected transport (Obsidian requestUrl in the plugin, a fake in tests)
src/i18n   one file per language (en, ru, es, de, fr, pt, ja) typed as `Locale`; `index.ts` picks the language from Obsidian's code
src/app    wizard modal, media slots, vault storage, settings tab, rebuild
src/main.ts  plugin entry
e2e/       Playwright specs against real Obsidian (fake Garmin by default, live with GARMIN_LIVE=1)
tools/     developer scripts, not shipped: comparison with Health Sync, API probes
```

`core` and `api` import nothing from Obsidian. Keep it that way: they carry the unit-test coverage gate (90 percent). The wizard and the settings tab are unit-tested too, in jsdom on `obsidian-test-mocks` (pinned exactly, majors ignored by Dependabot; the harness is `src/test/mock-app.ts`), and `vitest.config.ts` (`defineUnitConfig` from the kit) counts both in the gate; the node tests keep `src/test/obsidian-stub.ts`.

## Commands

```bash
npm run lint && npm run typecheck && npm test && npm run build   # the gates
npm run release:check                                             # everything incl. versions and scorecard
npx opdk release patch --dry-run                                 # cut a release (patch|minor|major|X.Y.Z): bump, check, tag, kit workflow, publish; drop --dry-run to do it. Runs no tests itself: run `npm run release:check` first and push all commits (never release unpushed ones). Clean default branch, gh signed in
npm run e2e                                                       # needs macOS Obsidian and a Dashy build (DASHY_DIST, default ../dashsidian)
GARMIN_LIVE=1 npm run e2e -- e2e/live.spec.ts                     # real API, key from GARMIN_PERSONAL_API_KEY or Keychain service garmin-personal-api (read only in live mode, e2e/live-key.ts)
npm run capture                                                   # retake README pictures and clips (real Obsidian, demo data, needs ffmpeg); output docs/screens
npm run listing                                                   # headline-and-frame pictures for the community directory, docs/listing (desktop 1200x800, phone 900x1600)
TOUR=1 npx playwright test e2e/tour.spec.ts                      # screenshots of every wizard state and the layout checks, fake Garmin, output in .e2e/tour (GARMIN_LIVE=1 on top uses the real key for the one test that builds a dashboard)
```

## Maker and checker

Любая фича или багфикс с изменением кода идёт через агентов `maker` (Sonnet) и `checker` (Opus) из кита: `.claude/agents/opdk -> node_modules/obsidian-plugin-dev-kit/claude/agents`. Оба читают этот раздел и разделы "Rules that cost us something" и "Сайт" ниже как обязательные. Оркестратор (основная сессия) код не пишет: ставит задачу maker'у, передаёт отчёты, показывает итоговый вердикт и дифф. Цикл повторяется до APPROVE. Без агентов можно: опечатки, документация, комментарии, файлы `.claude/**`, или когда пользователь просит явно.

Garmy-specific rules for both agents:

- **Layers.** `src/core` and `src/api` import nothing from `obsidian` and touch no DOM. Obsidian is reached from `src/app` and `src/main.ts`; the Garmin client gets its transport injected (`requestUrl` in `main.ts`, a fake in tests).
- **Strings.** A new user-visible string goes into `src/i18n/types.ts` and all seven language files; `locales.test.ts` enforces it.
- **Extra gates:** `npm run typecheck` covers two tsconfigs (src, e2e), both must pass. `npm run build` (images are bundled into `main.js`). When the diff touches `README.md` or `docs/`, `npm run readme:check`; when it touches `site/`, `npm run site:check`.
- **Checker lens: Dashy's public API.** Garmy writes Dashy blocks and depends on Dashy's API (`../dashsidian/docs/API.md`, types copied into `src/core/dashy.ts`). Check that: every block key Garmy writes is in `src/test/dashy-schema.ts` and its test runs; a key newer than the oldest supported Dashy is written only behind `schemaAtLeast(api.schemaVersion, X)` with a fallback (the `goal: usual` pattern in `ctx.ts`); the API is read through `readDashyApi` when needed, never cached; `apiVersion` is compared with `>=`; `check` warns and never blocks a write, `status: "unknown"` counts as an error, an indexing notice means retry. A changed block is listed under "Not verifiable locally" for `e2e/templates.spec.ts` (real Dashy, zero diagnostics).
- **Checker lens: notes already in vaults.** The `garmy` property is positional (template is the 8th field) and the region markers are fixed: a format change must still rebuild notes written by every released version. Sync overwrites only the three latest days (ADR 0005); unit switches only add fields; multi-page activity days are summed after all pages.
- **Checker lens: the key and the network.** The key is never logged, shown, put in `data.json` or a test fixture; it lives in `secretStorage`. The only host is `personal.connectapi.garmin.com` through the injected transport; any other network call is a finding. Every dashboard keeps "Data source: Garmin" under its title (Garmin brand guidelines) and no Garmin logo.

## Rules that cost us something

- Obsidian collects `getSettingDefinitions()` early for search. Anything that can change (is a key saved?) must be read inside the row's `render`, not outside it.
- "Today" is the local day (`core/dates.ts`), never `toISOString()`. Date arithmetic goes through `addDays`.
- Directory pictures live in `docs/listing` and are uploaded by hand on community.obsidian.md (Edit listing). The phone ones are Obsidian's mobile interface in a 390 px window (`app.emulateMobile`), not a device.
- README pictures must come from `npm run capture` (real plugin, generated demo data). Never put a real person's health data into a picture. `npm run readme:check` verifies links, images and dashes.
- The rebuild region is `%% garmy:start %%` ... `%% garmy:end %%` plus one `garmy` property (core/region.ts). It stores the sports the user switched off, not the ones chosen, so a rebuild picks up new sports.
- The three latest days are overwritten on sync, older days only filled (`core/merge.ts`, ADR 0005).
- A day split across two activity pages must be summed after all pages are read, not per page.
- Do not write `distance_km`: range endpoints give walking distance, not the day's total.
- Единицы (`Units`): `SPORTS[x].dist` держит поле, единицу и точность для `metric` и `imperial` (`run_mi`, `bike_mi`, `swim_yd`). Пересчёт заметок и записей (`core/units.ts`) только ДОБАВЛЯЕТ недостающие поля и не удаляет старые: переключение обратно ничего не теряет. Пересборка берёт единицы из настроек, не из `garmy` property (формат region не менялся). Новая установка на en-US стартует в милях, обновление остаётся в км; e2e-vault закреплён на km через data.json в фикстуре.
- Библиотека шаблонов (`core/templates.ts`): реестр `DEFS` + `listTemplates(profile, opts)` для мастера (карточка с причиной `need`, если данных не хватает) + `buildTemplate`. Сборщики: `tpl-health.ts` (glance, sleep, recovery, steps), `tpl-training.ts` (sport:<id>, triathlon, race, year), `tpl-period.ts` (week, month, `period: note`). Общее: `blocks.ts` (запись YAML, `niceUp`, `isRaceDate`), `ctx.ts` (`makeCtx`: слова, диапазоны, `open`/`finish`). Overview остаётся в `compose.ts` и не менялся. Шаблон хранится 8-м полем `garmy` property (у overview поля нет), `rebuildNote` строит тот же вид. Новый шаблон = запись в `DEFS` + сборщик + `desc`/`need` в i18n (`tplDesc`, `tplNeed`) + имя в `labels` + id в `IDS` в `templates.test.ts`. Каждый блок прогоняется через `src/test/dashy-schema.ts` (ключи из справочника Dashy): неизвестный ключ или `compare: usual` на сумме роняют тест. Обзоры недели и месяца обязаны называться периодом (`isoWeek`), иначе Dashy не знает дат. `e2e/templates.spec.ts` рисует каждый вид в настоящем Dashy и ждёт ноль диагностик.
- Every user-visible string lives in `src/i18n/<lang>.ts`. A new string goes into `types.ts` and all seven files; `locales.test.ts` fails on a missing key, an empty text, a lost product name (Garmin Connect, Dashy...) or an untranslated long text. Default language is Obsidian's, English when unsupported.
- Never print or store the key. Tests use a fake key; the live spec reads the Keychain.
- No em dashes anywhere (code, copy, docs).
- Git: commits are authored by the developer only, no Claude trailers.

## Сайт

- `site/` - GitHub Pages в стиле Dashy (ribbon, дерево заметок, Cmd/Ctrl+K), свои цвета (teal) и знак Garmy. Общая оболочка `site/_shell.html`, страницы дописывают ее через `<!--shell:top tab="..."-->` и `<!--shell:bottom-->`. Одна страница `index.html` из секций-"файлов" и пять гайдов в `site/guides/`.
- `npm run site:check` (битые картинки, якоря, тире, обязательные файлы, sitemap), `npm run site:assemble` собирает `_site/`: `site/` плюс картинки из `docs/screens`, `docs/listing` и `media/help-key.png` в `img/` (одна карта источников `listImageSources` в `scripts/site-check.cjs`).
- Pages выкатывается по тегу `x.y.z` (`.github/workflows/pages.yml`), версия подставляется из `manifest.json`. Карточку для соцсетей рисует `npm run site:card` в `docs/screens/social-preview.png`; ту же картинку руками загрузить в GitHub Settings, Social preview.
- Тексты на сайте: английский, без em/en-дефисов, примеры YAML брать из `compose`, а не писать от руки. Тег google-site-verification добавляется владельцем позже.
