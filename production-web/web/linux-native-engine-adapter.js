(()=>{
  "use strict";

  if(!["http:","https:"].includes(location.protocol)||location.hostname==="127.0.0.1")return;

  const host=window.__cpWebLinuxDevHost||{};
  host.nativePairing=false;
  host.nativeTieBreak=false;
  host.nativePairingChecker=false;
  host.nativeService="same-origin";
  window.__cpWebLinuxDevHost=host;
  const BACKEND_UNAVAILABLE="Engine backend not connected. Gacrux and checker operations are Desktop only until a verified native server is connected.";

  function showBackendStatus(message=BACKEND_UNAVAILABLE){
    host.nativeError=message;
    document.documentElement.dataset.cpLinuxNativePairing="unavailable";
    try{
      if(typeof window.isRoundRobinFormat==="function"&&window.isRoundRobinFormat())return;
      const status=document.getElementById("gacruxStatus");
      if(status)status.textContent=message;
      const button=document.getElementById("btnGenerateGacrux");
      if(button)button.title=message;
    }catch(_){ }
  }

  async function jsonRequest(path,options){
    let response;
    try{response=await fetch(path,{cache:"no-store",...options});}
    catch(_){throw new Error(BACKEND_UNAVAILABLE);}
    const payload=await response.json().catch(()=>({}));
    if(response.status===404)throw new Error(BACKEND_UNAVAILABLE);
    if(!response.ok||!payload.ok)throw new Error(payload.error||payload.message||`Native service HTTP ${response.status}`);
    return payload;
  }

  async function refreshCapabilities({preparePairing=false}={}){
    let capabilities=await jsonRequest("/native/capabilities");
    if(preparePairing&&!capabilities.pairing?.ready){
      await jsonRequest("/pairing-engine/install",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
      capabilities=await jsonRequest("/native/capabilities");
    }
    host.nativePairing=Boolean(capabilities.pairing?.ready);
    host.nativeTieBreak=Boolean(capabilities.tieBreak?.ready);
    host.nativePairingChecker=Boolean(capabilities.independentPairingChecker?.ready);
    host.capabilities=capabilities;
    document.documentElement.dataset.cpLinuxNativePairing=host.nativePairing?"ready":"unavailable";
    return capabilities;
  }

  async function requestLinuxGacruxPairs(next,initialColor){
    const capabilities=await refreshCapabilities({preparePairing:true});
    if(!capabilities.pairing?.ready){
      throw new Error(capabilities.pairing?.message||"Verified Linux Gacrux pairing engine is unavailable.");
    }
    const tournament=getCurrentTournament();
    const totalRounds=parseInt(tournament?.settings?.rounds)||7;
    const {rows}=tournamentState();
    const nextByes=getManualByesForRound(next);
    const controlled=new Set();
    rows.forEach(row=>{
      if(Number(next)<Number(row.joinedFromRound||1)||isPlayerSyncedAbsent(row.key)||isPlayerExcludedForRound(row.key,next)||nextByes[row.key])controlled.add(row.key);
    });
    const unpaired=rows.filter(row=>controlled.has(row.key)).map(row=>Number(row.id)).filter(Number.isInteger);
    const expectedKeys=getExpectedPairingKeys(next);
    if(!expectedKeys.length)throw new Error(`Round ${next} has no active players available for a normal pairing.`);
    initialColor=getInitialTopColorForEngine();
    const trf=buildPairingEngineTRF(initialColor);
    let payload;
    try{
      payload=await jsonRequest("/pair",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({trf,round:Number(next),rounds:totalRounds,topColor:initialColor==="b"?"B":"W",unpaired})
      });
    }catch(error){
      const message=error?.message||String(error);
      if(/BBP Independent Pairing Checker|BBP independent checker/i.test(message)){
        saveIndependentPairingCheckerResult({state:"fail",available:true,ok:false,check:false,round:Number(next),checker:"bbpPairings",version:"6.0.0",message});
      }
      throw error;
    }
    saveIndependentPairingCheckerResult(payload.independentChecker||{
      state:"unavailable",available:false,ok:false,check:null,round:Number(next),checker:"bbpPairings",version:"6.0.0",message:"Independent checker was not available for this pairing."
    });
    const pairs=parseGacruxPairingOutput(payload.output||"");
    const idToRow=new Map(rows.map(row=>[Number(row.id),row]));
    let boards=pairs.map((pair,index)=>{
      const white=idToRow.get(Number(pair[0]));
      const black=Number(pair[1])===0?null:idToRow.get(Number(pair[1]));
      if(!white||(Number(pair[1])!==0&&!black))throw new Error("Gacrux returned an unknown Pairing No.");
      return {board:index+1,whiteKey:white.key,blackKey:black?.key||"",result:black?"-":"PAB"};
    });
    boards=boards.filter(board=>!controlled.has(board.whiteKey)&&!controlled.has(board.blackKey));
    injectScheduledByesForRound(next,boards);
    boards=applyFixedBoardAssignments(boards);
    keepPairingAllocatedByeLast(boards);
    validateRoundCoverage(next,boards,"Gacrux");
    return boards;
  }

  if(typeof window.requestLocalGacruxPairs==="function"){
    window.requestLocalGacruxPairs=requestLinuxGacruxPairs;
  }else{
    console.error("Linux native adapter could not find the protected Gacrux request function.");
  }

  const updatePanel=window.updateGacruxPanel;
  if(typeof updatePanel==="function"){
    window.updateGacruxPanel=function(){
      const result=updatePanel.apply(this,arguments);
      if(!host.nativePairing&&host.nativeError)showBackendStatus(host.nativeError);
      return result;
    };
  }

  window.cpRefreshLinuxNativeCapabilities=refreshCapabilities;
  refreshCapabilities({preparePairing:true}).catch(error=>{
    showBackendStatus(error?.message||BACKEND_UNAVAILABLE);
    console.error("Linux native engine preparation failed:",error);
  });
})();
