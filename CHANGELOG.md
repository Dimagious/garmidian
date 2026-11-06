# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
