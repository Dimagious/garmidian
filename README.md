# Garmidian (Garmy)

An Obsidian plugin that builds a Garmin dashboard for you. Paste a Garmin Personal API key, pick your sports and metrics, and insert a ready [Dashy](https://github.com/Dimagious/dashsidian) dashboard into any note.

Status: early prototype (0.1.0). Not in the community catalog yet.

Garmy is an independent project and is not affiliated with, endorsed by or sponsored by Garmin. Garmin and Garmin Connect are trademarks of Garmin Ltd. or its subsidiaries.

## How it works

1. **Key.** Create a Personal API key in Garmin Connect and paste it. It is stored in Obsidian's secure storage and sent only to Garmin.
2. **Load.** Garmy loads up to a year of history (about 17 requests) and saves one note per day, so dashboards work offline. Loading can be cancelled.
3. **Choose.** Only what exists in your data is offered: no swimming cards if you never swam.
4. **Insert.** Preview the dashboard on your own data, then create a note or insert it into the current one. The result is plain Dashy blocks you can edit by hand, so nothing is lost if you stop using the plugin.

## Already keep Garmin numbers in your notes?

If Garmin Health Sync or your own script writes metrics such as `steps` or `sleep_score` into daily notes, the first step of the wizard can find those folders and build the dashboard from them. No key and no loading. Notes need a date in the name (`2026-11-06`, or the format of your daily notes from Daily notes or Periodic Notes, for example `06.11.2026`) and at least two known metrics. Formats with month or weekday names are not read. Sport minutes (`run_min` and the like) are used when present.

## Keeping it fresh

- **Automatic sync** refreshes the latest days shortly after Obsidian starts and then every 6, 12 or 24 hours. Choose the interval, or turn it off, in the plugin settings. "Sync now" is there too.
- The three most recent days are overwritten on every sync, because a day is not finished until it is over. Older days only get missing properties filled.
- **Rebuild.** The dashboard sits between two invisible comment markers. The command "Rebuild the dashboard in this note" regenerates only that part from the data on disk, with the choices you made, and leaves everything you wrote around it. Use it after a month of data, when year maps and goals become possible.
- If Garmin rejects the key (it expires after the lifetime you chose), Garmy says so once and settings offer "Replace key".

## What it writes

One note per day in `Garmy/data` with these properties when Garmin has them: `steps`, `resting_hr`, `stress`, `sleep_score`, `sleep_duration`, `hrv`, `body_battery` (the day's highest value), and per sport `run_km`, `run_min`, `bike_km`, `bike_min`, `swim_km`, `swim_min`, `strength_min`. Folders are configurable.

Not available through the Personal API: Training Readiness, VO2 max as a number, and the full daily distance (range endpoints report only walking distance, so Garmy does not write `distance_km`).

## Disclosures

- **Account and key.** You need a Garmin Connect account and a Personal API key you create yourself. Garmin's terms cover personal use of your own key; the API is not for commercial services with many users.
- **Network.** The plugin contacts `personal.connectapi.garmin.com` and nothing else: once to exchange the key for a 24 hour token, then to read your own data. It uses Obsidian's `requestUrl`. There is no telemetry, no analytics and no ads.
- **Your data.** Health data stays in your vault. If your vault is synced (iCloud, git, Obsidian Sync), the daily notes sync with it, like any other note.
- **Secrets.** The key lives in Obsidian's secure storage, never in a note or `data.json`. The token stays in memory.
- **Files.** The plugin creates notes in the data folder and the dashboard folder you configure, and changes only the dashboard region of a note you ask it to rebuild.

## Languages

The wizard, settings and notices follow Obsidian's language and fall back to English: English, Russian, Spanish, German, French, Portuguese (Brazil) and Japanese. Settings has a "Language" option to pick another one. The words inside the generated dashboard (card labels, chart titles) are chosen separately in the wizard, so you can keep an English interface and a dashboard in your own language. Dashy's own messages follow Dashy's language setting. Translations other than English and Russian were machine-assisted and are open to correction by native speakers.

## Requirements

Obsidian 1.13.0 or newer, the Dashy plugin, and a Garmin Personal API key.

## Help clips

The wizard has two slots for short help clips: `media/help-key.gif` (where to create the key) and `media/help-dashy.gif` (how to install Dashy). Without a file the slot shows a placeholder, and with reduced motion enabled a clip waits for a click.

## Development

```bash
npm install
npm run lint && npm run typecheck && npm test && npm run build
npm run e2e                       # real Obsidian, fake Garmin (needs macOS Obsidian and a Dashy build, see CLAUDE.md)
GARMIN_LIVE=1 npm run e2e -- e2e/live.spec.ts   # real Garmin, key from the Keychain (service garmin-personal-api)
node tools/tour.mjs --days=30     # screenshots of every wizard state
```

Layers: `src/core` (mapping, data profile, dashboard composer, no I/O), `src/api` (client with injected transport), `src/app` (wizard, note storage, sync, settings), `src/main.ts`.

MIT licensed.
