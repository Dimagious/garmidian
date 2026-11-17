#!/usr/bin/env bash
# Voice every scene of docs/video/storyboard.md with the cloned voice and write one MP3 per scene to out/video/voice.
# The ElevenLabs key is read from the Keychain (service "elevenlabs") and never printed.
# Usage: scripts/video/narrate.sh [scene numbers...]   (no arguments: all scenes)
set -euo pipefail

cd "$(dirname "$0")/../.."
VOICE_ID="${ELEVENLABS_VOICE_ID:-4LJpYO1gDX6eFy9WbMpZ}"
MODEL="${ELEVENLABS_MODEL:-eleven_multilingual_v2}"
OUT="out/video/voice"
mkdir -p "$OUT"

KEY="$(security find-generic-password -s elevenlabs -a "$USER" -w)" || { echo "no ElevenLabs key in the Keychain (service elevenlabs)" >&2; exit 1; }

# scene number<TAB>text, from the "### N." headings and the "> " lines under them
scenes="$(python3 - <<'PY'
import re
n, buf, out = None, [], []
for line in open("docs/video/storyboard.md", encoding="utf-8"):
    m = re.match(r"### (\d+)\.", line)
    if m:
        if n and buf: out.append((n, " ".join(buf)))
        n, buf = m.group(1), []
    elif n and line.startswith("> "):
        buf.append(line[2:].strip())
    elif line.startswith("## ") and n and buf:
        out.append((n, " ".join(buf))); n, buf = None, []
if n and buf: out.append((n, " ".join(buf)))
for k, t in out: print(f"{k}\t{t}")
PY
)"

want=" $* "
while IFS=$'\t' read -r n text; do
  [ -z "$n" ] && continue
  if [ -n "$*" ] && [[ "$want" != *" $n "* ]]; then continue; fi
  file="$OUT/scene-$n.mp3"
  body="$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "model_id": sys.argv[2], "voice_settings": {"stability": 0.6, "similarity_boost": 0.85}}))' "$text" "$MODEL")"
  code="$(curl -s -o "$file" -w '%{http_code}' -X POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE_ID?output_format=mp3_44100_128" \
    -H "xi-api-key: $KEY" -H "Content-Type: application/json" -d "$body")"
  if [ "$code" != "200" ]; then echo "scene $n: HTTP $code" >&2; cat "$file" >&2; rm -f "$file"; exit 1; fi
  dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$file")"
  printf 'scene %s: %.1f s, %d characters\n' "$n" "$dur" "${#text}"
done <<< "$scenes"
