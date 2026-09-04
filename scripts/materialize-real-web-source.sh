#!/usr/bin/env bash
set -euo pipefail

DEST="${1:-production-web/source}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

SOURCE_ID="1BNZX-fqwTPf1vXbKLO3WEQcJ8zaH0OwD"
SOURCE_SHA256="0a5bf6896fdeacc029e262427434ba13eb5300f7df5bc3f3c8f55e1f47a48eff"
INDEX_SHA256="701b2bfcbef99cf0a8e052ad1c16b2a1fd5b891d5285cf688a1775ad3ce57654"
ARCHIVE="$TMP/real-web-source.tar.xz"

if ! python -c 'import gdown' >/dev/null 2>&1; then
  python -m pip install --disable-pip-version-check --quiet gdown
fi

verify_archive() {
  [[ -s "$ARCHIVE" ]] || return 1
  local actual
  actual="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
  [[ "$actual" == "$SOURCE_SHA256" ]]
}

DOWNLOAD_OK=0
rm -f "$ARCHIVE"
if python -m gdown "https://drive.google.com/uc?id=${SOURCE_ID}" -O "$ARCHIVE" && verify_archive; then
  DOWNLOAD_OK=1
fi

if [[ "$DOWNLOAD_OK" -eq 0 ]]; then
  rm -f "$ARCHIVE"
  if curl -L --fail --retry 3 --retry-delay 2 \
    "https://drive.usercontent.google.com/download?id=${SOURCE_ID}&export=download&confirm=t" \
    -o "$ARCHIVE" && verify_archive; then
    DOWNLOAD_OK=1
  fi
fi

if [[ "$DOWNLOAD_OK" -eq 0 ]]; then
  rm -f "$ARCHIVE"
  if curl -L --fail --retry 3 --retry-delay 2 \
    "https://drive.google.com/uc?export=download&confirm=t&id=${SOURCE_ID}" \
    -o "$ARCHIVE" && verify_archive; then
    DOWNLOAD_OK=1
  fi
fi

if [[ "$DOWNLOAD_OK" -ne 1 ]]; then
  echo "ERROR: Could not download the exact source-only Chess-Publisher Web package with expected SHA256 ${SOURCE_SHA256}." >&2
  exit 1
fi

echo "${SOURCE_SHA256}  ${ARCHIVE}" | sha256sum -c -
rm -rf "$DEST"
mkdir -p "$DEST"
tar -xJf "$ARCHIVE" -C "$DEST"

check_file() {
  local rel="$1"
  local expected="$2"
  test -f "$DEST/$rel"
  echo "${expected}  ${DEST}/${rel}" | sha256sum -c -
}

check_file "index.html" "$INDEX_SHA256"
check_file "web/browser-dev-host.js" "7f9720eafbbe9fcfbb718db257cccfdbade9ab7395023c7d6403499a27cb4d42"
check_file "hub/client/hub-snapshot.js" "d980c520d74a71e66b3a3aa2a54e5ed626ea3618c53159145f9e48b445effac9"
check_file "hub/client/hub-api-client.js" "2311446a69c16a14e041dbf08d4e198280d3a3f1232b739bf8e089d8ffdac9f0"
check_file "webview/HubAdapter.js" "5f3b1efb12ee3e5c4cb11088a4e4c58ce52cca840111611dbfdbdf10088749f7"
check_file "cloud/client/cloud-workspace-api.js" "0ff4483577cedb98509071c7745437fdde2059838eb3ce81f420091f0d9959b9"
check_file "webview/CloudWorkspaceAdapter.js" "97daec406256518c86d860df4ca31cf95916154220052772cde7037c23da26c9"

test -f "$DEST/CNAME"
test "$(cat "$DEST/CNAME")" = "web.chess-publisher.org"
grep -q 'cpProductionWeb' "$DEST/index.html"
grep -q 'Chess-Publisher' "$DEST/index.html"
node --check "$DEST/web/browser-dev-host.js"
node --check "$DEST/hub/client/hub-snapshot.js"
node --check "$DEST/hub/client/hub-api-client.js"
node --check "$DEST/webview/HubAdapter.js"
node --check "$DEST/cloud/client/cloud-workspace-api.js"
node --check "$DEST/webview/CloudWorkspaceAdapter.js"

echo "Materialized exact Chess-Publisher Web production source at: $DEST"
