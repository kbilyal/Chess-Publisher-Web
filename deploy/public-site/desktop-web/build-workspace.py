import hashlib
import re
import sys
from pathlib import Path

desktop, output = map(Path, sys.argv[1:])
html = (desktop / "ChessPublisher.html").read_text(encoding="utf-8-sig")


def replace_once(text, before, after):
    if text.count(before) != 1:
        raise SystemExit(f"Expected exactly one desktop hook: {before[:100]}")
    return text.replace(before, after, 1)


def asset_version(filename):
    asset = output / filename
    if not asset.is_file():
        return ""
    return "?v=" + hashlib.sha256(asset.read_bytes()).hexdigest()[:10]


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
html = replace_once(
    html, '''onclick="printFinalStandingsTxt()">TXT Print</button>''',
    '''onclick="openStandingsTxtExportDialog()">Export TXT</button>''',
)

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
    'function showTab(id,button){\n  if(id==="dgt"||id==="hub"||id==="cloudWorkspace"){id="main";button=document.getElementById("tabMain");}',
)
autosave_control = re.compile(r'      <label class="autosave-switch"[^\n]+</label>')
if len(autosave_control.findall(html)) != 1:
    raise SystemExit("Expected one desktop Autosave switch.")
html = autosave_control.sub(
    '      <span id="cpWebCloudSaveStatus" role="status">Cloud autosave on</span>\n'
    '      <button id="cpWebHeaderSyncBtn" type="button" class="cp-header-sync-btn" title="SYNC the current tournament with private Cloud and download validated Web-entered results" aria-label="Sync now">↻ Sync</button>',
    html,
    count=1,
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
# Pairings uses the same Cloud lock as the organizer list to avoid competing PUTs.
html = replace_once(
    html, 'const result=await window.cpCloudDownloadWebResults();',
    'const result=await window.cpWebRunCloudExclusive(()=>window.cpCloudDownloadWebResults());',
)
html = replace_once(
    html,
    '  saveData();\n  populatePairingsRoundMenu();\n  setVal("pairingsRound",String(round));\n  t.pairings.round=String(round);',
    '  saveData();\n  if(window.cpDesktopWebAllowed) setTimeout(()=>{ window.cpWebFlushPairingNow?.(); },0);\n  populatePairingsRoundMenu();\n  setVal("pairingsRound",String(round));\n  t.pairings.round=String(round);',
)
html = replace_once(
    html,
    '    const count=Math.max(0,Number(result?.applied)||0);',
    '''    if(result?.conflict){
      setStatus(getLanguage()==="bg"?"\\u041a\\u043e\\u043d\\u0444\\u043b\\u0438\\u043a\\u0442 \\u0432 Cloud \\u0438\\u0437\\u0438\\u0441\\u043a\\u0432\\u0430 \\u0440\\u0430\\u0437\\u0440\\u0435\\u0448\\u0430\\u0432\\u0430\\u043d\\u0435 \\u043f\\u0440\\u0435\\u0434\\u0438 \\u0442\\u0435\\u0433\\u043b\\u0435\\u043d\\u0435 \\u043d\\u0430 \\u0440\\u0435\\u0437\\u0443\\u043b\\u0442\\u0430\\u0442\\u0438.":"Cloud conflict must be resolved before pairing.");
      if(typeof appAlert==="function") await appAlert("Resolve the Cloud conflict before generating the next round.","SYNC","warning");
      return;
    }
    const count=Math.max(0,Number(result?.applied)||0);''',
)
html = replace_once(
    html, '    try{window.cpWebStorage.setItem(STORAGE_KEY,JSON.stringify(data));}catch(err){console.warn("Core local save after rename failed:",err);}',
    """    try{window.cpWebStorage.setItem(STORAGE_KEY,JSON.stringify(data));}catch(err){console.warn("Core local save after rename failed:",err);}
    if(window.cpDesktopWebAllowed){ cpStateRevision++; await writePersistentState(false,true); }""",
)
html = replace_once(
    html,
    '      if(state)state.textContent="Organizer Token is not connected on this installation.";\n      if(body)body.innerHTML=\'<tr><td colspan="4" class="muted">Connect the Organizer Token once to access your online tournaments.</td></tr>\';',
    '      if(state)state.textContent="Sign in with Google to access your online tournaments.";\n      if(body)body.innerHTML=\'<tr><td colspan="4" class="muted">Sign in with Google to access your online tournaments.</td></tr>\';',
)
html = replace_once(
    html,
    '"No online tournaments are stored for this Organizer Token."',
    '"No online tournaments are saved for this Google account."',
)
html = replace_once(
    html, '  if(window.__cpOnlineCloudBusy){\n    const state=document.getElementById("cpNewOnlineState");if(state)state.textContent="Another Online & Cloud operation is still running.";\n    return false;\n  }',
    """  await window.cpWebWaitAutosaveIdle?.();
  if(window.__cpOnlineCloudBusy){
    const state=document.getElementById("cpNewOnlineState");if(state)state.textContent="Another Cloud sync operation is still running.";
    return false;
  }""",
)
html = replace_once(
    html,
    """function openOnlineCloudFromNewDialog(){
  const modal=document.getElementById("createScreen");if(modal){modal.style.display="none";modal.setAttribute("aria-hidden","true");}
  const tab=document.getElementById("tabHub");if(tab&&typeof showTab==="function")showTab("hub",tab);
  setTimeout(()=>document.getElementById("hubOrganizerToken")?.focus(),120);
}""",
    """function openOnlineCloudFromNewDialog(){
  const modal=document.getElementById("createScreen");if(modal){modal.style.display="none";modal.setAttribute("aria-hidden","true");}
  location.assign("./");
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
html = replace_once(
    html, "<head>", '<head>\n<script src="./host.js"></script>\n<script src="./fide-cache.js"></script>',
)
html = replace_once(
    html,
    """  const sources=[
    {name:"FIDE official",url:FIDE_OFFICIAL_URLS[type]},
    {name:"GitHub mirror",url:FIDE_MIRROR_URLS[type]}
  ];""",
    """  const fideRelayBase=String(window.CP_API_BASE||"https://api.chess-publisher.org").replace(/\\/+$/,"");
  const fideRelayFiles={std:"standard_rating_list.zip",rapid:"rapid_rating_list.zip",blitz:"blitz_rating_list.zip"};
  const sources=[
    {name:"FIDE official (Hub relay)",url:`${fideRelayBase}/api/v1/fide/${fideRelayFiles[type]}`},
    {name:"FIDE official",url:FIDE_OFFICIAL_URLS[type]},
    {name:"GitHub mirror",url:FIDE_MIRROR_URLS[type]}
  ];""",
)

# Store bounded records inside one IndexedDB transaction so Chromium can
# persist a complete FIDE download without losing the active-generation swap.
html = replace_once(
    html,
    "async function cacheGet(key){const db=await openFideCacheDb();return await new Promise((resolve,reject)=>"
    "{const tx=db.transaction(FIDE_CACHE_STORE,'readonly');const req=tx.objectStore(FIDE_CACHE_STORE).get(key);"
    "req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error('Rating-list cache read failed.'));});}",
    "async function cacheGet(key){return window.cpWebFideCache.read(await openFideCacheDb(), FIDE_CACHE_STORE, key);}",
)
html = replace_once(
    html,
    """  await new Promise((resolve,reject)=>{
    const tx=db.transaction(FIDE_CACHE_STORE,'readwrite');
    const store=tx.objectStore(FIDE_CACHE_STORE);
    store.put(snapshot,generationKey);
    store.put(pointer,ACTIVE_KEY);
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error||new Error('Atomic rating-list generation swap failed.'));
    tx.onabort=()=>reject(tx.error||new Error('Atomic rating-list generation swap aborted.'));
  });""",
    "  await window.cpWebFideCache.write(db, FIDE_CACHE_STORE, generationKey, snapshot, {key:ACTIVE_KEY, pointer});",
)
html = replace_once(
    html,
    "  await new Promise((resolve,reject)=>{const tx=db.transaction(FIDE_CACHE_STORE,'readwrite');"
    "tx.objectStore(FIDE_CACHE_STORE).put(current,pointer.generationKey);tx.oncomplete=()=>resolve(true);"
    "tx.onerror=()=>reject(tx.error||new Error('Rating-list generation save failed.'));});",
    "  await window.cpWebFideCache.write(db, FIDE_CACHE_STORE, pointer.generationKey, current);",
)
html = replace_once(
    html,
    "function syncWorker(){clearDirectorySearchCache();return false;}",
    """function syncWorker(){
  clearDirectorySearchCache();
  window.cpBeta98R7?.invalidateRatingSearch();
  return false;
}""",
)
html = replace_once(
    html,
    "return rememberDirectorySearch(key,rows.slice(0,limit));",
    """const results=rows.slice(0,limit);
    if(results.length&&directorySearchInFlight.get(key)===task)rememberDirectorySearch(key,results);
    return results;""",
)
html = replace_once(
    html,
    "finally{directorySearchInFlight.delete(key);}",
    "finally{if(directorySearchInFlight.get(key)===task)directorySearchInFlight.delete(key);}",
)
# The installed app has a LocalEngine directory. For an ID missing from the
# browser's monthly list, the web workspace can resolve the same exact ID online.
html = replace_once(
    html,
    "    const monthly=fideMainDb.get(id);if(monthly)return [cloneRow(monthly)];\n",
    """    const monthly=fideMainDb.get(id);if(monthly)return [cloneRow(monthly)];
    if(window.cpDesktopWebAllowed){
      try{
        const response=await fetch(`https://lichess.org/api/fide/player/${encodeURIComponent(id)}`,{
          headers:{Accept:'application/json'},signal:AbortSignal.timeout(6000),referrerPolicy:'no-referrer'
        });
        if(!response.ok)return [];
        const player=await response.json();
        if(String(player?.id)!==id||typeof player.name!=='string'||!player.name.trim())return [];
        return [mergeDirectoryWithMonthly({
          fideId:id,name:player.name.trim(),fed:player.federation,gender:normalizePlayerGender(player.gender),
          birth:String(player.year??''),title:player.title,std:Number(player.standard)||0,
          rapid:Number(player.rapid)||0,blitz:Number(player.blitz)||0
        })];
      }catch(_){return [];}
    }
""",
)
# The unified search already merges imported lists. The older integration
# retries installation at startup and its second renderer can erase an exact hit.
html = replace_once(
    html,
    "if(typeof window.queueFideSearch==='function'&&!window.queueFideSearch.__cpQ117R2Wrapped){",
    "if(typeof window.queueFideSearch==='function'&&!window.queueFideSearch.__cpQ117R2Wrapped"
    "&&window.queueFideSearch!==window.cpBeta98R7?.queueUnifiedSearch){",
)
html = replace_once(
    html,
    "function configFingerprint(c=readConfig())",
    """let ratingSearchRevision=0;
function invalidateRatingSearch(){
  ratingSearchRevision++;
  unifiedCache.clear();
  if(txt(document.getElementById('fideSearch')?.value))queueUnifiedSearch();
}
function configFingerprint(c=readConfig())""",
)
html = replace_once(
    html,
    "const cat=await externalCatalogue(),extIds=activeExternalIds(c,cat),key=`${configFingerprint(c)}|${nameQ}|${limit}`;",
    """const cat=await externalCatalogue(),extIds=activeExternalIds(c,cat),revision=ratingSearchRevision;
  const key=`${configFingerprint(c)}|${revision}|${nameQ}|${limit}`;""",
)
html = replace_once(
    html,
    "return cachePut(key,merged.slice(0,Math.max(1,Math.min(60,limit))));",
    """const results=merged.slice(0,Math.max(1,Math.min(60,limit)));
  return (!officialWanted||official.length)&&revision===ratingSearchRevision?cachePut(key,results):results;""",
)
html = replace_once(
    html,
    "unifiedSearch,queueUnifiedSearch,openManager",
    "unifiedSearch,queueUnifiedSearch,invalidateRatingSearch,openManager",
)
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
            js, '    function log(message,kind="info"){\n      const box=document.getElementById("hubLog");\n      const line=`[${new Date().toLocaleTimeString("en-GB",{hour12:false})}] ${message}`;\n      if(box){box.value+=(box.value?"\\n":"")+line;box.scrollTop=box.scrollHeight;}\n      try{ if(typeof setStatus==="function") setStatus(message); }catch(_){}\n      if(kind==="error") console.error("Chess-Publisher Hub:",message);\n    }',
            '    function log(message,kind="info"){\n      try{ if(typeof setStatus==="function") setStatus(message); }catch(_){}\n      if(kind==="error") console.error("Chess-Publisher Hub:",message);\n    }',
        )
        js = replace_once(
            js, '    async function getOrganizerToken(){',
            '    window.cpWebOnAuthCleared?.(()=>{organizerTokenCache="";organizerInfo=null;});\n    async function getOrganizerToken(){',
        )
        js = replace_once(
            js, '    function setBusy(value,label=""){\n      busy=!!value;\n      document.querySelectorAll(\'#hub button[id^="hub"],#hub input[id^="hub"]\').forEach(el=>{\n        if(el.id==="hubOrganizerToken"&&busy)el.disabled=true;\n        else if(el.tagName==="BUTTON")el.disabled=busy;\n        else if(el.id==="hubOrganizerToken")el.disabled=false;\n      });\n      const busyLabel=document.getElementById("hubBusyLabel");\n      if(busyLabel)busyLabel.textContent=busy?(label||"Working…"):"";\n    }',
            '    function setBusy(value,label=""){\n      busy=!!value;\n      try{document.dispatchEvent(new CustomEvent("cp:hub-ui-updated",{detail:{busy,label}}));}catch(_){}\n    }',
        )
        js = replace_once(
            js, '    async function verifyOrganizer(){\n      return runBusy("Verifying organizer…",async()=>{\n        const field=document.getElementById("hubOrganizerToken");\n        let token=text(field?.value);\n        if(!token)token=await getOrganizerToken();\n        if(!token)throw new Error("Paste an Organizer Token first.");\n        const result=await api.organizerMe(token);\n        await window.cpNativeHubSecretSet(organizerSecretKey(),token);\n        organizerTokenCache=token;\n        organizerInfo=result.organizer||null;\n        if(field){field.value="";field.placeholder="Saved for this installation";}\n        log(`Organizer verified: ${organizerInfo?.displayName||organizerInfo?.id||"connected"}.`);\n        return result;\n      });\n    }\n\n    async function forgetOrganizer(){\n      if(busy)return;\n      await window.cpNativeHubSecretRemove(organizerSecretKey());\n      organizerTokenCache="";organizerInfo=null;\n      const field=document.getElementById("hubOrganizerToken");if(field){field.value="";field.placeholder="Paste Organizer Token";}\n      log("Organizer credential removed from this installation.");refreshUi();\n    }',
            '    async function verifyOrganizer(){\n      return runBusy("Verifying organizer…",async()=>{\n        const token=await getOrganizerToken();\n        if(!token)throw new Error("Sign in with Google first.");\n        const result=await api.organizerMe(token);\n        organizerTokenCache=token;\n        organizerInfo=result.organizer||null;\n        return result;\n      });\n    }\n\n    async function forgetOrganizer(){\n      organizerTokenCache="";organizerInfo=null;refreshUi();\n    }',
        )
        js = replace_once(
            js, '    async function runBusy(label,action){\n      if(busy||window.__cpOnlineCloudBusy)return;',
            '    async function runBusy(label,action){\n      await window.cpWebWaitAutosaveIdle?.();\n      if(busy||window.__cpOnlineCloudBusy)return;',
        )
        js = replace_once(
            js,
            '      if(el("hubOpenBtn"))el("hubOpenBtn").disabled=busyState||!publicUrl(meta)||del;\n      if(el("hubDeleteBtn"))el("hubDeleteBtn").disabled=busyState||!linked||del;\n      if(el("hubRestoreBtn"))el("hubRestoreBtn").disabled=busyState||!linked||!del;\n    }',
            '      if(el("hubOpenBtn"))el("hubOpenBtn").disabled=busyState||!publicUrl(meta)||del;\n      if(el("hubDeleteBtn"))el("hubDeleteBtn").disabled=busyState||!linked||del;\n      if(el("hubRestoreBtn"))el("hubRestoreBtn").disabled=busyState||!linked||!del;\n      try{document.dispatchEvent(new CustomEvent("cp:hub-ui-updated"));}catch(_){}\n    }',
        )
        js = js.replace('if(!token)throw new Error("Verify and save an Organizer Token first.");', 'if(!token)throw new Error("Sign in with Google first.");')
        js = js.replace('if(!organizerToken)throw new Error("Organizer credential is missing.");', 'if(!organizerToken)throw new Error("Sign in with Google first.");')
        js = js.replace('Tournament management credential is missing from this Windows profile.', 'Tournament management credential is missing for this browser session.')
        js = js.replace('Create/link the tournament in Online Hub first', 'Publish this tournament to Public Hub first')
        hub_inject_start = "    function injectUi(){"
        hub_inject_end = "    injectUi();\n  }catch(error){"
        if js.count(hub_inject_start) != 1 or js.count(hub_inject_end) != 1:
            raise SystemExit("Unable to locate HubAdapter.js injectUi() block.")
        h_start = js.index(hub_inject_start)
        h_end = js.index(hub_inject_end, h_start)
        js = js[:h_start] + """    function injectUi(){
      injectPairingsPublishButton();
      const setupUploadButton=document.getElementById("setupRegulationsUploadBtn");
      if(setupUploadButton&&!setupUploadButton.__cpHubBound){
        setupUploadButton.__cpHubBound=true;
        setupUploadButton.addEventListener("click",()=>chooseRegulationsFile("setup"));
      }
      const regulationsFileInput=document.getElementById("hubRegulationsFileInput");
      if(regulationsFileInput&&!regulationsFileInput.__cpHubBound){
        regulationsFileInput.__cpHubBound=true;
        regulationsFileInput.addEventListener("change",()=>{
          const file=regulationsFileInput.files?.[0];
          const source=regulationsFileInput.dataset.uploadSource||"hub";
          if(file)uploadRegulationsFile(file,source).catch(()=>{});
        });
      }
      for(const selectorId of ["mainTournamentSelect","registrationTournamentSelect","pairingsTournamentSelect","chessResultsTournamentSelect","standingsTournamentSelect","scheduleTournamentSelect","exportTournamentSelect"]){
        document.getElementById(selectorId)?.addEventListener("change",()=>setTimeout(refreshUi,0));
      }
      refreshUi();
      window.cpHubRefreshUi=refreshUi;
      window.cpHubPublishOnline=publishOnlineSmart;
      window.cpHubPublishCurrentTournament=publishCurrentTournament;
      window.cpHubOpenPublicPage=openPublicTournament;
      window.cpHubDeleteOnline=deleteOnlineTournament;
      window.cpHubRestoreOnline=restoreOnlineTournament;
      window.cpHubChooseRegulationsFile=chooseRegulationsFile;
      window.cpHubListOrganizerTournaments=async()=>{
        const token=await getOrganizerToken();
        if(!token)throw new Error("Sign in with Google first.");
        return api.listOrganizerTournaments(token);
      };
      window.cpHubGetState=()=>{
        const t=currentTournament();
        const meta=t?.hub||{};
        const regulationsFile=meta?.regulationsFile;
        const regulationsFileLabel=regulationsFile?.name?`${regulationsFile.name} (${formatBytes(regulationsFile.size)})`:"No regulations file uploaded.";
        return {
          hasTournament:!!t,
          tournamentName:currentTournamentName(t)||"",
          linked:!!text(meta.hubTournamentId),
          deleted:!!meta.deleted,
          publicSlug:text(meta.publicSlug),
          publicUrl:publicUrl(meta),
          revision:Math.max(0,Number(meta.revision)||0),
          hubTournamentId:text(meta.hubTournamentId),
          localKey:text(meta.localKey),
          regulationsFileLabel,
          busy:busy||!!window.__cpOnlineCloudBusy
        };
      };
      log("Public Hub publishing ready.");
    }

""" + js[h_end:]
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
            js, 'Another Online & Cloud operation is already running.',
            'Another Cloud sync operation is already running.',
        )
        js = replace_once(
            js, 'await appAlert(cloudErrorText(error),"Online & Cloud","error")',
            'await appAlert(cloudErrorText(error),"Cloud Sync","error")',
        )
        js = js.replace('Organizer Token is not connected.', 'Sign in with Google to synchronize with Cloud.')
        js = replace_once(
            js, '    window.cpCloudSyncAllLocal=syncAllLocal;',
            '    window.cpCloudSyncAllLocal=syncAllLocal;\n'
            '    window.cpWebBackupTournament=(name,savedTournament)=>syncTournamentByName(name,{quiet:true,allowPull:false,savedTournament});\n'
            '    window.cpCloudListRevisions=async id=>{const token=await getOrganizerToken();if(!token)throw new Error("Sign in with Google first.");return api.listRevisions(token,id);};\n'
            '    window.cpCloudRestoreRevision=restoreRevision;',
        )
        cwa_inject_start = "    function injectUi(){"
        cwa_inject_end = "    window.ChessPublisherCloudSyncInternals=Object.freeze({"
        if js.count(cwa_inject_start) != 1 or js.count(cwa_inject_end) != 1:
            raise SystemExit("Unable to locate CloudWorkspaceAdapter.js injectUi() block.")
        c_start = js.index(cwa_inject_start)
        c_end = js.index(cwa_inject_end, c_start)
        js = js[:c_start] + """    function injectUi(){
      try{
        if(data?.preferences?.activeTab==="cloudWorkspace"||data?.preferences?.activeTab==="hub"){
          data.preferences.activeTab="main";
          if(typeof saveData==="function")saveData();
        }
      }catch(_){ }
      for(const selectorId of ["mainTournamentSelect","registrationTournamentSelect","pairingsTournamentSelect","chessResultsTournamentSelect","standingsTournamentSelect","scheduleTournamentSelect","exportTournamentSelect"]){
        document.getElementById(selectorId)?.addEventListener("change",()=>setTimeout(renderCurrent,0));
      }
      renderAccount();renderCurrent();
      log("Private Cloud sync ready.");
    }

""" + js[c_end:]
    if relative == "webview/CloudWorkspaceRedesign.js":
        js = replace_once(
            js, '    async function getToken(){',
            '    window.cpWebOnAuthCleared?.(()=>{tokenCache="";});\n    async function getToken(){',
        )
        js = replace_once(
            js,
            'async function commitLocalTournament(oldName,tournament,{baseRevision,baseFingerprint,remoteChecksum',
            'async function commitLocalTournament(oldName,tournament,{expectedContentFingerprint,baseRevision,baseFingerprint,remoteChecksum',
        )
        js = replace_once(
            js,
            '''      if(oldName!==newName)delete data.tournaments[oldName];
      data.tournaments[newName]=clean;data.currentTournament=newName;
      try{if(typeof cpResetTournamentDocumentBinding==="function")cpResetTournamentDocumentBinding(newName,"cloud-directional-merge");}catch(_){ }
      try{if(typeof normalizeData==="function")normalizeData();}catch(_){ }''',
            '''      const originalData=data;
      const beforePull=expectedContentFingerprint?JSON.stringify(data):"";
      if(beforePull)data=JSON.parse(beforePull);
      if(oldName!==newName)delete data.tournaments[oldName];
      data.tournaments[newName]=clean;data.currentTournament=newName;
      if(beforePull){
        let normalizedData;
        try{
          if(typeof normalizeData==="function")normalizeData();
          normalizedData=data;
        }finally{data=originalData;}
        if(await localFingerprint(newName,normalizedData.tournaments[newName])!==expectedContentFingerprint){
          throw new Error("This Cloud snapshot changes during browser normalization. The local tournament and sync base were preserved.");
        }
        if(data!==originalData||JSON.stringify(data)!==beforePull){
          throw new Error("The local tournament changed during the pull. Retry SYNC.");
        }
        data=normalizedData;
      }
      try{if(typeof cpResetTournamentDocumentBinding==="function")cpResetTournamentDocumentBinding(newName,"cloud-directional-merge");}catch(_){ }
      if(!beforePull){try{if(typeof normalizeData==="function")normalizeData();}catch(_){ }}''',
        )
        js = replace_once(
            js,
            'const clean=await commitLocalTournament(name,imported,{baseRevision:remoteRevision,baseFingerprint:remoteHash,',
            'const clean=await commitLocalTournament(name,imported,{expectedContentFingerprint:remoteHash,baseRevision:remoteRevision,baseFingerprint:remoteHash,',
        )
        js = replace_once(
            js, '      const resolve=document.getElementById("cloudResolveConflictBtn");if(resolve)resolve.hidden=state!=="CONFLICT";\n      try{renderSimpleCloudControls();}catch(_){ }\n    }',
            '      const resolve=document.getElementById("cloudResolveConflictBtn");if(resolve)resolve.hidden=state!=="CONFLICT";\n      try{renderSimpleCloudControls();}catch(_){ }\n      try{document.dispatchEvent(new CustomEvent("cp:cloud-status-updated",{detail:{state,message:currentStatus.message,friendlyMessage:simpleCloudMessage(),remoteRevision:currentStatus.remoteRevision}}));}catch(_){ }\n    }',
        )
        js = replace_once(
            js, '          try{await resolveMissingBaseWholeTournament(side);overlay.remove();}',
            '          try{await (window.cpWebRunCloudExclusive?window.cpWebRunCloudExclusive(()=>resolveMissingBaseWholeTournament(side)):resolveMissingBaseWholeTournament(side));overlay.remove();}',
        )
        js = replace_once(
            js, 'if(btn.dataset.action==="save"){btn.disabled=true;try{await saveResolvedConflict(choices);overlay.remove();}',
            'if(btn.dataset.action==="save"){btn.disabled=true;try{await (window.cpWebRunCloudExclusive?window.cpWebRunCloudExclusive(()=>saveResolvedConflict(choices)):saveResolvedConflict(choices));overlay.remove();}',
        )
        js = js.replace('Organizer Token is not connected.', 'Sign in with Google to synchronize with Cloud.')
        cwr_install_start = "    function installUi(){"
        cwr_install_end = "    const oldOpen=window.cpCloudWorkspaceOpen;"
        if js.count(cwr_install_start) != 1 or js.count(cwr_install_end) != 1:
            raise SystemExit("Unable to locate CloudWorkspaceRedesign.js installUi() block.")
        r_start = js.index(cwr_install_start)
        r_end = js.index(cwr_install_end, r_start)
        js = js[:r_start] + """    function installUi(){
      for(const selectorId of ["mainTournamentSelect","registrationTournamentSelect","pairingsTournamentSelect","chessResultsTournamentSelect","standingsTournamentSelect","scheduleTournamentSelect","exportTournamentSelect"]){
        const selector=document.getElementById(selectorId);
        if(selector&&!selector.__cpIronCloudRender){
          selector.__cpIronCloudRender=true;
          selector.addEventListener("change",()=>setTimeout(renderSimpleCloudControls,0));
        }
      }
      renderSimpleCloudControls();
      return true;
    }

""" + js[r_end:]
        js = replace_once(
            js, '    window.cpCloudSyncCurrent=syncCurrent;',
            '    window.cpCloudSyncCurrent=syncCurrent;\n'
            '    window.cpCloudSyncUnifiedNow=()=>(window.cpWebRunCloudExclusive?window.cpWebRunCloudExclusive(()=>syncCurrentFromList()):syncCurrentFromList());\n'
            '    window.cpCloudOpenRowSafely=id=>(window.cpWebRunCloudExclusive?window.cpWebRunCloudExclusive(()=>openCloudRowSafely(id)):openCloudRowSafely(id));\n'
            '    window.cpCloudGetStatus=()=>({...currentStatus,friendlyMessage:simpleCloudMessage()});',
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

# The log stays in the result palette when Web moves the pairing actions to the toolbar.
html = replace_once(
    html, '            <div class="result-palette-title">',
    '''            <section class="cp-ws-card cp-ws-round-log result-palette-wide">
              <div class="cp-ws-card-header">
                <h2 id="cpWebRoundLogTitle" class="cp-ws-card-title">Round Control Log</h2>
              </div>
              <div id="roundControlLog" class="crlog-output" aria-live="polite" role="region" aria-labelledby="cpWebRoundLogTitle" tabindex="0"></div>
            </section>
            <div class="result-palette-title">''',
)
html = replace_once(
    html, '<div class="cp-log-title">ROUND CONTROL LOG</div><span class="cp-log-muted">',
    '<span class="cp-log-muted">',
)
html = replace_once(html, '      \'<div class="cp-log-title">ROUND CONTROL LOG</div>\'+\n', '')
# Keep the original pairing-time disable/restore guard after moving the button.
html = replace_once(
    html, "document.querySelectorAll('#pairings .result-palette button')",
    "document.querySelectorAll('#pairings .result-palette button, #pairings #pairingsResortStartingListBtn')",
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

# Fix Variable (2026) Buchholz/Sonneborn-Berger checker & label mapping and .tunx [68] TRF26 descriptors.
html = replace_once(
    html,
    r"""  if(text.includes("Buchholz Tie-Break")) return "BH";
  if(text.includes("Sonneborn-Berger")) return "SB";""",
    r"""  if(/Buchholz Tie-Break Variable \(2026\)/i.test(text)){
    const mod=typeof tieBreakModifierInfo==="function"?tieBreakModifierInfo(text):{strongest:0,weakest:0};
    const high=Math.max(0,Math.floor(Number(mod?.strongest)||0)),low=Math.max(0,Math.floor(Number(mod?.weakest)||0));
    if(high>0) return low===high?`BH/M${high}`:`BH/M${high}/C${low}`;
    return low>0?`BH/C${low}`:"BH";
  }
  if(text.includes("Buchholz Tie-Break")) return "BH";
  if(/Sonneborn(?:[- ]?)Berger Tie-Break Variable \(2026\)/i.test(text)){
    const mod=typeof tieBreakModifierInfo==="function"?tieBreakModifierInfo(text):{strongest:0,weakest:0};
    const high=Math.max(0,Math.floor(Number(mod?.strongest)||0)),low=Math.max(0,Math.floor(Number(mod?.weakest)||0));
    if(high>0) return low===high?`SB/M${high}`:`SB/M${high}/C${low}`;
    return low>0?`SB/C${low}`:"SB";
  }
  if(text.includes("Sonneborn-Berger") || text.includes("Sonneborn Berger")) return "SB";""",
)
html = replace_once(
    html,
    r"""    if(text.includes("victories (WIN)")) return withP("WIN");
    if(text.includes("games won (WON)")) return withP("WON");
    if(text.includes("games played with Black (BPG)")) return opt.countForfeits?cpTrfCustomDescriptor("BPG_P"):"BPG";
    if(text.includes("games won with Black (BWG)")) return opt.countForfeits?cpTrfCustomDescriptor("BWG_P"):"BWG";""",
    r"""    if(/(?:victories|Number of Wins) \(WIN\)/i.test(text)) return withP("WIN");
    if(/games won \(WON\)/i.test(text)) return withP("WON");
    if(/games played with Black \(BPG\)/i.test(text)) return opt.countForfeits?cpTrfCustomDescriptor("BPG_P"):"BPG";
    if(/games won with Black \(BWG\)/i.test(text)) return opt.countForfeits?cpTrfCustomDescriptor("BWG_P"):"BWG";""",
)
html = replace_once(
    html,
    r"""    if(id===84 || /\bBH\b|Buchholz/i.test(text)){
      const opt=typeof getTieBreakOptions==="function"?getTieBreakOptions(text):{countForfeits:false};
      let base="";
      if(/BH-C1|Buchholz Cut-1/i.test(text))base="BH/C1";
      else if(/BH-C2|Buchholz Cut-2/i.test(text))base="BH/C2";
      else if(/BH-M1|Median Buchholz(?! 2)|Median-1/i.test(text))base="BH/M1";
      else if(/BH-M2|Median Buchholz 2|Median-2/i.test(text))base="BH/M2";
      else if(/Buchholz Tie-Break|\bBH\b/i.test(text))base="BH";
      if(base) return opt.countForfeits?`${base}/P`:base;
    }

    if(id===85 || /\bSB\b|Sonneborn-Berger|Sonneborn Berger/i.test(text)){
      const opt=typeof getTieBreakOptions==="function"?getTieBreakOptions(text):{countForfeits:false};
      let base="";
      if(/SB-C1|Sonneborn-Berger Cut-1|Sonneborn Berger Cut-1/i.test(text))base="SB/C1";
      else if(/SB-C2|Sonneborn-Berger Cut-2|Sonneborn Berger Cut-2/i.test(text))base="SB/C2";
      else base="SB";
      return opt.countForfeits?`${base}/P`:base;
    }""",
    r"""    if(id===84 || /\bBH\b|Buchholz/i.test(text)){
      const opt=typeof getTieBreakOptions==="function"?getTieBreakOptions(text):{countForfeits:false};
      let base="";
      if(/Buchholz Tie-Break Variable \(2026\)/i.test(text)){
        const mod=typeof tieBreakModifierInfo==="function"?tieBreakModifierInfo(text):{strongest:0,weakest:0};
        const strongest=Math.max(0,Math.floor(Number(mod?.strongest)||0));
        const weakest=Math.max(0,Math.floor(Number(mod?.weakest)||0));
        if(strongest===0&&weakest===0)base="BH";
        else if(strongest===0&&weakest===1)base="BH/C1";
        else if(strongest===0&&weakest===2)base="BH/C2";
        else if(strongest===1&&weakest===1)base="BH/M1";
        else if(strongest===2&&weakest===2)base="BH/M2";
        else return "";
      }else if(/BH-C1|Buchholz Cut-1/i.test(text))base="BH/C1";
      else if(/BH-C2|Buchholz Cut-2/i.test(text))base="BH/C2";
      else if(/BH-M1|Median Buchholz(?! 2)|Median-1/i.test(text))base="BH/M1";
      else if(/BH-M2|Median Buchholz 2|Median-2/i.test(text))base="BH/M2";
      else if(/Buchholz Tie-Break|\bBH\b/i.test(text))base="BH";
      if(base) return opt.countForfeits?`${base}/P`:base;
    }

    if(id===85 || /\bSB\b|Sonneborn-Berger|Sonneborn Berger/i.test(text)){
      const opt=typeof getTieBreakOptions==="function"?getTieBreakOptions(text):{countForfeits:false};
      let base="";
      if(/Sonneborn(?:[- ]?)Berger Tie-Break Variable \(2026\)/i.test(text)){
        const mod=typeof tieBreakModifierInfo==="function"?tieBreakModifierInfo(text):{strongest:0,weakest:0};
        const strongest=Math.max(0,Math.floor(Number(mod?.strongest)||0));
        const weakest=Math.max(0,Math.floor(Number(mod?.weakest)||0));
        if(strongest===0&&weakest===0)base="SB";
        else if(strongest===0&&weakest===1)base="SB/C1";
        else if(strongest===0&&weakest===2)base="SB/C2";
        else return "";
      }else if(/SB-C1|Sonneborn-Berger Cut-1|Sonneborn Berger Cut-1/i.test(text))base="SB/C1";
      else if(/SB-C2|Sonneborn-Berger Cut-2|Sonneborn Berger Cut-2/i.test(text))base="SB/C2";
      else base="SB";
      return opt.countForfeits?`${base}/P`:base;
    }""",
)

# Clean up export button labels without changing any onclick handlers or functionality.
for before, after in (
    ('<button class="report-export-button" onclick="exportGeneralTxt()">TXT Print</button>', '<button class="report-export-button" onclick="exportGeneralTxt()">TXT</button>'),
    ('<button class="report-export-button" onclick="exportParticipantsTxt()">TXT Print</button>', '<button class="report-export-button" onclick="exportParticipantsTxt()">TXT</button>'),
    ('<button class="report-export-button" onclick="printSpecialPrizesTxt()">TXT Print</button>', '<button class="report-export-button" onclick="printSpecialPrizesTxt()">TXT</button>'),
    ('<button class="report-export-button" onclick="exportScheduleTxt()">TXT Print</button>', '<button class="report-export-button" onclick="exportScheduleTxt()">TXT</button>'),
    ('<button onclick="exportGeneralTxt()">General TXT Print</button>', '<button onclick="exportGeneralTxt()">General TXT</button>'),
    ('<button onclick="exportParticipantsTxt()">Participants TXT Print</button>', '<button onclick="exportParticipantsTxt()">Participants TXT</button>'),
    ('<button onclick="exportScheduleTxt()">Tournament Schedule TXT Print</button>', '<button onclick="exportScheduleTxt()">Tournament Schedule TXT</button>'),
    ('<button onclick="exportRegulationsTxt()">Regulations TXT Print</button>', '<button onclick="exportRegulationsTxt()">Regulations TXT</button>'),
    ('<button onclick="printReport(\'general\')">General PDF Design</button>', '<button onclick="printReport(\'general\')">General PDF</button>'),
    ('<button onclick="openStartingListExportDialog()">Starting List PDF Design</button>', '<button onclick="openStartingListExportDialog()">Starting List PDF</button>'),
    ('<button onclick="printReport(\'program\')">Tournament Schedule PDF Design</button>', '<button onclick="printReport(\'program\')">Tournament Schedule PDF</button>'),
    ('<button onclick="printReport(\'regulations\')">Regulations PDF Design</button>', '<button onclick="printReport(\'regulations\')">Regulations PDF</button>'),
):
    html = replace_once(html, before, after)

scripts = "\n".join(f'<script src="./{relative}"></script>' for relative in adapters)
reg_v = asset_version("registration-ui.js")
ws_js_v = asset_version("workspace-ui.js")
ws_css_v = asset_version("workspace.css")
html = replace_once(
    html, "\n</body>\n</html>",
    "\n" + scripts
    + '\n<script src="./chess-results-browser-adapter.js"></script>'
    + '\n<script src="./engine-adapter.js"></script>'
    + '\n<script src="./autosave.js"></script>'
    + f'\n<script src="./registration-ui.js{reg_v}"></script>'
    + f'\n<script src="./workspace-ui.js{ws_js_v}"></script>'
    + f'\n<link rel="stylesheet" href="./workspace.css{ws_css_v}">'
    + '\n<link rel="stylesheet" href="./pdf-export.css">'
    + '\n<script src="./pdf-export.js"></script>'
    + '\n</body>\n</html>',
)
(output / "workspace.html").write_text(html, encoding="utf-8")
(output / "USER-MANUAL-EN.html").write_bytes((desktop / "USER-MANUAL-EN.html").read_bytes())
(output / "LICENSE.txt").write_bytes((desktop / "LICENSE").read_bytes())
