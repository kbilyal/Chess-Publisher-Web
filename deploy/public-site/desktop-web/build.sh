#!/usr/bin/env bash
set -euo pipefail

output="$(realpath -m "${1:?specify an output directory}")"
browser="$(realpath "${2:?specify a built browser engine directory}")"
source="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
commit=a12084883fa8bd84f09a678e53f288cf780060fa

git init -q "$work"
git -C "$work" fetch -q --depth 1 https://github.com/kbilyal/ChessPublisher.git "$commit"
git -C "$work" checkout -q --detach FETCH_HEAD
test "$(git -C "$work" rev-parse HEAD)" = "$commit"

mkdir -p "$output"
cp "$source/login.html" "$output/index.html"
cp "$source"/{login.css,login.mjs,host.js,fide-cache.js,engine-adapter.js,autosave.js,registration-ui.js,workspace-ui.js,workspace.css,pdf-export.js,pdf-export.css} "$output/"
cp "$source/../../../src/cloud/autoSaveSyncStore.js" "$output/auto-save-sync.js"
cp "$source/../../../production-web/web/chess-results-browser-adapter.js" "$output/"
cp "$browser"/{pairing-format.mjs,pairing-worker.mjs} "$output/"
cp -R "$browser/runtime" "$output/runtime"
python "$source/build-workspace.py" "$work" "$output"
node "$work/TESTS/TRF26-RATING-EXPORT.cjs" "$output/workspace.html"
CP_ELIGIBILITY_HTML="$output/workspace.html" node --test "$work/TESTS/FIDE-ELIGIBILITY-REGRESSION.js"
