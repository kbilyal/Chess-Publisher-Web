(()=>{
  "use strict";

  async function request(path,body=null){
    const options=body===null?{}:{method:"POST",headers:{"Content-Type":"application/json;charset=utf-8"},body:JSON.stringify(body)};
    let response;
    try{response=await fetch(path,{...options,cache:"no-store"});}
    catch(_){throw new Error("Chess-Results backend not connected. Use the Desktop launcher or connect the verified Chess-Results server backend.");}
    let payload={};
    try{payload=await response.json();}catch{}
    if(response.status===404)throw new Error("Chess-Results backend not connected. Use the Desktop launcher or connect the verified Chess-Results server backend.");
    if(!response.ok||!payload.ok)throw new Error(payload.error||`Chess-Results service HTTP ${response.status}`);
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
  window.__cpChessResultsBrowserAdapter={enabled:true,transport:"same-origin-server",secretsInBrowser:false};
})();
