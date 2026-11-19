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
html = replace_once(
    html, """    <div id="tabDgt" class="tab" onclick="showTab('dgt',this)">DGT Boards</div>\n""", "",
)
dgt_start = "    <!-- DGT FOUNDATION / HARDWARE DIAGNOSTICS ONLY -->"
dgt_end = "    <!-- CHESS-RESULTS -->"
if html.count(dgt_start) != 1 or html.count(dgt_end) != 1:
    raise SystemExit("Unable to locate the desktop DGT Boards page.")
start = html.index(dgt_start)
end = html.index(dgt_end, start)
html = html[:start] + html[end:]
html = replace_once(html, ' dgt:"tabDgt",', "")
html = replace_once(
    html, "function showTab(id,button){",
    'function showTab(id,button){\n  if(id==="dgt"){id="main";button=document.getElementById("tabMain");}',
)
autosave_control = re.compile(r'      <label class="autosave-switch"[^\n]+</label>')
if len(autosave_control.findall(html)) != 1:
    raise SystemExit("Expected one desktop Autosave switch.")
html = autosave_control.sub(
    '      <span id="cpWebCloudSaveStatus" role="status">Cloud autosave on</span>', html, count=1,
)
html = replace_once(
    html, '    autosaveEnabled=pref===null ? true : pref!=="0";', "    autosaveEnabled=true;",
)
html = replace_once(
    html, "function cpCapturePersistentSaveJob(showStatus=false,force=false){",
    """function cpCapturePersistentSaveJob(showStatus=false,force=false){
  const cloud = window.ChessPublisherCloudSyncInternals;
  if(cloud) for(const tournament of Object.values(data?.tournaments||{})) cloud.ensureCloudMeta(tournament);""",
)
html = replace_once(
    html, '    if((!force || window.cpDesktopWebAllowed) && !idbOk && !localOk && !managedFileOk) throw new Error("All available save locations failed.");',
    """    if((!force || window.cpDesktopWebAllowed) && !idbOk && !localOk && !managedFileOk) throw new Error("All available save locations failed.");
    if(globalSnapshotCurrent && (idbOk || localOk || managedFileOk)) window.cpWebQueueAutosave?.(snapshot);""",
)
html = replace_once(
    html, 'if(savedNewTournament&&typeof window.cpCloudSyncCurrent==="function"){',
    'if(savedNewTournament&&!window.cpDesktopWebAllowed&&typeof window.cpCloudSyncCurrent==="function"){',
)
html = replace_once(
    html, 'if(typeof window.cpCloudSyncCurrent==="function"){\n    setTimeout(()=>window.cpCloudSyncCurrent',
    'if(!window.cpDesktopWebAllowed&&typeof window.cpCloudSyncCurrent==="function"){\n    setTimeout(()=>window.cpCloudSyncCurrent',
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
    if relative == "webview/CloudWorkspaceAdapter.js":
        js = replace_once(js, 'try{return window.cpWebStorage.getItem(AUTO_SYNC_KEY)!=="0";}catch(_){return true;}', "return true;")
        js = replace_once(js, 'renderAccount();renderCurrent();startPersistenceMonitor();', 'renderAccount();renderCurrent();')
        js = replace_once(js, 'if(startupSweepDone||!autoSyncEnabled())return;', 'if(window.cpWebQueueAutosave||startupSweepDone||!autoSyncEnabled())return;')
        js = replace_once(
            js, 'async function syncTournamentByName(name,{force=false,quiet=false,allowPull=!quiet}={}){',
            'async function syncTournamentByName(name,{force=false,quiet=false,allowPull=!quiet,savedTournament}={}){',
        )
        js = replace_once(
            js, 'if(name===currentName()&&typeof unified==="function"',
            'if(!savedTournament&&name===currentName()&&typeof unified==="function"',
        )
        js = replace_once(
            js, 'const snapshot=cloudScopedSnapshot(name,tournament);',
            'const snapshot=cloudScopedSnapshot(name,savedTournament?{...savedTournament,cloud:{...meta}}:tournament);',
        )
        js = replace_once(
            js, 'const contentHash=await tournamentContentHash(name,tournament);',
            'const contentHash=savedTournament?await snapshotContentHash(snapshot):await tournamentContentHash(name,tournament);',
        )
        js = replace_once(js, '    window.cpCloudSyncAllLocal=syncAllLocal;',
            '    window.cpCloudSyncAllLocal=syncAllLocal;\n    window.cpWebBackupTournament=(name,savedTournament)=>syncTournamentByName(name,{quiet:true,allowPull:false,savedTournament});')
    target = output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(js, encoding="utf-8")

scripts = "\n".join(f'<script src="./{relative}"></script>' for relative in adapters)
html = replace_once(
    html, "\n</body>\n</html>",
    "\n" + scripts + '\n<script src="./engine-adapter.js"></script>\n<script src="./autosave.js"></script>\n<link rel="stylesheet" href="./workspace.css">\n</body>\n</html>',
)
(output / "workspace.html").write_text(html, encoding="utf-8")
(output / "USER-MANUAL-EN.html").write_bytes((desktop / "USER-MANUAL-EN.html").read_bytes())
(output / "LICENSE.txt").write_bytes((desktop / "LICENSE").read_bytes())
