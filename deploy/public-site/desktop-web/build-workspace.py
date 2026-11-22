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
dialog = re.search(
    r'<!-- NEW TOURNAMENT / OPEN EXISTING -->.*?<style id="cpNewTournamentLayoutStyle">.*?</style>',
    html,
    re.DOTALL,
)
if not dialog:
    raise SystemExit("Unable to locate the desktop tournament dialog.")
html = replace_once(
    html, dialog.group(), Path(__file__).with_name("tournament-dialog.html").read_text(encoding="utf-8").rstrip(),
)
html = replace_once(
    html,
    '    const el=document.getElementById(id);el?.classList.remove("cp-selected");el?.setAttribute("aria-checked","false");',
    '    const el=document.getElementById(id);if(el)el.checked=false;',
)
html = replace_once(
    html,
    '    el?.classList.toggle("cp-selected",selected);el?.setAttribute("aria-checked",selected?"true":"false");',
    '    if(el)el.checked=selected;',
)
format_copy = re.search(
    r'  const title=document.getElementById\("cpNewTournamentKindTitle"\);.*?(?=  if\(options\?\.focusName)',
    html,
    re.DOTALL,
)
if not format_copy:
    raise SystemExit("Unable to locate the desktop tournament format labels.")
html = replace_once(html, format_copy.group(), "")
html = replace_once(
    html,
    '  document.getElementById("cpNewTournamentBackBtn")?.classList.add("hidden");\n  const map=',
    '''  document.getElementById("cpNewTournamentBackBtn")?.setAttribute("aria-pressed","true");
  document.getElementById("cpNewOnlineChoice")?.setAttribute("aria-pressed","false");
  const map=''',
)
html = replace_once(
    html,
    '  document.getElementById("cpNewTournamentBackBtn")?.classList.add("hidden");\n  document.getElementById("cpNewOnlineTokenHelp")',
    '  document.getElementById("cpNewOnlineTokenHelp")',
)
html = replace_once(html, '  cpNewTournamentKind="online";\n', "")
html = replace_once(
    html,
    '  document.getElementById("cpNewTournamentBackBtn")?.classList.remove("hidden");',
    '''  document.getElementById("cpNewTournamentBackBtn")?.setAttribute("aria-pressed","false");
  document.getElementById("cpNewOnlineChoice")?.setAttribute("aria-pressed","true");''',
)
html = replace_once(html, 'document.getElementById("cpNewSwissChoice")?.focus()', 'document.getElementById("cpNewLocalChoice")?.focus()')

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
    html, "    sequence:++cpPersistenceSequence,\n    revision:cpStateRevision,\n    showStatus:!!showStatus,\n    force:!!force,\n    snapshot,\n    saveContext,\n    capturedAt:new Date().toISOString()",
    """    sequence:++cpPersistenceSequence,
    revision:cpStateRevision,
    showStatus:!!showStatus,
    force:!!force,
    snapshot,
    saveContext,
    skipCloudAutosave:!!(window.__cpWebSuppressAutosaveQueue>0),
    capturedAt:new Date().toISOString()""",
)
html = replace_once(
    html, '    if((!force || window.cpDesktopWebAllowed) && !idbOk && !localOk && !managedFileOk) throw new Error("All available save locations failed.");',
    """    if((!force || window.cpDesktopWebAllowed) && !idbOk && !localOk && !managedFileOk) throw new Error("All available save locations failed.");
    if(!job.skipCloudAutosave && globalSnapshotCurrent && (idbOk || localOk || managedFileOk)) window.cpWebQueueAutosave?.(snapshot);""",
)
html = replace_once(
    html, '    try{window.cpWebStorage.setItem(STORAGE_KEY,JSON.stringify(data));}catch(err){console.warn("Core local save after rename failed:",err);}',
    """    try{window.cpWebStorage.setItem(STORAGE_KEY,JSON.stringify(data));}catch(err){console.warn("Core local save after rename failed:",err);}
    if(window.cpDesktopWebAllowed){ cpStateRevision++; await writePersistentState(false,true); }""",
)
html = replace_once(
    html, '  if(window.__cpOnlineCloudBusy){\n    const state=document.getElementById("cpNewOnlineState");if(state)state.textContent="Another Online & Cloud operation is still running.";\n    return false;\n  }',
    """  await window.cpWebWaitAutosaveIdle?.();
  if(window.__cpOnlineCloudBusy){
    const state=document.getElementById("cpNewOnlineState");if(state)state.textContent="Another Online & Cloud operation is still running.";
    return false;
  }""",
)
html = replace_once(
    html, '    const opened=await window.cpCloudOpenTournament(id);',
    '    const opened=await (window.cpWebRunCloudExclusive ? window.cpWebRunCloudExclusive(()=>window.cpCloudOpenTournament(id)) : window.cpCloudOpenTournament(id));',
)
html = replace_once(
    html, 'if(savedNewTournament&&typeof window.cpCloudSyncCurrent==="function"){',
    'if(savedNewTournament&&!window.cpDesktopWebAllowed&&typeof window.cpCloudSyncCurrent==="function"){',
)
html = replace_once(
    html, 'if(typeof window.cpCloudSyncCurrent==="function"){\n    setTimeout(()=>window.cpCloudSyncCurrent',
    'if(!window.cpDesktopWebAllowed&&typeof window.cpCloudSyncCurrent==="function"){\n    setTimeout(()=>window.cpCloudSyncCurrent',
)
html = replace_once(
    html, 'chessResultsLog("No TNR was consumed by this failed attempt.","warn");',
    'chessResultsLog("No TNR was saved locally. Retry reuses the same tournament identity.","warn");',
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
        js = replace_once(
            js, '    async function runBusy(label,action){\n      if(busy||window.__cpOnlineCloudBusy)return;',
            '    async function runBusy(label,action){\n      await window.cpWebWaitAutosaveIdle?.();\n      if(busy||window.__cpOnlineCloudBusy)return;',
        )
    if relative == "webview/CloudWorkspaceAdapter.js":
        js = replace_once(js, 'try{return window.cpWebStorage.getItem(AUTO_SYNC_KEY)!=="0";}catch(_){return true;}', "return true;")
        js = replace_once(
            js, '    async function getOrganizerToken(){',
            '    window.cpWebOnAuthCleared?.(()=>{tokenCache="";organizerInfo=null;workspaceInfo=null;});\n    async function getOrganizerToken(){',
        )
        js = replace_once(
            js, """    async function persistCurrentSyncBaseDurably(tournament,before,message){
      if(tournament!==currentTournament()){""",
            """    async function persistWebSyncMeta(tournament,before,message){
      if(typeof writePersistentState!=="function"){
        restoreCommonBase(ensureCloudMeta(tournament),before);
        throw new Error(message||"Web storage checkpoint is unavailable.");
      }
      window.__cpWebSuppressAutosaveQueue=(window.__cpWebSuppressAutosaveQueue||0)+1;
      try{
        const saved=await writePersistentState(false,true);
        if(!saved){
          restoreCommonBase(ensureCloudMeta(tournament),before);
          throw new Error(message||"Web storage checkpoint failed.");
        }
        return true;
      }finally{
        window.__cpWebSuppressAutosaveQueue=Math.max(0,(window.__cpWebSuppressAutosaveQueue||0)-1);
      }
    }

    async function persistCurrentSyncBaseDurably(tournament,before,message){
      if(tournament!==currentTournament()){""",
        )
        js = replace_once(
            js, '    async function ensureRemoteTournament(token,name,tournament){',
            '    async function ensureRemoteTournament(token,name,tournament,{quietWeb=false}={}){',
        )
        js = replace_once(
            js, '          meta.ownerId=text(organizerInfo.id);\n          persistCloudMeta();',
            '          meta.ownerId=text(organizerInfo.id);\n          if(!quietWeb)persistCloudMeta();',
        )
        js = replace_once(
            js, '      if(!meta.cloudTournamentId)throw new Error("Cloud Workspace did not return a tournament ID.");\n      persistCloudMeta();',
            '      if(!meta.cloudTournamentId)throw new Error("Cloud Workspace did not return a tournament ID.");\n      if(!quietWeb)persistCloudMeta();',
        )
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
            js, '          const meta=await ensureRemoteTournament(token,name,tournament);',
            '          const meta=await ensureRemoteTournament(token,name,tournament,{quietWeb:!!savedTournament});',
        )
        js = replace_once(
            js, 'const snapshot=cloudScopedSnapshot(name,tournament);',
            'const snapshot=cloudScopedSnapshot(name,savedTournament?{...savedTournament,cloud:{...meta}}:tournament);',
        )
        js = replace_once(
            js, 'const contentHash=await tournamentContentHash(name,tournament);',
            'const contentHash=savedTournament?await snapshotContentHash(snapshot):await tournamentContentHash(name,tournament);',
        )
        js = replace_once(
            js, '              if(name===currentName()){\n                await persistCurrentSyncBaseDurably(tournament,before,"Desktop and Cloud already match, but the repaired schema-7 common base could not be saved to the managed tournament file.");\n              }else{\n                persistCloudMeta();\n              }',
            '              if(savedTournament){\n                await persistWebSyncMeta(tournament,before,"Desktop and Cloud already match, but the repaired schema-7 common base could not be saved locally.");\n              }else if(name===currentName()){\n                await persistCurrentSyncBaseDurably(tournament,before,"Desktop and Cloud already match, but the repaired schema-7 common base could not be saved to the managed tournament file.");\n              }else{\n                persistCloudMeta();\n              }',
        )
        js = replace_once(
            js, '          if(name===currentName()){\n            await persistCurrentSyncBaseDurably(\n              tournament,\n              before,\n              `Cloud accepted revision ${acceptedRevision}, but the new common base could not be saved to the managed tournament file. The Cloud revision is preserved; the next SYNC will repair the base from equal schema-7 content.`\n            );\n          }else{\n            persistCloudMeta();\n          }',
            '          if(savedTournament){\n            await persistWebSyncMeta(\n              tournament,\n              before,\n              `Cloud accepted revision ${acceptedRevision}, but the new common base could not be saved locally.`\n            );\n          }else if(name===currentName()){\n            await persistCurrentSyncBaseDurably(\n              tournament,\n              before,\n              `Cloud accepted revision ${acceptedRevision}, but the new common base could not be saved to the managed tournament file. The Cloud revision is preserved; the next SYNC will repair the base from equal schema-7 content.`\n            );\n          }else{\n            persistCloudMeta();\n          }',
        )
        js = replace_once(
            js, '    async function foreground(label,fn){\n      if(window.__cpOnlineCloudBusy){',
            '    async function foreground(label,fn){\n      await window.cpWebWaitAutosaveIdle?.();\n      if(window.__cpOnlineCloudBusy){',
        )
        js = replace_once(
            js, '    window.cpCloudSyncAllLocal=syncAllLocal;',
            '    window.cpCloudSyncAllLocal=syncAllLocal;\n    window.cpWebBackupTournament=(name,savedTournament)=>syncTournamentByName(name,{quiet:true,allowPull:false,savedTournament});')
        js = replace_once(
            js, """          if(id==="cloudWorkspace"){
            const hub=document.getElementById("tabHub");
            const result=originalShowTab.call(this,"hub",hub||button);
            setTimeout(()=>openWorkspace().catch(error=>console.warn("Cloud Workspace open:",error)),0);
            return result;
          }
          const result=originalShowTab.apply(this,arguments);
          if(id==="hub")setTimeout(()=>openWorkspace().catch(error=>console.warn("Cloud Workspace open:",error)),0);""",
            """          if(id==="cloudWorkspace"){
            const hub=document.getElementById("tabHub");
            const result=originalShowTab.call(this,"hub",hub||button);
            setTimeout(()=>(window.cpCloudWorkspaceOpen||openWorkspace)().catch(error=>console.warn("Cloud Workspace open:",error)),0);
            return result;
          }
          const result=originalShowTab.apply(this,arguments);
          if(id==="hub")setTimeout(()=>(window.cpCloudWorkspaceOpen||openWorkspace)().catch(error=>console.warn("Cloud Workspace open:",error)),0);""",
        )
    if relative == "webview/CloudWorkspaceRedesign.js":
        js = replace_once(
            js, '    async function getToken(){',
            '    window.cpWebOnAuthCleared?.(()=>{tokenCache="";});\n    async function getToken(){',
        )
        js = replace_once(
            js, '          try{await resolveMissingBaseWholeTournament(side);overlay.remove();}',
            '          try{await (window.cpWebRunCloudExclusive?window.cpWebRunCloudExclusive(()=>resolveMissingBaseWholeTournament(side)):resolveMissingBaseWholeTournament(side));overlay.remove();}',
        )
        js = replace_once(
            js, 'if(btn.dataset.action==="save"){btn.disabled=true;try{await saveResolvedConflict(choices);overlay.remove();}',
            'if(btn.dataset.action==="save"){btn.disabled=true;try{await (window.cpWebRunCloudExclusive?window.cpWebRunCloudExclusive(()=>saveResolvedConflict(choices)):saveResolvedConflict(choices));overlay.remove();}',
        )
        js = replace_once(
            js, '        sync.addEventListener("click",()=>syncCurrentFromList().catch(async error=>{',
            '        sync.addEventListener("click",()=>(window.cpWebRunCloudExclusive?window.cpWebRunCloudExclusive(()=>syncCurrentFromList()):syncCurrentFromList()).catch(async error=>{',
        )
        js = replace_once(
            js, '          openCloudRowSafely(btn.dataset.cloudId).catch(async error=>{',
            '          (window.cpWebRunCloudExclusive?window.cpWebRunCloudExclusive(()=>openCloudRowSafely(btn.dataset.cloudId)):openCloudRowSafely(btn.dataset.cloudId)).catch(async error=>{',
        )
    target = output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(js, encoding="utf-8")

