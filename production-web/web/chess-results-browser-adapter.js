(()=>{
  "use strict";

  // web.chess-publisher.org is currently served behind Fastly/GitHub Pages, so
  // /api/chess-results/* on that origin is not intercepted by Cloudflare and
  // returns HTTP 405. Call the already deployed Worker directly; it still
  // enforces WEB_ORIGIN CORS and validates the same Organizer Token server-side.
  const API_PREFIX="https://chess-publisher-chess-results.kyamranbilyal.workers.dev/api/chess-results/";
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
    try{return String(localStorage.getItem(proofKey(key))||"");}catch(_){return "";}
  }
  function saveProof(key,proof){
    if(!/^\d+$/.test(String(key||""))||!proof)return;
    try{localStorage.setItem(proofKey(key),String(proof));}catch(_){}
  }
  function removeProof(key){try{localStorage.removeItem(proofKey(key));}catch(_){}}

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

  async function organizerToken(){
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
        credentials:"omit"
      });
    }catch(_){
      throw new Error("Chess-Results backend not connected. The secure Worker route is unavailable.");
    }
    let result={};
    try{result=await response.json();}catch{}
    if(response.status===404)throw new Error("Chess-Results backend not connected. The secure Worker route is unavailable.");
    if(!response.ok||!result.ok)throw new Error(result.message||result.error||`Chess-Results service HTTP ${response.status}`);
    return result;
  }

  async function recoverOwnership(key,payload,token){
    const cloudId=cloudTournamentId(payload);
    if(!cloudId){
      throw new Error(`TNR ${key} exists, but this browser has no synchronized tournament identity. Use Online & Cloud → Sync/Pull Changes first, then retry.`);
    }
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

    const payload=body&&typeof body==="object"&&!Array.isArray(body)?{...body}:{};
    const tournament=currentTournament();
    if(!payload.key&&!payload.tnr){
      const linked=text(tournament?.chessResults?.key||tournament?.settings?.tnr);
      if(/^\d+$/.test(linked))payload.key=linked;
    }
    const key=String(payload.key||payload.tnr||"").trim();

    if(operation!=="test"&&operation!=="create"&&operation!=="claim"&&/^\d+$/.test(key)&&!payload.ownershipProof){
      let proof=readProof(key);
      if(!proof)proof=await recoverOwnership(key,payload,token);
      payload.ownershipProof=proof;
    }

    const result=await post(operation,payload,token);
    const resultKey=String(result.key||key||"").trim();
    if((operation==="create"||operation==="claim")&&/^\d+$/.test(resultKey)&&result.ownershipProof)saveProof(resultKey,result.ownershipProof);
    if(operation==="unlink"&&result.canUnlink&&/^\d+$/.test(resultKey))removeProof(resultKey);
    return result;
  }

  window.chessResultsLocalJson=request;

  const protectedOpenUploadSection=window.openChessResultsUploadPage;
  if(typeof protectedOpenUploadSection==="function"){
    window.openChessResultsUploadPage=async function(){
      let state=typeof window.chessResultsState==="function"?window.chessResultsState():null;
      const tournament=currentTournament();
      const existing=text(state?.key||tournament?.chessResults?.key||tournament?.settings?.tnr);
      if(!/^\d+$/.test(existing)){
        if(typeof window.createChessResultsTournament!=="function")throw new Error("Chess-Results tournament creation is unavailable.");
        await window.createChessResultsTournament();
        state=typeof window.chessResultsState==="function"?window.chessResultsState():null;
        if(!/^\d+$/.test(String(state?.key||"")))return;
      }
      return protectedOpenUploadSection();
    };
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

  installRefreshContinuity();

  window.__cpChessResultsBrowserAdapter={
    enabled:true,
    transport:"cors-worker-direct",
    backendPrefix:API_PREFIX,
    organizerScoped:true,
    ownershipProof:true,
    crossDeviceTnrRecovery:true,
    recoveryAuthority:"organizer-owned-cloud-snapshot",
    refreshContinuity:true,
    refreshContinuityStorage:"sessionStorage",
    secretsInBrowser:false
  };
})();
