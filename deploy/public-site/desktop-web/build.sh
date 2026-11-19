#!/usr/bin/env bash
set -euo pipefail

output="$(realpath -m "${1:?specify an output directory}")"
browser="$(realpath "${2:?specify a built browser engine directory}")"
source="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
commit=499af82e5074e2afd82e8304cdec91588db70823

git init -q "$work"
git -C "$work" fetch -q --depth 1 https://github.com/kbilyal/ChessPublisher.git "$commit"
git -C "$work" checkout -q --detach FETCH_HEAD
test "$(git -C "$work" rev-parse HEAD)" = "$commit"

mkdir -p "$output"
cp "$source/login.html" "$output/index.html"
cp "$source"/{login.css,login.mjs,host.js,engine-adapter.js,autosave.js,workspace.css} "$output/"
cp "$browser"/{pairing-format.mjs,pairing-worker.mjs} "$output/"
cp -R "$browser/runtime" "$output/runtime"
python "$source/build-workspace.py" "$work" "$output"
