(()=>{
  "use strict";

  // web.chess-publisher.org is currently served behind Fastly/GitHub Pages, so
  // /api/chess-results/* on that origin is not intercepted by Cloudflare and
  // returns HTTP 405. Call the already deployed Worker directly; it still
  // enforces WEB_ORIGIN CORS and validates the same Organizer Token server-side.
  const API_PREFIX="https://chess-publisher-chess-results.kyamranbilyal.workers.dev/api/chess-results/";
  const desktopWeb=typeof window.cpDesktopWebOrganizerToken==="function";
  const proofStorage=desktopWeb?window.cpWebStorage:localStorage;
  const ORGANIZER_SECRET_KEY="organizer-primary";
  const OWNERSHIP_PREFIX="cp:chess-results:ownership:";
  const CONTINUITY_KEY="cpweb.refresh.continuity.v1";
  const TAB_BUTTONS=Object.freeze({
    dgt:"tabDgt",
    main:"tabMain",
    registration:"tabRegistration",
    pairings:"tabPairings",
    standings:"tabStandings",
    exportPage:"tabExport",
    schedule:"tabSchedule",
    chessresults:"tabChessResults",
    cloudWorkspace:"tabCloudWorkspace"
  });
  const aliases=Object.freeze({
    "test":"test","getsid":"test","get-sid":"test",
    "create":"create","getkey":"create","get-key":"create",
    "claim":"claim","recover":"claim","adopt":"claim",
    "publish":"publish","upload":"publish","uploadxml":"publish",
    "admin-link":"admin-link","admin":"admin-link","upload-link":"admin-link",
    "delete-authorize":"delete-authorize","delete":"delete-authorize",
    "unlink":"unlink"
  });

  function text(value){return value==null?"":String(value).trim();}
  function operationFromPath(path){
    let pathname="";
    try{pathname=new URL(String(path||""),window.location.origin).pathname.toLowerCase();}
    catch(_){pathname=String(path||"").split("?")[0].toLowerCase();}
    const last=pathname.split("/").filter(Boolean).pop()||"";
    const operation=aliases[last]||"";
    if(!operation)throw new Error("Unsupported Chess-Results backend operation.");
    return operation;
  }

  function proofKey(key){return OWNERSHIP_PREFIX+String(key||"").trim();}
  function readProof(key){
    if(!/^\d+$/.test(String(key||"")))return "";
    try{return String(proofStorage.getItem(proofKey(key))||"");}catch(_){return "";}
  }
  function saveProof(key,proof){
    if(!/^\d+$/.test(String(key||""))||!proof)return;
    try{proofStorage.setItem(proofKey(key),String(proof));}catch(_){}
  }
  function removeProof(key){try{proofStorage.removeItem(proofKey(key));}catch(_){}}

  function currentTournament(){
    try{return typeof window.getCurrentTournament==="function"?window.getCurrentTournament():null;}catch(_){return null;}
  }
  function cloudTournamentId(payload={}){
    const tournament=currentTournament();
    return text(payload.cloudTournamentId||tournament?.cloud?.cloudTournamentId||tournament?.online?.cloudTournamentId||tournament?.hub?.cloudTournamentId);
  }
  function currentClientId(payload={}){
    const tournament=currentTournament();
    return text(payload.clientId||tournament?.chessResults?.clientId||tournament?.cloud?.localKey||"");
  }

  // A Chess-Results TNR is permanently bound to the Real/Test mode used when
  // GETKEY assigned it. The desktop shell already fails closed if that mode is
  // changed later. On Web, however, a stale DOM value or a cloud/open transition
  // could be written by saveAll() before the check and create a false mismatch.
  // Keep the assigned TNR mode authoritative until Reset Tournament clears the
  // key/mode pair; a genuine type change must therefore go through Reset first.
  function linkedTnrBinding(){
    const tournament=currentTournament();
    const key=text(tournament?.chessResults?.key);
    const mode=text(tournament?.chessResults?.mode).toLowerCase();
    if(!/^\d+$/.test(key)||(mode!=="real"&&mode!=="test"))return null;
    return {tournament,key,mode};
  }

  function enforceLinkedTnrMode(source="web"){
    const binding=linkedTnrBinding();
    if(!binding)return {locked:false,changed:false,key:"",mode:""};
    const {tournament,key,mode}=binding;
    if(!tournament.settings||typeof tournament.settings!=="object")tournament.settings={};
    const select=document.getElementById("tournamentType");
    let changed=false;
    if(text(tournament.settings.tournamentType).toLowerCase()!==mode){
      tournament.settings.tournamentType=mode;
      changed=true;
    }
    if(select&&"value" in select&&text(select.value).toLowerCase()!==mode){
      select.value=mode;
      changed=true;
    }
    if(select){
      try{select.setAttribute("data-cp-tnr-mode-lock",mode);}catch(_){}
      try{select.title=`TNR ${key} is locked to ${mode==="real"?"Real tournament":"Test tournament"}. Reset Tournament before changing type.`;}catch(_){}
    }
    window.__cpChessResultsLastModeLock={locked:true,changed,key,mode,source,at:Date.now()};
    return {locked:true,changed,key,mode};
  }

  function installLinkedTnrModeLock(){
    const protectedSaveAll=window.saveAll;
    if(typeof protectedSaveAll==="function"&&!protectedSaveAll.__cpChessResultsTnrModeLock){
      const wrappedSaveAll=function(...args){
        enforceLinkedTnrMode("saveAll");
        return protectedSaveAll.apply(this,args);
      };
      wrappedSaveAll.__cpChessResultsTnrModeLock=true;
      window.saveAll=wrappedSaveAll;
    }

    document.addEventListener("change",event=>{
      const target=event?.target;
      if(!target||target.id!=="tournamentType")return;
      const requested=text(target.value).toLowerCase();
      const repaired=enforceLinkedTnrMode("tournamentType-change");
      if(repaired.locked&&requested!==repaired.mode){
        try{event.preventDefault();}catch(_){}
        try{
          if(typeof window.setChessResultsUiMessage==="function"){
            window.setChessResultsUiMessage(`TNR ${repaired.key} is already assigned as ${repaired.mode==="real"?"Real tournament":"Test tournament"}. Use Reset Tournament before changing type.`,"warn");
          }
        }catch(_){}
      }
    },true);

    setTimeout(()=>enforceLinkedTnrMode("startup"),0);
  }

  async function organizerToken(){
    if(desktopWeb)return text(window.cpDesktopWebOrganizerToken());
    try{
      if(typeof window.cpNativeHubSecretGet==="function"){
        const token=String(await window.cpNativeHubSecretGet(ORGANIZER_SECRET_KEY)||"").trim();
        if(token)return token;
      }
    }catch(_){}
    try{
      for(const key of [
        "cp:web-dev:secret:organizer-primary",
        "cpweb.organizerToken.session",
        "cpstudio.organizerToken.session",
        "cpweb.organizerToken.remembered",
        "cpstudio.organizerToken.remembered"
      ]){
        const storage=key.includes("remembered")?localStorage:sessionStorage;
        const token=String(storage.getItem(key)||"").trim();
        if(token)return token;
      }
    }catch(_){}
    return "";
  }

  async function post(operation,payload,token){
    let response;
    try{
      const signal=typeof AbortSignal!=="undefined"&&typeof AbortSignal.timeout==="function"?AbortSignal.timeout(45000):undefined;
      response=await fetch(API_PREFIX+operation,{
        method:"POST",
        mode:"cors",
        headers:{
          "Content-Type":"application/json;charset=utf-8",
          "Accept":"application/json",
          "Authorization":`Bearer ${token}`
        },
        body:JSON.stringify(payload||{}),
        cache:"no-store",
        credentials:"omit",
        ...(signal?{signal}:{})
      });
    }catch(error){
      if(error?.name==="TimeoutError"||error?.name==="AbortError"){
        throw new Error("Chess-Results request timed out. Check your connection and retry; your TNR binding is preserved.");
      }
      throw new Error("Chess-Results backend not connected. The secure Worker route is unavailable.");
    }
    let result={};
    try{result=await response.json();}catch{}
    if(response.status===404&&!result.code)throw new Error("Chess-Results backend not connected. The secure Worker route is unavailable.");
    if(!response.ok||!result.ok){
      const error=new Error(result.message||result.error||"Chess-Results service HTTP "+response.status);
      error.code=result.code;
      throw error;
    }
    return result;
  }

  function desktopContract(operation,result){
    if(operation!=="delete-authorize")return result;
    const adminUrl=text(result?.adminUrl||result?.url);
    return {
      ...result,
      canDelete:result?.canDelete===true||result?.verifiedOwner===true,
      adminUrl,
      alreadyDeleted:result?.alreadyDeleted===true
    };
  }

  async function recoverOwnership(key,payload,token){
    const cloudId=cloudTournamentId(payload);
    const result=await post("claim",{
      key,
      cloudTournamentId:cloudId,
      clientId:currentClientId(payload)
    },token);
    if(!result.ownershipProof)throw new Error("The secure Worker did not return a recovered TNR ownership proof.");
    saveProof(key,result.ownershipProof);
    return result.ownershipProof;
  }

  async function request(path,body=null){
    const operation=operationFromPath(path);
    const token=await organizerToken();
    if(!token)throw new Error("Organizer Token is not connected. Connect it first in Online & Cloud.");

    enforceLinkedTnrMode(`backend-${operation}`);
    const payload=body&&typeof body==="object"&&!Array.isArray(body)?{...body}:{};
    const tournament=currentTournament();
    if(!payload.key&&!payload.tnr){
      const linked=text(tournament?.chessResults?.key||tournament?.settings?.tnr);
      if(/^\d+$/.test(linked))payload.key=linked;
    }
    const key=String(payload.key||payload.tnr||"").trim();

    const ownershipRequired=!["test","create","claim"].includes(operation)&&/^\d+$/.test(key);
    if(ownershipRequired&&!payload.ownershipProof){
      payload.ownershipProof=readProof(key)||await recoverOwnership(key,payload,token);
    }

    let result;
    try{
      result=await post(operation,payload,token);
    }catch(error){
      if(!ownershipRequired||!["OWNERSHIP_PROOF_EXPIRED","OWNERSHIP_PROOF_INVALID","TNR_OWNERSHIP_MISMATCH"].includes(error.code))throw error;
      removeProof(key);
      payload.ownershipProof=await recoverOwnership(key,payload,token);
      result=await post(operation,payload,token);
    }
    const resultKey=String(result.key||key||"").trim();
    if((operation==="create"||operation==="claim")&&/^\d+$/.test(resultKey)&&result.ownershipProof)saveProof(resultKey,result.ownershipProof);
    if(operation==="unlink"&&result.canUnlink&&/^\d+$/.test(resultKey))removeProof(resultKey);
    return desktopContract(operation,result);
  }

  window.chessResultsLocalJson=request;

  async function openAuthenticatedPage(section){
    const key=text(window.chessResultsState?.()?.key);
    if(!/^\d+$/.test(key))return;
    const label=section==="upload"?"Upload Data":"Admin";
    let popup;
    try{
      popup=window.open("about:blank","_blank");
      if(!popup)throw new Error("Allow pop-ups for this site and try again.");
      popup.opener=null;
      const result=await request("/chessresults/admin-link",{
        key,section,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      const url=new URL(result.url||"about:blank");
      const upload=section==="upload";
      const path=upload?"/UploadData.aspx":"/Stammdaten.aspx";
      const params=url.searchParams;
      const encrypted=/^[A-Fa-f0-9]{32}$/;
      if(url.origin!=="https://chess-results.com"||url.pathname!==path||params.get(upload?"tnr":"key1")!==key||
        !encrypted.test(params.get(upload?"sid":"tnr_sec"))||!encrypted.test(params.get(upload?"sid1":"luser_sec"))||
        (upload&&(params.get("source")!=="21"||params.get("lan")!=="0"||!/^\d{14}$/.test(params.get("time"))))){
        throw new Error("Chess-Results returned an invalid "+label+" link.");
      }
      if(popup.closed)throw new Error("The Chess-Results tab was closed.");
      popup.location.replace(url.href);
      window.chessResultsLog?.("Opened Chess-Results "+label+" for TNR "+key+".","ok");
      window.setChessResultsUiMessage?.("Chess-Results "+label+" opened in a new tab.","ok");
    }catch(error){
      popup?.close();
      const message=error?.message||"Chess-Results link could not be opened.";
      window.chessResultsLog?.(label+": "+message,"error");
      window.setChessResultsUiMessage?.(label+": "+message,"error");
    }
  }

  if(!window.chrome?.webview?.postMessage){
    window.openChessResultsAdminPage=()=>openAuthenticatedPage("admin");
    window.openChessResultsUploadPage=()=>{
      if(!desktopWeb&&!text(window.chessResultsState?.()?.key)&&typeof window.createChessResultsTournament==="function"){
        return (async()=>{
          await window.createChessResultsTournament();
          await openAuthenticatedPage("upload");
        })();
      }
      return openAuthenticatedPage("upload");
    };
    if(desktopWeb){
      window.deleteChessResultsTournament=()=>openAuthenticatedPage("admin");
      const deleteButton=document.getElementById("crXmlDeleteRemoteButton");
      if(deleteButton)deleteButton.textContent="Manage remote deletion";
      const deleteOtherButton=document.getElementById("crXmlDeleteOtherButton");
      if(deleteOtherButton)deleteOtherButton.hidden=true;
    }
  }

  let continuityDisabled=false;
  let continuityRestoring=false;

  function activeTabId(){
    const active=document.querySelector(".tabs .tab.active");
    if(!active)return "";
    const onclick=String(active.getAttribute("onclick")||"");
    const match=/showTab\(['\"]([^'\"]+)/.exec(onclick);
    return text(match?.[1]);
  }

  function saveContinuity(){
    if(continuityDisabled){
      try{sessionStorage.removeItem(CONTINUITY_KEY);}catch(_){}
      return;
    }
    const tournament=currentTournament();
    if(!tournament)return;
    const cloudId=text(tournament?.cloud?.cloudTournamentId||tournament?.online?.cloudTournamentId||tournament?.hub?.cloudTournamentId);
    const localName=text(window.data?.currentTournament);
    if(!cloudId&&!localName)return;
    const state={cloudId,localName,tab:activeTabId()||"main",savedAt:Date.now()};
    try{sessionStorage.setItem(CONTINUITY_KEY,JSON.stringify(state));}catch(_){}
  }

  function clearContinuity(){
    continuityDisabled=true;
    try{sessionStorage.removeItem(CONTINUITY_KEY);}catch(_){}
  }

  function readContinuity(){
    try{
      const raw=sessionStorage.getItem(CONTINUITY_KEY);
      if(!raw)return null;
      const state=JSON.parse(raw);
      if(!state||typeof state!=="object")return null;
      if(!text(state.cloudId)&&!text(state.localName))return null;
      return state;
    }catch(_){return null;}
  }

  function restoreTab(tab){
    const id=text(tab);
    const buttonId=TAB_BUTTONS[id];
    const button=buttonId?document.getElementById(buttonId):null;
    if(!button||typeof window.showTab!=="function")return false;
    try{window.showTab(id,button);return true;}catch(_){return false;}
  }

  async function restoreContinuity(){
    if(continuityRestoring||continuityDisabled)return;
    const state=readContinuity();
    if(!state)return;
    const token=await organizerToken();
    if(!token)return;
    continuityRestoring=true;
    const start=document.getElementById("cpBeta7Start");
    if(start)start.style.display="none";
    try{
      if(text(state.cloudId)){
        if(typeof window.cpCloudOpenTournament!=="function")throw new Error("Cloud open not ready");
        await window.cpCloudOpenTournament(text(state.cloudId),{skipLocalPreSync:true});
      }else if(text(state.localName)){
        if(typeof window.changeTournament!=="function")throw new Error("Local tournament open not ready");
        await window.changeTournament(text(state.localName));
      }
      enforceLinkedTnrMode("continuity-restore");
      continuityDisabled=false;
      setTimeout(()=>restoreTab(state.tab),80);
      setTimeout(saveContinuity,200);
    }catch(_){
      continuityRestoring=false;
      if(start)start.style.display="";
      return;
    }
    continuityRestoring=false;
  }

  function installRefreshContinuity(){
    document.addEventListener("click",event=>{
      const target=event.target instanceof Element?event.target.closest("#cpBeta7Back,#cpBeta7CloudRefresh,#cpBeta7SignOut"):null;
      if(target){clearContinuity();return;}
      const tab=event.target instanceof Element?event.target.closest(".tabs .tab"):null;
      if(tab)setTimeout(saveContinuity,0);
    },true);
    window.addEventListener("pagehide",saveContinuity);
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")saveContinuity();});

    const startRestore=()=>{
      let attempts=0;
      const timer=setInterval(()=>{
        attempts++;
        if(!readContinuity()){clearInterval(timer);return;}
        if(typeof window.cpCloudOpenTournament==="function"||typeof window.changeTournament==="function"){
          clearInterval(timer);
          void restoreContinuity();
          return;
        }
        if(attempts>=80)clearInterval(timer);
      },100);
    };
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",startRestore,{once:true});
    else setTimeout(startRestore,0);
  }

  installLinkedTnrModeLock();
  if(!desktopWeb)installRefreshContinuity();

  window.__cpChessResultsBrowserAdapter={
    enabled:true,
    transport:"cors-worker-direct",
    backendPrefix:API_PREFIX,
    organizerScoped:true,
    ownershipProof:true,
    crossDeviceTnrRecovery:true,
    recoveryAuthority:"server-verified-tnr-registration",
    linkedTnrModeLock:true,
    linkedTnrModeAuthority:"chessResults.mode-until-reset",
    refreshContinuity:!desktopWeb,
    refreshContinuityStorage:"sessionStorage",
    secretsInBrowser:false
  };
})();
