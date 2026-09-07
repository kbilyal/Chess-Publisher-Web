(()=>{
  "use strict";

  if(!["http:","https:"].includes(location.protocol)||location.hostname==="127.0.0.1")return;

  const host=window.__cpWebLinuxDevHost||{};
  host.nativePairing=false;
  host.nativeTieBreak=false;
  host.nativePairingChecker=false;
  host.nativeService="cloudflare-python-worker-custom-domain";
  window.__cpWebLinuxDevHost=host;

  const ORGANIZER_SECRET_KEY="organizer-primary";
  const CANONICAL_WEB_ORIGIN="https://web.chess-publisher.org";
  const CUSTOM_ENGINE_BASE="https://engine.chess-publisher.org";
  const ENGINE_RELAY_BASE="https://chess-publisher-chess-results.kyamranbilyal.workers.dev";
  const DIRECT_ENGINE_BASE="https://chess-publisher-web-engine.kyamranbilyal.workers.dev";
  const ENGINE_BASE=location.origin===CANONICAL_WEB_ORIGIN?CUSTOM_ENGINE_BASE:DIRECT_ENGINE_BASE;
  const ENGINE_PREFIX=`${ENGINE_BASE}/api/engine`;
  const ENGINE_RELAY_PREFIX=`${ENGINE_RELAY_BASE}/api/engine-relay`;
  const BACKEND_UNAVAILABLE="Chess-Publisher Web engine is unavailable. Pairing was not generated.";
  const nativeFetch=typeof window.fetch==="function"?window.fetch.bind(window):null;

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

  function showBackendReady(capabilities){
    host.nativeError="";
    document.documentElement.dataset.cpLinuxNativePairing="ready";
    try{
      if(typeof window.isRoundRobinFormat==="function"&&window.isRoundRobinFormat())return;
      const version=String(capabilities?.pairing?.version||"1.9.57");
      const status=document.getElementById("gacruxStatus");
      if(status)status.textContent=`Gacrux ${version} Web engine ready`;
      const button=document.getElementById("btnGenerateGacrux");
      if(button)button.title=`Generate with authenticated Gacrux ${version} Web engine`;
    }catch(_){ }
  }

  async function organizerToken(){
    for(let attempt=0;attempt<30;attempt++){
      try{
        if(typeof window.cpNativeHubSecretGet==="function"){
          const token=String(await window.cpNativeHubSecretGet(ORGANIZER_SECRET_KEY)||"").trim();
          if(token)return token;
        }
      }catch(_){ }
      if(attempt<29)await new Promise(resolve=>setTimeout(resolve,50));
    }
    try{
      for(const key of ["cpweb.organizerToken.remembered","cpstudio.organizerToken.remembered","cpweb.organizerToken.session","cpstudio.organizerToken.session"]){
        const store=key.includes(".session")?sessionStorage:localStorage;
        const token=String(store.getItem(key)||"").trim();
        if(token)return token;
      }
    }catch(_){ }
    return "";
  }

  function transportDetail(error){
    return String(error?.message||error||"network request failed").trim();
  }

  function relayUrl(primary){
    const prefix=`${CUSTOM_ENGINE_BASE}/api/engine`;
    return primary.startsWith(prefix)?primary.replace(prefix,ENGINE_RELAY_PREFIX):"";
  }

  async function engineFetch(path,options={}){
    if(!nativeFetch)throw new Error(BACKEND_UNAVAILABLE);
    const token=await organizerToken();
    if(!token)throw new Error("Organizer Token is required before using the Web pairing/checker engine.");
    const headers=new Headers(options.headers||{});
    headers.set("Authorization",`Bearer ${token}`);
    headers.set("Accept","application/json");
    const requestOptions={cache:"no-store",mode:"cors",credentials:"omit",...options,headers};
    const primary=String(path);
    try{
      const response=await nativeFetch(primary,requestOptions);
      host.nativeTransportError=null;
      return response;
    }catch(primaryError){
      const canFallback=location.origin===CANONICAL_WEB_ORIGIN&&primary.startsWith(CUSTOM_ENGINE_BASE);
      if(canFallback){
        const primaryDetail=transportDetail(primaryError);
        const relay=relayUrl(primary);
        let relayError=null;
        if(relay){
          try{
            const response=await nativeFetch(relay,requestOptions);
            if(response.status===404||response.status===405)throw new Error(`HTTP ${response.status}`);
            host.nativeTransportError={origin:location.origin,primary,primaryDetail,relay,usedRelay:true,usedFallback:true};
            console.warn("Chess-Publisher Web engine custom-domain transport failed; authenticated service relay succeeded",host.nativeTransportError);
            return response;
          }catch(error){
            relayError=error;
          }
        }

        const fallback=primary.replace(CUSTOM_ENGINE_BASE,DIRECT_ENGINE_BASE);
        try{
          const response=await nativeFetch(fallback,requestOptions);
          host.nativeTransportError={
            origin:location.origin,
            primary,
            primaryDetail,
            relay,
            relayDetail:relayError?transportDetail(relayError):"not attempted",
            fallback,
            usedRelay:false,
            usedFallback:true
          };
          console.warn("Chess-Publisher Web engine custom-domain and relay transports failed; direct Worker fallback succeeded",host.nativeTransportError);
          return response;
        }catch(fallbackError){
          const relayDetail=relayError?transportDetail(relayError):"not attempted";
          const fallbackDetail=transportDetail(fallbackError);
          host.nativeTransportError={origin:location.origin,primary,primaryDetail,relay,relayDetail,fallback,fallbackDetail,usedRelay:false,usedFallback:false};
          console.warn("Chess-Publisher Web engine transports failed",host.nativeTransportError);
          throw new Error(`${BACKEND_UNAVAILABLE} Transport: custom=${primaryDetail}; relay=${relayDetail}; direct=${fallbackDetail}`);
        }
      }
      const detail=transportDetail(primaryError);
      host.nativeTransportError={origin:location.origin,endpoint:primary,detail};
      console.warn("Chess-Publisher Web engine transport failed",host.nativeTransportError);
      throw new Error(`${BACKEND_UNAVAILABLE} Transport: ${detail}`);
    }
  }

  async function jsonRequest(path,options={}){
    const response=await engineFetch(path,options);
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||payload.ok===false){
      throw new Error(payload.message||payload.error||`Web engine HTTP ${response.status}`);
    }
    return payload;
  }

  async function refreshCapabilities(){
    const capabilities=await jsonRequest(`${ENGINE_PREFIX}/capabilities`,{method:"GET"});
    host.nativePairing=Boolean(capabilities.pairing?.ready);
    host.nativeTieBreak=Boolean(capabilities.tieBreak?.ready);
    host.nativePairingChecker=Boolean(capabilities.independentPairingChecker?.ready);
    host.capabilities=capabilities;
    if(host.nativePairing)showBackendReady(capabilities);
    else showBackendStatus(capabilities.pairing?.message||BACKEND_UNAVAILABLE);
    return capabilities;
  }

  async function requestWebGacruxPairs(next,initialColor){
    const capabilities=await refreshCapabilities();
    if(!capabilities.pairing?.ready){
      throw new Error(capabilities.pairing?.message||"Verified Gacrux Web pairing engine is unavailable.");
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
      payload=await jsonRequest(`${ENGINE_PREFIX}/pair`,{
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

  if(nativeFetch){
    const routeMap=new Map([
      ["/pair",`${ENGINE_PREFIX}/pair`],
      ["/native/capabilities",`${ENGINE_PREFIX}/capabilities`],
      ["/pairing-checker/status",`${ENGINE_PREFIX}/pairing-checker/status`],
      ["/pairing-checker/install",`${ENGINE_PREFIX}/pairing-checker/install`],
      ["/tiebreak-checker/status",`${ENGINE_PREFIX}/tiebreak-checker/status`],
      ["/tiebreak-checker/install",`${ENGINE_PREFIX}/tiebreak-checker/install`],
      ["/tiebreak-checker/check",`${ENGINE_PREFIX}/tiebreak-checker/check`],
      ["/trf26-exchange/check",`${ENGINE_PREFIX}/trf26-exchange/check`]
    ]);
    const previousFetch=window.fetch.bind(window);
    window.fetch=async function cpWebEngineRouteFetch(input,init){
      let url;
      try{url=new URL(input instanceof Request?input.url:String(input),location.href);}catch{return previousFetch(input,init);}
      if(url.origin!==location.origin||!routeMap.has(url.pathname))return previousFetch(input,init);
      const mapped=routeMap.get(url.pathname);
      const options={...init};
      if(input instanceof Request){
        const headers=new Headers(input.headers);
        if(init?.headers)new Headers(init.headers).forEach((value,key)=>headers.set(key,value));
        options.headers=headers;
        if(options.body===undefined&&!["GET","HEAD"].includes(input.method))options.body=await input.clone().text();
        if(!options.method)options.method=input.method;
      }
      return engineFetch(mapped,options);
    };
  }

  if(typeof window.requestLocalGacruxPairs==="function"){
    window.requestLocalGacruxPairs=requestWebGacruxPairs;
  }else{
    console.error("Web engine adapter could not find the protected Gacrux request function.");
  }

  const updatePanel=window.updateGacruxPanel;
  if(typeof updatePanel==="function"){
    window.updateGacruxPanel=function(){
      const result=updatePanel.apply(this,arguments);
      if(host.nativePairing&&host.capabilities)showBackendReady(host.capabilities);
      else if(host.nativeError)showBackendStatus(host.nativeError);
      return result;
    };
  }

  window.cpRefreshLinuxNativeCapabilities=refreshCapabilities;
  window.cpWebEngineRequest=jsonRequest;

  setTimeout(()=>refreshCapabilities().catch(error=>{
    showBackendStatus(error?.message||BACKEND_UNAVAILABLE);
    console.info("Web engine will retry after Organizer Token authentication.");
  }),250);
})();
