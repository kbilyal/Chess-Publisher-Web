import re
import sys
from pathlib import Path

desktop, output = map(Path, sys.argv[1:])
html = (desktop / "ChessPublisher.html").read_text(encoding="utf-8-sig")


def replace_once(text, before, after):
    if text.count(before) != 1:
        raise SystemExit(f"Expected exactly one desktop hook: {before[:100]}")
    return text.replace(before, after, 1)


# Windows behavior stays in the pinned source. Only the browser artifact gets
# an account-scoped storage namespace and an authoritative local engine adapter.
html = re.sub(r"\b(?:window\.)?localStorage\.", "window.cpWebStorage.", html)
html = html.replace('return location.protocol==="http:" && location.hostname==="127.0.0.1";', "return false;")
html = html.replace("indexedDB.open(", "window.cpWebDatabase.open(")
html = html.replace("indexedDB.deleteDatabase(", "window.cpWebDatabase.deleteDatabase(")
html = replace_once(html, "  bootApplication().catch(err=>{", "  if(!window.cpDesktopWebAllowed) return;\n  bootApplication().catch(err=>{")
html = replace_once(
    html, 'if(location.protocol!=="http:" || location.hostname!=="127.0.0.1"){',
    'if(!window.cpDesktopWebEngine && (location.protocol!=="http:" || location.hostname!=="127.0.0.1")){',
)
html = replace_once(
    html, "async function fetchLocalEngine(path,options={},retries=0){",
    "async function fetchLocalEngine(path,options={},retries=0){\n  if(window.cpDesktopWebEngine) return window.cpDesktopWebEngine(path,options);",
)
html = replace_once(
    html, "const managedFileRequired=!!force && !!saveContext?.name;",
    "const managedFileRequired=!!force && !!saveContext?.name && !window.cpDesktopWebAllowed;",
)
html = replace_once(
    html, "if(!force && !idbOk && !localOk && !managedFileOk)",
    "if((!force || window.cpDesktopWebAllowed) && !idbOk && !localOk && !managedFileOk)",
)
html = replace_once(
    html, "data={currentTournament:name,tournaments:{[name]:tournament},preferences:",
    "data={currentTournament:name,tournaments:{...(data?.tournaments||{}),[name]:tournament},preferences:",
)
html = replace_once(html, "<head>", '<head>\n<script src="./host.js"></script>')
adapters = [
    "hub/client/hub-snapshot.js",
    "hub/client/hub-api-client.js",
    "webview/HubAdapter.js",
    "cloud/client/cloud-workspace-api.js",
    "webview/CloudWorkspaceAdapter.js",
    "webview/CloudWorkspaceRedesign.js",
]
for relative in adapters:
    js = (desktop / relative).read_text(encoding="utf-8-sig")
    js = re.sub(r"\b(?:window\.)?localStorage\.", "window.cpWebStorage.", js)
    js = js.replace('if(u.protocol==="http:"', 'if(!window.cpDesktopWebAllowed&&u.protocol==="http:"')
    if relative == "webview/HubAdapter.js":
        js = replace_once(js, "window.chrome.webview.postMessage(payload);", "window.__cpBrowserHostBridge.postMessage(payload);")
        js = replace_once(js, 'window.chrome.webview.addEventListener("message",event=>{', 'window.__cpBrowserHostBridge.addEventListener("message",event=>{')
    target = output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(js, encoding="utf-8")

scripts = "\n".join(f'<script src="./{relative}"></script>' for relative in adapters)
html = replace_once(
    html, "\n</body>\n</html>",
    "\n" + scripts + '\n<script src="./engine-adapter.js"></script>\n<link rel="stylesheet" href="./workspace.css">\n</body>\n</html>',
)
(output / "workspace.html").write_text(html, encoding="utf-8")
(output / "USER-MANUAL-EN.html").write_bytes((desktop / "USER-MANUAL-EN.html").read_bytes())
(output / "LICENSE.txt").write_bytes((desktop / "LICENSE").read_bytes())
