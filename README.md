# Garmidian (Garmy)

An Obsidian plugin that builds a Garmin dashboard for you. Paste a Garmin Personal API key, pick your sports and metrics, and insert a ready [Dashy](https://github.com/Dimagious/dashsidian) dashboard into any note.

Status: early prototype (0.1.0). Not in the community catalog yet.

## How it works

1. **Key.** Create a Personal API key in Garmin Connect and paste it. It is stored in Obsidian's secure storage and sent only to Garmin.
2. **Load.** Garmy loads up to a year of history (about 17 requests) and saves one note per day, so dashboards work offline.
3. **Choose.** Only what exists in your data is offered: no swimming cards if you never swam.
4. **Insert.** Preview the dashboard on your own data, then create a note or insert it into the current one. The result is plain Dashy blocks you can edit by hand, so nothing is lost if you stop using the plugin.

The command "Sync the last 14 days from Garmin" tops up recent days.

## What it writes

One note per day in `Garmy/data` with these properties when Garmin has them: `steps`, `resting_hr`, `stress`, `sleep_score`, `sleep_duration`, `hrv`, and per sport `run_km`, `run_min`, `bike_km`, `bike_min`, `swim_km`, `swim_min`, `strength_min`. An existing note keeps every non-empty property.

Not available through the Personal API: Training Readiness, VO2 max as a number, and the full daily distance (range endpoints report only walking distance, so Garmy does not write `distance_km`).

## Requirements

Obsidian 1.11.4 or newer, the Dashy plugin, and a Garmin Personal API key. Garmin's terms cover personal use of your own key; the API is not for commercial multi-user services.

## Development

```bash
npm install
npm run typecheck && npm test && npm run build
node e2e/wizard.mjs            # real Obsidian, needs a Garmin key in the macOS Keychain (service garmin-personal-api)
node e2e/wizard.mjs --bad-key  # negative path
```

Layers: `src/core` (mapping, data profile, dashboard composer, no I/O), `src/api` (client with injected transport), `src/app` (wizard, note storage), `src/main.ts`.

MIT licensed.
