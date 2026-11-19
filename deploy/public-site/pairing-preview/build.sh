#!/usr/bin/env bash
set -euo pipefail

output="$(realpath -m "${1:?specify an output directory}")"
source="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$output/runtime"
cp "$source"/{index.html,styles.css,app.mjs,pairing-format.mjs,pairing-worker.mjs,demo.trf} "$output/"

cd "$work"
npm pack --silent --registry=https://registry.npmjs.org pyodide@0.29.3
python -m pip download --disable-pip-version-check --index-url https://pypi.org/simple --no-deps networkx==3.7
python - <<'PY'
import base64
import hashlib
from pathlib import Path

assert base64.b64encode(hashlib.sha512(Path('pyodide-0.29.3.tgz').read_bytes()).digest()).decode() == (
    '22UBuhOJawj7vKUnS7/F3xK+515LJdjiMAHoCfuS6/PbHiOrSQVnYwDe+2sbVwiOZ3sMMexdXICew6NqOMQGgA=='
)
assert hashlib.sha256(Path('networkx-3.7-py3-none-any.whl').read_bytes()).hexdigest() == (
    'e3fd2c13a7814cee3746340d8d7f8598a67f16a58bf47fb7f8793fab6efca1b0'
)
PY

tar -xzf pyodide-0.29.3.tgz --strip-components=1 -C "$output/runtime" \
  package/pyodide.mjs package/pyodide.asm.js package/pyodide.asm.wasm package/pyodide-lock.json package/python_stdlib.zip
cp networkx-3.7-py3-none-any.whl "$output/runtime/networkx.whl"

commit=49b01e67ccb2f94945fa97b97ade66a35584b341
git init -q gacrux-source
git -C gacrux-source fetch -q --depth 1 https://github.com/OttoMilvang/TieBreakServer.git "$commit"
git -C gacrux-source checkout -q --detach FETCH_HEAD
test "$(git -C gacrux-source rev-parse HEAD)" = "$commit"
grep -q '__version__ = "1.11.65"' gacrux-source/gacrux/version.py
python - "$output/runtime/gacrux.zip" <<'PY'
from pathlib import Path
import sys
from zipfile import ZIP_DEFLATED, ZipFile

root = Path('gacrux-source')
with ZipFile(sys.argv[1], 'w', compression=ZIP_DEFLATED) as bundle:
    for source in sorted((root / 'gacrux').glob('*.py')):
        bundle.write(source, source.relative_to(root))
    bundle.write(root / 'LICENSE', 'GACRUX-LICENSE.txt')
PY
