#!/usr/bin/env bash
# Mastering of the narration: out/video/voice/scene-N.mp3 (the raw ElevenLabs files, about -32 LUFS) to
# out/video/voice-master/scene-N.mp3 at -16 LUFS. Each scene is levelled on its own so the scenes sound the same.
# Chain: cut the rumble under 90 Hz, soften peaks with a gentle compressor, lift the 3 kHz presence band that makes
# consonants clear, take off the harsh 7 kHz band, then loudness-normalise.
set -euo pipefail
cd "$(dirname "$0")/../.."

IN="out/video/voice"
OUT="out/video/voice-master"
mkdir -p "$OUT"

for file in "$IN"/scene-*.mp3; do
  name="$(basename "$file")"
  ffmpeg -v error -y -i "$file" \
    -af "highpass=f=90,acompressor=threshold=-24dB:ratio=3:attack=8:release=120:makeup=3,equalizer=f=3000:t=q:w=1.1:g=2.5,equalizer=f=7500:t=q:w=1.5:g=-2,loudnorm=I=-16:TP=-1.5:LRA=6" \
    -ar 44100 -b:a 256k "$OUT/$name"
  printf '%s: ' "$name"
  ffmpeg -hide_banner -i "$OUT/$name" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+I:|Peak:" | tr -s ' ' | tr '\n' ' '
  echo
done
