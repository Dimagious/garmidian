#!/usr/bin/env bash
# E2E setup. Idempotent. Builds Garmidian, links it into the pristine vault, and copies a Dashy build
# next to it (the wizard previews dashboards drawn by Dashy). Dashy is looked up in $DASHY_DIST
# (default ../dashsidian); it must be built there (main.js, manifest.json, styles.css).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OBSIDIAN_APP_ASAR="/Applications/Obsidian.app/Contents/Resources/app.asar"
VAULT_PRISTINE="${ROOT}/e2e-vault.pristine"
PLUGIN_ID="$(node -p "require('./manifest.json').id")"
PLUGIN_DIR="${VAULT_PRISTINE}/.obsidian/plugins/${PLUGIN_ID}"
DASHY_DIST="${DASHY_DIST:-${ROOT}/../dashsidian}"
DASHY_DIR="${VAULT_PRISTINE}/.obsidian/plugins/dashsidian"

if [[ ! -f "${OBSIDIAN_APP_ASAR}" ]]; then
  echo "Obsidian not found at ${OBSIDIAN_APP_ASAR}. Install Obsidian.app into /Applications first."
  exit 1
fi
for f in main.js manifest.json styles.css; do
  if [[ ! -f "${DASHY_DIST}/${f}" ]]; then
    echo "Dashy build not found: ${DASHY_DIST}/${f}. Build Dashy or set DASHY_DIST."
    exit 1
  fi
done

echo "Building Garmidian..."
npm run build > /dev/null

mkdir -p "${PLUGIN_DIR}" "${DASHY_DIR}"
for f in main.js manifest.json styles.css; do
  ln -sf "${ROOT}/${f}" "${PLUGIN_DIR}/${f}"
  cp "${DASHY_DIST}/${f}" "${DASHY_DIR}/${f}"
done

echo "E2E setup ready."
echo "  Pristine vault: ${VAULT_PRISTINE}"
echo "  Garmidian:      ${PLUGIN_DIR} (symlinks)"
echo "  Dashy:          ${DASHY_DIR} (copy from ${DASHY_DIST})"
