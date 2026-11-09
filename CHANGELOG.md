# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-11-09

### Added

- A library of eleven dashboards. The third step of the wizard now starts with a choice: Everything (the dashboard Garmy always built), Morning glance, Sleep, HRV and recovery, Steps, one page per sport in your data (Run, Bike, Swim, Strength), Triathlon, Race build, Weekly review, Monthly review and Year so far. A card whose data is missing is greyed out and says what it waits for, so the list follows your data: lifting has no distance, a swim page measures in yards in miles mode, and the triathlon card unlocks when a second of swim, bike and run appears.
- A rebuild keeps the kind of dashboard. The `garmy` property gets an eighth field with the template (the overview keeps the seven it had), so older notes rebuild as before and a triathlon dashboard picks up a sport you start later.
- Weekly and monthly reviews are named for their period (`2026-W45`, `2026-11`), which is how Dashy knows the days they count; the preview is drawn under that name too. If a note with that name exists, Garmy says so and points to Insert into the current note.
- Monthly goals follow your own months on Dashy 2.2.0 or later. With four months of data or more, the bars for steps and for each sport are written as `goal: usual`: the average of your four previous whole months, recomputed every time the note is drawn, so the goal no longer goes stale until a rebuild. A shorter history, or an older Dashy, keeps the number from the last 28 days plus a tenth. A rebuild picks the form the installed Dashy supports.
- Garmy reads Dashy's public API. It tells a Dashy that has one (2.2.0) from an older one, and before it writes a dashboard it asks Dashy to draw the blocks off screen; if a block would show an error, the notice says what Dashy reported. The note is still written.
- A race can be one date (`2026-06-14`) as well as a folder of race notes, in the wizard options and in every dashboard that has a countdown.
- Distance units: kilometers or miles. Miles mode writes `run_mi`, `bike_mi` and `swim_yd` (a pool is measured in yards) and draws the cards and monthly goals with those. Choose in the wizard under More options or in settings. A fresh install on an en-US machine starts in miles, an update keeps kilometers.
- Switching units fills the notes already on disk from the other unit system, with no request to Garmin, and keeps both sets of properties, so switching back needs no conversion. Rebuilding a dashboard follows the current setting.
- A dashboard built from notes you already had keeps working in miles mode: when the notes hold only kilometers, the cards use them and say kilometers.

### Changed

- Monthly goals round up to a number a person would pick without doubling it: 110 km becomes 120, not 200 (the old ladder jumped from 1 to 2 to 2.5 to 5).

## [1.0.1] - 2026-11-06

### Fixed

- Styles no longer use `:has()` (Obsidian's review flags it as slow) or `clip-path`: selected cards, chips and the focus ring are marked with classes by the wizard.
- Reading a folder of day notes no longer walks the whole vault; it reads that folder's children. The vault-wide scan remains only for "Look for those notes", on click.

## [1.0.0] - 2026-11-06

First release for the community catalog.

### Added

- `fundingUrl` and a repository Sponsor button for Buy Me a Coffee. Donations are optional and unlock nothing.
- The key step shows the real Garmin Connect page (Settings, Personal API Key) as a bundled picture, and the instructions name that path in all seven languages. Pictures are bundled into `main.js`: a catalog release ships only `main.js`, `manifest.json` and `styles.css`, so a file in the plugin folder would never reach users.
- Every dashboard names Garmin as its data source under the title ("Data source: Garmin", in all seven languages), as Garmin's API brand guidelines ask for any view of Garmin data.
- A README with clips and pictures taken from the real plugin on generated demo data (`npm run capture`).
- Interface languages: English, Russian, Spanish, German, French, Portuguese and Japanese. The plugin follows Obsidian's language and falls back to English when it does not speak it; settings have a "Language" option to choose another. The dashboard labels have their own language choice in the wizard.
- Automatic sync: shortly after Obsidian starts and then every 6, 12 or 24 hours (or off), plus a "Sync now" button in settings. A sync loads the days since the last one with a margin of three, capped at 60.
- The three most recent days are overwritten on every sync, so numbers written part-way through a day are corrected. Older days only get missing properties filled.
- A rejected or expired key is remembered: settings show it with a "Replace key" button, and a notice offers the same once.
- Loading can be cancelled, and a request that gets no answer in 30 seconds becomes a "no connection" error instead of hanging.
- Use notes you already have: the key step can look for folders of daily notes that carry Garmin numbers (for example written by Garmin Health Sync) and build a dashboard from them, with no key and no loading. Notes need a date in the name (ISO, or your own daily note format from Daily notes or Periodic Notes, such as `06.11.2026`) and at least two known metrics.
- "Rebuild the dashboard in this note": the dashboard lives between two invisible comment markers, and the command regenerates only that part from the data on disk with the original choices.
- Body Battery: the day's highest value is saved as `body_battery` and shown in the recovery cards and the score chart. It comes with the daily summaries, so it costs no extra request.
- The preview warns when Dashy is turned off and can turn it on, or opens its page in the community browser when it is not installed.

### Fixed

- A dashboard rebuilt later includes sports that appeared in the data after it was built; only sports the user switched off stay off.
- The rebuild markers are short (`%% garmy:start %%`) and the choices live in a `garmy` property, so Live Preview no longer shows a long line of JSON above the dashboard.
- Chart titles name the series that are really drawn (for example "Sleep / Body Battery"), not a fixed phrase that mentioned a metric the data does not have.
- The default language of generated dashboards is English, like the interface.
- "Today" is the user's local day. It was the UTC day, which is wrong for the first hours of a day in Europe and the evening in the Americas.
- A load where every request failed now reports the outage instead of "no data yet".
- "Show the dashboard" is disabled while nothing is selected.
- Sync notices name the actual problem (no connection, rate limit, rejected key) instead of showing a raw error.

### Changed

- Notes whose content would not change are no longer rewritten, which keeps iCloud and git quiet.

## [0.1.0] - 2026-11-06

First prototype, not yet in the community catalog.

### Added

- Four-step wizard: key, load, choose, preview. It builds a Dashy dashboard from the user's own Garmin data and creates a note or inserts it into the current one.
- Loads up to a year of history from the Garmin Personal API in about 17 requests and saves one note per day.
- A composer that writes only the blocks the data supports: no swimming cards without swimming, charts and comparisons only after enough days, monthly goals from the user's own last 28 days.
- Russian and English interface.
- Settings tab with key status, folders and the wizard button. Command to sync the last 14 days.
- Help-clip slots in the wizard (`media/help-key.gif`, `media/help-dashy.gif`), a placeholder when the file is missing.

### Known limits

- No `distance_km`: the range endpoints report walking distance only.
- No Training Readiness: the Personal API does not provide it.
