#!/usr/bin/env bash
set -euo pipefail

DEST="${1:-production-web/source}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ZIP_ID="1dxRY0USNWo54tHMNunXpYi_hlyXfR-dI"
ZIP_SHA256="de2941e1c201cbf3f2513ac9c57fd032542d91b667489d60aa7abc884a75d3f2"
ROOT_NAME="Chess-Publisher-v1.06.00-beta.5-Cloud-Browser-Continuation-2026-09-03"
BASE_HTML_SHA256="f6427a3c2ade30ec2799bdbcbf69688a3247e969c6f03e82daf11901386f791a"
INDEX_SHA256="701b2bfcbef99cf0a8e052ad1c16b2a1fd5b891d5285cf688a1775ad3ce57654"

ZIP="$TMP/beta5.zip"

if ! python -c 'import gdown' >/dev/null 2>&1; then
  python -m pip install --disable-pip-version-check --quiet gdown
fi

DOWNLOAD_OK=0
if python -m gdown --fuzzy "https://drive.google.com/file/d/${ZIP_ID}/view?usp=sharing" -O "$ZIP"; then
  DOWNLOAD_OK=1
fi
if [[ "$DOWNLOAD_OK" -eq 0 ]]; then
  rm -f "$ZIP"
  if curl -L --fail --retry 3 --retry-delay 2 \
    "https://drive.usercontent.google.com/download?id=${ZIP_ID}&export=download&confirm=t" \
    -o "$ZIP"; then
    DOWNLOAD_OK=1
  fi
fi
if [[ "$DOWNLOAD_OK" -eq 0 ]]; then
  rm -f "$ZIP"
  if curl -L --fail --retry 3 --retry-delay 2 \
    "https://drive.google.com/uc?export=download&confirm=t&id=${ZIP_ID}" \
    -o "$ZIP"; then
    DOWNLOAD_OK=1
  fi
fi

if [[ "$DOWNLOAD_OK" -ne 1 || ! -s "$ZIP" ]]; then
  echo "ERROR: Could not download the exact Chess-Publisher beta.5 source package." >&2
  exit 1
fi

echo "${ZIP_SHA256}  ${ZIP}" | sha256sum -c -
mkdir -p "$TMP/unpack"
unzip -q "$ZIP" -d "$TMP/unpack"
SRC="$TMP/unpack/$ROOT_NAME"

test -f "$SRC/ChessPublisher.html"
echo "${BASE_HTML_SHA256}  ${SRC}/ChessPublisher.html" | sha256sum -c -

check_file() {
  local rel="$1"
  local expected="$2"
  test -f "$SRC/$rel"
  echo "${expected}  ${SRC}/${rel}" | sha256sum -c -
}

check_file "hub/client/hub-snapshot.js" "d980c520d74a71e66b3a3aa2a54e5ed626ea3618c53159145f9e48b445effac9"
check_file "hub/client/hub-api-client.js" "2311446a69c16a14e041dbf08d4e198280d3a3f1232b739bf8e089d8ffdac9f0"
check_file "webview/HubAdapter.js" "5f3b1efb12ee3e5c4cb11088a4e4c58ce52cca840111611dbfdbdf10088749f7"
check_file "cloud/client/cloud-workspace-api.js" "0ff4483577cedb98509071c7745437fdde2059838eb3ce81f420091f0d9959b9"
check_file "webview/CloudWorkspaceAdapter.js" "97daec406256518c86d860df4ca31cf95916154220052772cde7037c23da26c9"

test -f "$REPO_ROOT/production-web/browser-dev-host.js"
echo "7f9720eafbbe9fcfbb718db257cccfdbade9ab7395023c7d6403499a27cb4d42  $REPO_ROOT/production-web/browser-dev-host.js" | sha256sum -c -

rm -rf "$DEST"
mkdir -p "$DEST/web" "$DEST/hub/client" "$DEST/webview" "$DEST/cloud/client"

cp "$REPO_ROOT/production-web/browser-dev-host.js" "$DEST/web/browser-dev-host.js"
cp "$SRC/hub/client/hub-snapshot.js" "$DEST/hub/client/hub-snapshot.js"
cp "$SRC/hub/client/hub-api-client.js" "$DEST/hub/client/hub-api-client.js"
cp "$SRC/webview/HubAdapter.js" "$DEST/webview/HubAdapter.js"
cp "$SRC/cloud/client/cloud-workspace-api.js" "$DEST/cloud/client/cloud-workspace-api.js"
cp "$SRC/webview/CloudWorkspaceAdapter.js" "$DEST/webview/CloudWorkspaceAdapter.js"
printf '%s\n' 'web.chess-publisher.org' > "$DEST/CNAME"

python - "$SRC/ChessPublisher.html" "$DEST/index.html" <<'PY'
from pathlib import Path
import sys
src = Path(sys.argv[1]).read_bytes()
marker = b'</body>'
pos = src.rfind(marker)
if pos < 0:
    raise SystemExit('ERROR: </body> marker not found in canonical ChessPublisher.html')
bootstrap = b'''\n<!-- Chess-Publisher browser production bootstrap -->\n<script src="/web/browser-dev-host.js"></script>\n<script src="/hub/client/hub-snapshot.js"></script>\n<script src="/hub/client/hub-api-client.js"></script>\n<script src="/webview/HubAdapter.js"></script>\n<script src="/cloud/client/cloud-workspace-api.js"></script>\n<script src="/webview/CloudWorkspaceAdapter.js"></script>\n<script>document.documentElement.dataset.cpLinuxWebDev="1";document.documentElement.dataset.cpProductionWeb="1";</script>\n'''
Path(sys.argv[2]).write_bytes(src[:pos] + bootstrap + src[pos:])
PY

echo "${INDEX_SHA256}  ${DEST}/index.html" | sha256sum -c -

grep -q 'cpProductionWeb' "$DEST/index.html"
grep -q 'Chess-Publisher' "$DEST/index.html"
node --check "$DEST/web/browser-dev-host.js"
node --check "$DEST/hub/client/hub-snapshot.js"
node --check "$DEST/hub/client/hub-api-client.js"
node --check "$DEST/webview/HubAdapter.js"
node --check "$DEST/cloud/client/cloud-workspace-api.js"
node --check "$DEST/webview/CloudWorkspaceAdapter.js"

echo "Materialized exact Chess-Publisher Web production source at: $DEST"
