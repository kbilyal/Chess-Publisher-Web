(()=>{
  "use strict";

  const desktopRequest=window.chessResultsLocalJson;
  const operations=new Set(["test","create","publish","admin-link","delete-authorize","unlink"]);
  const notConnected="Chess-Results backend not connected. The Web publishing server must be configured before publishing from this website.";
  let backendPromise;

  async function backendUrl(){
    if(!backendPromise)backendPromise=(async()=>{
      const response=await fetch("/web/chess-results-config.json",{cache:"no-store"});
      if(!response.ok)throw new Error(notConnected);
      const config=await response.json();
      if(!String(config?.apiBaseUrl||"").trim())throw new Error(notConnected);
      const url=new URL(config.apiBaseUrl);
      if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/"){
        throw new Error("Chess-Results publishing server must be configured with an HTTPS origin.");
      }
      return url.origin;
    })().catch(error=>{backendPromise=null;throw new Error(error?.message||notConnected);});
    return backendPromise;
  }

  async function request(path,body=null){
    if(typeof window.isLocalEnginePage==="function"&&window.isLocalEnginePage()&&typeof desktopRequest==="function"){
      return desktopRequest(path,body);
    }
    const match=/^\/chessresults\/([a-z-]+)$/.exec(path);
    if(!match||!operations.has(match[1]))throw new Error("Unknown Chess-Results operation.");
    const base=await backendUrl();
    const token=String(await window.cpNativeHubSecretGet?.("organizer-primary")||"").trim();
    if(!token)throw new Error("Sign in with your Organizer Token before using Chess-Results publishing.");
    const options={method:"POST",headers:{"Content-Type":"application/json;charset=utf-8",Accept:"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(body||{})};
    let response;
    try{response=await fetch(`${base}/api/chess-results/${match[1]}`,{...options,cache:"no-store",credentials:"omit",redirect:"error",signal:AbortSignal.timeout(45000)});}
    catch(_){throw new Error("Could not reach the Chess-Results publishing server. Check the connection and server configuration before retrying.");}
    let payload=null;
    try{payload=await response.json();}catch{}
    if(response.status===404||response.status===405)throw new Error("The configured server does not support Chess-Results publishing. Connect the Chess-Results API backend, then retry.");
    if(!payload||typeof payload!=="object")throw new Error("The Chess-Results publishing server returned an invalid response.");
    if(!response.ok||payload.ok!==true)throw new Error(payload.message||payload.error||`Chess-Results service HTTP ${response.status}`);
    return payload;
  }

  // Replace only the transport boundary. Protected beta.4 remains the
  // authority for validation and Chess-Results XML construction.
  window.chessResultsLocalJson=request;

  // In the browser, Upload Section is also a valid first action for a new
  // tournament. Reuse the protected GETKEY workflow so the Real/Test choice,
  // federation rule, stable client identity and persistence checks remain the
  // authority. Once the new TNR is saved, continue to the authenticated upload
  // page without requiring a separate click on Create Tournament.
  const protectedOpenUploadSection=window.openChessResultsUploadPage;
  if(typeof protectedOpenUploadSection==="function"){
    window.openChessResultsUploadPage=async function(){
      let state=typeof window.chessResultsState==="function"?window.chessResultsState():null;
      if(!/^\d+$/.test(String(state?.key||""))){
        if(typeof window.createChessResultsTournament!=="function")throw new Error("Chess-Results tournament creation is unavailable.");
        await window.createChessResultsTournament();
        state=typeof window.chessResultsState==="function"?window.chessResultsState():null;
        if(!/^\d+$/.test(String(state?.key||"")))return;
      }
      return protectedOpenUploadSection();
    };
  }
  window.__cpChessResultsBrowserAdapter={enabled:true,transport:"configured-authenticated-server",secretsInBrowser:false};
})();
