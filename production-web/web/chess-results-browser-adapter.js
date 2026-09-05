(()=>{
  "use strict";

  const API_PREFIX="/api/chess-results/";
  const ORGANIZER_SECRET_KEY="organizer-primary";
  const OWNERSHIP_PREFIX="cp:chess-results:ownership:";
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
        headers:{
          "Content-Type":"application/json;charset=utf-8",
          "Accept":"application/json",
          "Authorization":`Bearer ${token}`
        },
        body:JSON.stringify(payload||{}),
        cache:"no-store",
        credentials:"same-origin"
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
    // Desktop and web share one logical tournament. If the desktop-side state
    // has a TNR in settings but an older Chess-Results state has no key, reuse
    // the synchronized TNR instead of requesting a duplicate.
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

  // Replace only the transport boundary. Protected beta.4 remains the
  // authority for validation and Chess-Results XML construction. Every old
  // /chessresults/* call is normalized to /api/chess-results/* and never sent
  // to a static browser path.
  window.chessResultsLocalJson=request;

  // In the browser, Upload Section is also a valid first action for a new
  // tournament. Reuse an existing desktop-created TNR when present; otherwise
  // reuse the protected GETKEY workflow. This prevents duplicate tournaments
  // when the arbiter switches desktop -> web -> desktop between rounds.
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

  window.__cpChessResultsBrowserAdapter={
    enabled:true,
    transport:"same-origin-worker",
    backendPrefix:API_PREFIX,
    organizerScoped:true,
    ownershipProof:true,
    crossDeviceTnrRecovery:true,
    recoveryAuthority:"organizer-owned-cloud-snapshot",
    secretsInBrowser:false
  };
})();
