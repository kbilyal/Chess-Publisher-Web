(()=>{
  "use strict";

  if(window.__cpArbiterResultsDownloadLoaded)return;
  window.__cpArbiterResultsDownloadLoaded=true;

  const BASE_URL="https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev";
  const ORGANIZER_SECRET_KEY="organizer-primary";
  const ALLOWED_RESULTS=new Set(["1 - 0","½ - ½","0 - 1","1F - 0F","0F - 1F","0F - 0F"]);
  let busy=false;

  const text=value=>value==null?"":String(value).trim();
  const clone=value=>JSON.parse(JSON.stringify(value));

  function currentTournament(){
    try{return typeof getCurrentTournament==="function"?getCurrentTournament():null;}catch(_){return null;}
  }

  function currentName(){
    try{return text(data?.currentTournament);}catch(_){return "";}
  }

  function cloudTournamentId(tournament){
    return text(tournament?.cloud?.cloudTournamentId);
  }

  async function organizerToken(){
    if(typeof window.cpNativeHubSecretGet!=="function")return "";
    return text(await window.cpNativeHubSecretGet(ORGANIZER_SECRET_KEY));
  }

  function errorMessage(payload,status){
    return text(payload?.message)||`Cloud returned HTTP ${status}.`;
  }

  async function cloudRequest(path,{method="GET",token="",body}={}){
    const headers={Accept:"application/json"};
    if(token)headers.Authorization=`Bearer ${token}`;
    let payloadBody=null;
    if(body!==undefined){headers["Content-Type"]="application/json";payloadBody=JSON.stringify(body);}

    let response;
    const loopback=typeof location!=="undefined"&&/^(?:127\.0\.0\.1|localhost)$/i.test(String(location.hostname||""));
    if(loopback){
      response=await fetch("/cloud-proxy",{
        method:"POST",
        headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({method:String(method).toUpperCase(),path,headers,body:payloadBody}),
        cache:"no-store"
      });
    }else{
      response=await fetch(`${BASE_URL}${path}`,{method,headers,body:payloadBody,cache:"no-store"});
    }

    const raw=await response.text();
    let payload=null;
    try{payload=raw?JSON.parse(raw):null;}catch{payload={raw};}
    if(!response.ok){
      const error=new Error(errorMessage(payload,response.status));
      error.status=response.status;
      error.code=text(payload?.error)||`http_${response.status}`;
      error.currentRevision=Number.isInteger(Number(payload?.currentRevision))?Number(payload.currentRevision):null;
      throw error;
    }
    return payload;
  }

  function snapshotTournament(response){
    const snapshot=response?.snapshot;
    const tournaments=snapshot?.data?.tournaments;
    if(!snapshot||!tournaments||typeof tournaments!=="object")return null;
    const requested=text(snapshot?.data?.currentTournament||snapshot?.currentTournament);
    if(requested&&tournaments[requested])return tournaments[requested];
    const first=Object.keys(tournaments)[0];
    return first?tournaments[first]:null;
  }

  function findBoard(tournament,submission){
    const roundKey=String(Number(submission?.round||0));
    const boards=Array.isArray(tournament?.pairings?.liveBoards?.[roundKey])?tournament.pairings.liveBoards[roundKey]:[];
    const index=boards.findIndex(board=>Number(board?.board||0)===Number(submission?.board||0));
    return {roundKey,boards,index,board:index>=0?boards[index]:null};
  }

  function canApply(tournament,submission,expectedCloudId){
    if(text(submission?.tournamentId)&&text(submission.tournamentId)!==expectedCloudId)return {ok:false,reason:"different tournament"};
    const round=Number(submission?.round||0);
    const boardNumber=Number(submission?.board||0);
    if(!Number.isInteger(round)||round<1||!Number.isInteger(boardNumber)||boardNumber<1)return {ok:false,reason:"invalid board identity"};
    if(tournament?.pairings?.finalizedRounds?.[String(round)])return {ok:false,reason:`round ${round} is finalized`};
    if(!ALLOWED_RESULTS.has(text(submission?.result)))return {ok:false,reason:"unsupported result"};
    const located=findBoard(tournament,submission);
    if(!located.board)return {ok:false,reason:"board no longer exists"};
    if(text(located.board.whiteKey)!==text(submission?.whiteKey)||text(located.board.blackKey)!==text(submission?.blackKey))return {ok:false,reason:"pairing changed"};
    return {ok:true,...located};
  }

  function setStatus(message,kind=""){
    const el=document.getElementById("cloudDownloadResultsState");
    if(el){el.textContent=message;el.dataset.kind=kind;}
  }

  function setBusy(value){
    busy=!!value;
    const button=document.getElementById("cloudDownloadResultsBtn");
    if(button)button.disabled=busy||!currentName()||!cloudTournamentId(currentTournament());
  }

  async function saveLocalTournament(){
    try{if(typeof saveData==="function")saveData();}catch(_){ }
    try{if(typeof refreshEverything==="function")refreshEverything();}catch(_){ }
    if(typeof fileSaveTournament==="function"){
      const saved=await fileSaveTournament(true);
      if(!saved)throw new Error("Arbiter results were applied in memory but could not be committed to local managed storage.");
    }
  }

  async function verifyCloudSnapshot(token,id,applied){
    const response=await cloudRequest(`/api/v1/cloud/tournaments/${encodeURIComponent(id)}/snapshot`,{token});
    const tournament=snapshotTournament(response);
    if(!tournament)throw new Error("Cloud verification snapshot does not contain the tournament.");
    for(const submission of applied){
      const located=findBoard(tournament,submission);
      if(!located.board||text(located.board.whiteKey)!==text(submission.whiteKey)||text(located.board.blackKey)!==text(submission.blackKey)||text(located.board.result)!==text(submission.result)){
        throw new Error(`Cloud verification failed for round ${submission.round}, board ${submission.board}. Result remains pending and was not acknowledged.`);
      }
    }
    return response;
  }

  async function downloadArbiterResults(){
    if(busy)return {ok:false,busy:true};
    const initialName=currentName();
    const initialTournament=currentTournament();
    if(!initialName||!initialTournament)throw new Error("No tournament is open.");
    const initialId=cloudTournamentId(initialTournament);
    if(!initialId)throw new Error("The current tournament is not linked to Private Cloud.");
    const token=await organizerToken();
    if(!token)throw new Error("Organizer Token is not connected.");

    busy=true;
    window.__cpOnlineCloudBusy=true;
    setBusy(true);
    setStatus("Reconciling Cloud before result download…","busy");

    try{
      if(typeof window.cpCloudPullChanges!=="function"||typeof window.cpCloudSyncCurrent!=="function")throw new Error("Private Cloud reconcile functions are unavailable.");

      const reconcile=await window.cpCloudPullChanges();
      if(reconcile?.ok===false){
        if(reconcile?.cancelled||reconcile?.conflict)throw new Error("Download Results stopped because Cloud reconciliation was not approved. No arbiter result was acknowledged.");
        throw new Error("Cloud reconciliation did not complete. No arbiter result was acknowledged.");
      }

      const name=currentName();
      const tournament=currentTournament();
      const id=cloudTournamentId(tournament);
      if(!name||!tournament||id!==initialId)throw new Error("The active tournament changed during Download Results. No arbiter result was acknowledged.");

      const queue=await cloudRequest(`/api/v1/cloud/tournaments/${encodeURIComponent(id)}/arbiter-results`,{token});
      const submissions=Array.isArray(queue?.results)?queue.results:[];
      if(!submissions.length){
        setStatus("No pending arbiter results. Cloud snapshot is already reconciled.","ok");
        return {ok:true,downloaded:0,waiting:0};
      }

      const applied=[];
      const waiting=[];
      const ordered=[...submissions].sort((a,b)=>text(a?.updatedAt).localeCompare(text(b?.updatedAt)));
      for(const submission of ordered){
        const check=canApply(tournament,submission,id);
        if(!check.ok){waiting.push({submission,reason:check.reason});continue;}
        const boards=[...check.boards];
        boards[check.index]={...check.board,result:text(submission.result)};
        if(!tournament.pairings||typeof tournament.pairings!=="object")tournament.pairings={};
        if(!tournament.pairings.liveBoards||typeof tournament.pairings.liveBoards!=="object")tournament.pairings.liveBoards={};
        tournament.pairings.liveBoards[check.roundKey]=boards;
        applied.push(clone(submission));
      }

      if(!applied.length){
        const reason=waiting[0]?.reason||"pairings no longer match";
        setStatus(`${submissions.length} result(s) remain safely pending: ${reason}.`,`warn`);
        return {ok:false,downloaded:0,waiting:submissions.length};
      }

      if(typeof stateDirty!=="undefined")stateDirty=true;
      setStatus(`Saving ${applied.length} result(s) locally…`,"busy");
      await saveLocalTournament();

      setStatus(`Synchronizing ${applied.length} result(s) to Cloud…`,"busy");
      const syncResult=await window.cpCloudSyncCurrent({force:true,quiet:false,allowPull:true});
      if(syncResult?.ok===false||syncResult?.conflict)throw new Error("Results were saved locally, but Cloud synchronization did not complete. They remain pending in Cloud and were not acknowledged.");

      await verifyCloudSnapshot(token,id,applied);

      const guardedSubmissions=applied
        .map(item=>({id:text(item?.id),updatedAt:text(item?.updatedAt)}))
        .filter(item=>item.id&&item.updatedAt);
      if(guardedSubmissions.length!==applied.length){
        throw new Error("A downloaded result has no Cloud version marker. Results are saved locally and in the Cloud snapshot, but remain pending for a safe retry.");
      }
      const ids=guardedSubmissions.map(item=>item.id);
      const ack=await cloudRequest(`/api/v1/cloud/tournaments/${encodeURIComponent(id)}/arbiter-results/ack`,{
        method:"POST",token,body:{submissions:guardedSubmissions}
      });

      const remaining=await cloudRequest(`/api/v1/cloud/tournaments/${encodeURIComponent(id)}/arbiter-results`,{token});
      const remainingIds=new Set((Array.isArray(remaining?.results)?remaining.results:[]).map(item=>text(item?.id)));
      const notAcknowledged=ids.filter(idValue=>remainingIds.has(idValue));
      const acknowledged=Math.max(0,Number(ack?.acknowledged||0));

      try{await window.cpCloudRefreshList?.({quiet:true});}catch(_){ }
      try{window.cpHubRefreshUi?.();}catch(_){ }

      if(notAcknowledged.length){
        const totalWaiting=waiting.length+notAcknowledged.length;
        setStatus(`${acknowledged} result(s) confirmed · ${totalWaiting} result(s) remain safely pending because they changed during download or no longer match. Press Download Results again.`,`warn`);
        return {ok:true,downloaded:acknowledged,waiting:totalWaiting,retryRequired:true,acknowledged};
      }

      setStatus(`${applied.length} result(s) downloaded, saved locally and confirmed in Cloud${waiting.length?` · ${waiting.length} waiting`:""}.`,`ok`);
      return {ok:true,downloaded:applied.length,waiting:waiting.length,acknowledged};
    }finally{
      busy=false;
      window.__cpOnlineCloudBusy=false;
      setBusy(false);
    }
  }

  function injectButton(){
    const pull=document.getElementById("cloudPullChangesBtn");
    if(!pull||document.getElementById("cloudDownloadResultsBtn"))return false;
    const button=document.createElement("button");
    button.id="cloudDownloadResultsBtn";
    button.type="button";
    button.textContent="Download Results";
    button.title="Download pending Arbiter Access results, save them locally, synchronize them to Private Cloud, then acknowledge only the exact verified result versions";
    button.dataset.arbiterResultsDownloadV1="1";
    button.addEventListener("click",async()=>{
      try{await downloadArbiterResults();}
      catch(error){
        setStatus(text(error?.message)||"Download Results failed. Pending Cloud results were not acknowledged.","warn");
        try{if(typeof appAlert==="function")await appAlert(text(error?.message)||"Download Results failed.","Download Results","error");}catch(_){ }
      }
    });
    pull.insertAdjacentElement("afterend",button);
    const state=document.createElement("span");
    state.id="cloudDownloadResultsState";
    state.className="muted";
    state.textContent="Arbiter results stay pending in Cloud until verified download.";
    button.insertAdjacentElement("afterend",state);
    setBusy(false);
    return true;
  }

  window.cpCloudDownloadArbiterResults=downloadArbiterResults;

  const timer=window.setInterval(()=>{
    if(injectButton())window.clearInterval(timer);
  },250);
  window.setTimeout(()=>window.clearInterval(timer),30000);
})();