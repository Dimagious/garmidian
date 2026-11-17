# Garmy video overview: storyboard

Length 2:09. English, voice of Dmitry (ElevenLabs clone, see the memory note `elevenlabs-voice-clone`), burned-in subtitles. Demo data, except scene 5: the author's own `Garmy/data` (day notes only, no diary), rebuilt in English in a test vault. Published 2026-11-17: https://youtu.be/iQwe1YdaFCE
Pace of the voice: about 2.5 words a second. Every scene below has its words counted against its time.

## Scenes

### 1. What it is (0:00 to 0:20)
Footage: `film-library` first cards, then one finished dashboard page.
> Garmy builds a Garmin dashboard inside Obsidian from your own data. No export files, no third-party service. You paste one key from Garmin, and Garmy builds the dashboard from your sleep, steps, heart rate and training.

### 2. The key (0:20 to 0:55)
Footage: the picture of Garmin's Personal API Key page that is built into the wizard (`media/help-key.png`), then the wizard's first step. No real Garmin Connect screen.
> Garmin gives every account a Personal API key. It lives in Garmin Connect, under Settings, Personal API Key. You accept the terms, pick how long the key should live, and copy it. Garmin shows it only once, so paste it into Garmy right away. The key stays in Obsidian's secret storage, and requests go straight to Garmin.

### 3. Check and load (0:55 to 1:25)
Footage: `film-wizard` key step, "Check and continue", period picker, "Days loaded".
> Garmy asks Garmin whether the key works before it moves on. Then you choose how many days to load. A year of history takes about seventeen requests. Steps, sleep, heart rate variability, Body Battery, and every run, ride and swim come through the official API.

### 4. Pick a dashboard (1:25 to 2:10)
Footage: `film-library` scrolled card by card; the greyed-out card with its "Needs ..." line.
> Garmy does not build one dashboard. It offers a library of eleven. A morning glance, sleep, recovery, steps, a page for each sport, triathlon, a race build, weekly and monthly reviews, and the year. Pick by the question you have. Did I sleep enough? Am I ready for the race? If your data is missing for a card, it is greyed out and says what it waits for. A sport you never do is not offered at all.

### 5. The result (2:10 to 2:55)
Footage: a finished dashboard in Obsidian: cards, chart, heatmap, the month goal bar. Slow scroll.
> The result is an ordinary note. Garmy draws it with Dashy, another plugin of mine: a few lines of text become cards, charts, a year heatmap and a progress bar. Dashy is free and sits in the same catalog. Garmy needs version 2.2.0 or newer and checks that before it writes the note. The month goal is worked out from your usual month, not typed by me.

### 6. Change your mind (2:55 to 3:20)
Footage: `film-rebuild` (dashboard grows), `film-languages` (language switch), miles mode.
> If you change your mind, rebuild and you get a fresh dashboard. Kilometres or miles, the plugin follows your choice. The wizard comes in seven languages.

### 7. Install and limits (3:20 to 3:45)
Footage: Obsidian Community plugins search for Garmy; site guides page.
> Garmy is in the community catalog, free and open source. Search for Garmy in Community plugins and install it. Install Dashy the same way, then run Build a Garmin dashboard. The guides on the site walk through every step. Link in the description.

## Footage plan

| Scene | Source | Status |
|---|---|---|
| 1, 4, 6 | existing GIF tours (`film-library`, `film-rebuild`, `film-languages`) | exist, but GIF at 760 to 1000 px; re-record as video at 1920 px |
| 2, 3 | `film-wizard`, `media/help-key.png` | same |
| 5 | e2e capture of a finished dashboard, slow scroll | new |
| 7 | Obsidian catalog search | new, by hand or a mock |

How to record: Playwright records the Obsidian window (the e2e harness, `TOUR=1`), cursor made visible, pacing set per scene. Each scene is a clip; clip length is stretched or cut to the length of its voice line.

## Pipeline

1. `scripts/video/narrate.sh`: each scene's text goes to ElevenLabs (voice `4LJpYO1gDX6eFy9WbMpZ`, key from Keychain), one MP3 per scene.
2. Record each scene clip in the harness; measure the MP3 length with `ffprobe`.
3. `ffmpeg`: fit the clip to the voice, add subtitles from the same text, concatenate, add a quiet music bed at -25 dB.
4. Output `out/garmy-overview.mp4` (1920x1080, 30 fps) and `out/garmy-overview.srt`.

When a new version changes the wizard, steps 2 to 4 are run again.

## Decided (2026-11-16)

1. Length stays 3:40.
2. No remark about the phone in scene 7.
3. Quiet music bed.
4. Title and thumbnail are drafted after the cut.

Recording opens Obsidian windows, so it starts on Dmitry's signal.
