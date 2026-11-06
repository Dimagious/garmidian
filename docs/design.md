# Garmy wizard: design brief

## Principles
1. Look like Obsidian. Only Obsidian CSS variables (`--background-*`, `--text-*`, `--interactive-accent`, `--radius-*`, `--size-*`, `--font-ui-*`), no hard-coded colors, no fonts, no images, no libraries. Native `button`, `select`, `input`, `Setting` and lucide icons through `setIcon`.
2. One decision per screen. Each step has one title, one sentence of lead text, one primary button.
3. Say what happens and why it is safe before asking for anything.
4. Never rely on color alone. State is always icon plus text (check, spinner, triangle, "Done", "Waiting", "Partly loaded").
5. Errors are friendly, name the cause in plain words and offer exactly one action. No raw messages in the UI; details go to `console.error`, never the key.

## Shell
Header (title, one-line subtitle), step indicator, scrolling body, fixed footer with actions. The modal is 760px max, the body scrolls, the footer stays visible. The close button is Obsidian's.

## Step flow
1. Key -> 2. Load -> 3. Choose -> 4. Preview, then Create note (primary) or Insert into current note (secondary).
The step indicator is an `ol` in a `nav`. Finished steps are buttons and go back; the current step has `aria-current="step"`; later steps are inert. While a check or a load is running, the buttons are disabled.

## States per screen
| Screen | Empty / idle | Loading | Error | Success |
|---|---|---|---|---|
| Key | Explainer, safe-storage note, 3 numbered steps, media slot placeholder, empty field | Button reads "Checking...", disabled | Wrong key (one action: paste another), no connection (try again), rate limited (try again), empty field (inline warning) | Moves to Load |
| Load | Period select, four parts "Waiting"; "Use what is already saved" if notes exist | Per part: spinner and `n / total` with bar, done parts get a check | Stopped: key rejected (go to Key), rate limited, connection lost, unexpected answer (each: try again). A part with warnings ends as "Partly loaded" | Summary card: days loaded, period, Continue. Auto-advances after 1.8s (3.5s if some part was partial) |
| Choose | Cards and chips preselected from data; only what exists in the data is shown | none | "Nothing is selected" hint | Show the dashboard |
| Preview | Frame with "Drawing the dashboard..." | same | Dashy missing (warning callout with what to do, optional clip), no open note for Insert, render failure | Notice from Obsidian, modal closes |
| Settings | Key status line "No key saved" | none | none | Key status "saved in secure storage", last sync date, Forget key |

## Type and spacing
4px grid through `--size-4-N`. Title `--font-ui-large` semibold; body `--font-ui-medium` for lead text and `--font-ui-small` for secondary; hints `--font-ui-smaller`. Lead text is capped at 62ch. Radii: `--radius-m` for controls and callouts, `--radius-l` for cards and the preview frame. Selected cards and chips use accent border plus a check badge, not just a tint.

## Media slots (two, no more)
`mountMediaSlot` in `src/app/media-slot.ts`. It renders a theme-aware sketch with a caption, or the media when there is some. Media is bundled into `main.js` as a data URL (`--loader:.png=dataurl`, `src/types/assets.d.ts`): a catalog release ships only `main.js`, `manifest.json` and `styles.css`, so a file next to the plugin would never reach the user.
- Step 1, "where to create the key": the real Garmin Connect page (`media/help-key.png`, Settings, Personal API Key), a still picture without a play button.
- Inside the "Dashy is not installed" warning: no media yet, so the whole slot is hidden. A clip (GIF) would get a play/stop button and, under `prefers-reduced-motion`, would wait for a click instead of autoplaying.
Do not use a picture with anyone's personal data in it. Keep files small (the key picture is 36 KB).
A third slot for steps 2 or 3 is not justified: those screens are self-explanatory.

## Accessibility
Visible `:focus-visible` rings (2px accent, 2px offset). Tab order follows reading order: stepper, body, footer. Step indicator: `nav` with an `ol`, `aria-current`, finished steps have screen-reader text "go back". Progress: each part is a `role="progressbar"` named by its label through `aria-labelledby` (not `aria-label`, which makes Obsidian show a hover tooltip), plus a `role="status"` live region that announces a part when it finishes. Callouts for errors use `role="alert"`. Cards and chips are real checkboxes (visually hidden input inside a label), so Space toggles them. Enter in the key field submits. Focus moves to the step title when the step changes. Reduced motion stops the spinner, pulse and transitions.

## Phone width (390px)
Modal is full width and capped to the window height. Columns collapse to one, cards stack, the step indicator shows only the current label, the footer wraps: primary action on its own full-width row on top, secondary actions share the row below. All buttons, selects, inputs, chips and step buttons are at least 44px high (also for `pointer: coarse`). Preview height is 38vh and scrolls inside its frame. The e2e run checks for no horizontal scroll and 44px targets.

## Copy
Short, concrete, no exclamation marks. Russian and English live side by side in `src/app/i18n.ts`. Ribbon tooltip changed from "Garmy" to "Build a Garmin dashboard" ("Собрать дашборд Garmin").

## Requests for the developer
1. A network failure during loading is turned into per-part warnings by `GarminClient.backfill` (only an auth error stops it). A fully offline run ends with 0 days and the "No data yet" message instead of "Loading stopped: no connection". Suggest: if every request failed with `network`, rethrow a `GarminError("network")`.
2. `res.warnings` are plain strings; the UI marks a part "Partly loaded" by the prefix `daily|sleep|hrv|activities`. A structured `{ step, message }` would be sturdier.
3. The "Show the dashboard" button stays enabled when nothing is selected. The UI only shows a hint; consider disabling it.
4. `hasDashy()` reaches into `app.plugins` through a cast. A public API or a `manifest` check would remove the cast.
5. `syncRecent` shows raw `e.message` in a Notice. It should use the same friendly mapping by error kind as the wizard.
6. The saved key is only checked at step 1; an expired key is found out at step 2. Fine as is, noted for completeness.
