# Security policy

## Reporting a vulnerability

Report it privately through GitHub: open the Security tab of this repository and choose **Report a vulnerability**. Please do not open a public issue for something exploitable. Garmidian is maintained by one person: expect an acknowledgement within seven days, with an honest estimate rather than a promise.

Include the plugin version, the Obsidian version and the platform.

## How the plugin treats your Garmin key

- The Personal API key is stored with Obsidian's secure storage (`app.secretStorage`). It is never written to a note, to `data.json` or to a log. The e2e suite checks the first two.
- The key is sent only to Garmin's token service (`personalapitoken-service`). Garmin answers with a token that lives 24 hours; the token is kept in memory and is not saved.
- All requests go through Obsidian's `requestUrl` to `personal.connectapi.garmin.com`. The plugin makes no other network request and has no telemetry.
- Error messages shown to the user never contain the key. Technical details go to the developer console only.

## What counts

- Anything that makes the key, the token or the health data leave the vault or the Garmin host.
- A crafted API response that ends up executed or reaches the page as markup instead of text. Responses are parsed as JSON and only numbers and fixed strings reach the notes.
- A path setting (data folder, dashboards folder) that lets the plugin write outside the vault.

## What the plugin writes

One note per day in the data folder (properties only), and the dashboard note or text the user asks for. An existing note keeps every non-empty property.