html = replace_once(
    html, "function updateManagerButtons(){\n  const c=lateContext();\n  document.querySelectorAll('#cpR10RatingListManager button[data-r10-add]').forEach(btn=>{\n    btn.textContent=c.active?'Add Late Entry':'Add Player';",
    """function updateManagerButtons(){
  const buttons=document.querySelectorAll('#cpR10RatingListManager button[data-r10-add]');
  if(!buttons.length)return;
  const c=lateContext();
  const label=c.active?'Add Late Entry':'Add Player';
  buttons.forEach(btn=>{
    if(btn.textContent!==label)btn.textContent=label;""",
)

# Compact checker feedback while retaining the desktop failure diagnostics.
start = html.index("      checkerHtml+'<br>'+")
end = html.index("      (colorCorrectionHtml", start)
html = html[:start] + """      (() => {
        const tie = window.cpWebTieStatus?.();
        const issues = [];
        if (checkerState === "rejected" && checkerIsCurrent) issues.push(checkerHtml);
        if (tie && !["pass", "pending"].includes(tie)) issues.push(window.renderTieBreakCheckerLogHtml());
        if (issues.length) return issues.join("<br>")+"<br>";
        if (tie === "pending" || !checkerIsCurrent || checkerState !== "approved") return "";
        return '<span class="cp-log-ok">OK</span><br>';
      })()+
""" + html[end:]
html = replace_once(html, "  window.tieBreakCheckerAction=function()", """
  window.cpWebTieStatus = () => {
    if (!getCompletedRounds()) return null;
    const stored = currentStored();
    if (storedIsFresh(stored)) return stored.state;
    if (!runtime.busy && !runtime.autoTimer) scheduleAutoCheck(350);
    return "pending";
  };
  window.tieBreakCheckerAction=function()""")
html = replace_once(html, '      try{\n        if(runtime.state!=="ready"||runtime.busy)return;',
    '      runtime.autoTimer=null;\n      try{\n        if(runtime.state!=="ready"||runtime.busy)return;')
html = replace_once(html, '    }finally{runtime.busy=false;renderStatus();}\n  }\n\n  function scheduleAutoCheck',
    '    }finally{runtime.busy=false;renderStatus();window.cpRefreshRoundControlLog?.();}\n  }\n\n  function scheduleAutoCheck')

scripts = "\n".join(f'<script src="./{relative}"></script>' for relative in adapters)
html = replace_once(
    html, "\n</body>\n</html>",
    "\n" + scripts + '\n<script src="./chess-results-browser-adapter.js"></script>\n<script src="./engine-adapter.js"></script>\n<script src="./autosave.js"></script>\n<link rel="stylesheet" href="./workspace.css">\n</body>\n</html>',
)
(output / "workspace.html").write_text(html, encoding="utf-8")
(output / "USER-MANUAL-EN.html").write_bytes((desktop / "USER-MANUAL-EN.html").read_bytes())
(output / "LICENSE.txt").write_bytes((desktop / "LICENSE").read_bytes())
