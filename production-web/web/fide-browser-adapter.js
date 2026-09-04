(()=>{
  "use strict";

  const originalFetchFideZip=window.fetchFideZip;
  const proxyBase=String(window.__CP_FIDE_PROXY_BASE__||"/fide-proxy").replace(/\/$/,"");

  async function fetchProxyZip(type){
    const response=await fetch(`${proxyBase}/${encodeURIComponent(type)}`,{
      method:"GET",cache:"no-store",credentials:"same-origin"
    });
    if(!response.ok){
      const payload=await response.json().catch(()=>({}));
      throw new Error(payload.error||`FIDE proxy returned HTTP ${response.status}`);
    }
    const buffer=await response.arrayBuffer();
    if(buffer.byteLength<1000)throw new Error("FIDE proxy returned an unexpectedly small file");
    const signature=new Uint8Array(buffer,0,2);
    if(signature[0]!==0x50||signature[1]!==0x4b)throw new Error("FIDE proxy response is not a ZIP file");
    return {source:"FIDE via Web proxy",url:`${proxyBase}/${type}`,buffer,hash:fideHashBytes(buffer)};
  }

  window.fetchFideZip=async function(type){
    try{return await fetchProxyZip(type);}
    catch(proxyError){
      if(typeof originalFetchFideZip!=="function")throw proxyError;
      console.info("FIDE Web proxy unavailable; using the configured browser mirror.");
      try{return await originalFetchFideZip(type);}
      catch(browserError){
        throw new Error(`Web proxy: ${proxyError?.message||proxyError} • Browser mirror: ${browserError?.message||browserError}`);
      }
    }
  };

  // Replace only the desktop-only button action. Parsing, validation,
  // replacement safeguards and IndexedDB persistence stay in the protected
  // Chess-Publisher implementation.
  window.downloadAndUpdateFideDatabases=async function(){
    const ok=await updateFideDatabaseNow({manual:true});
    if(!ok&&!fideMainDb.size){
      await appAlert(
        "FIDE database update failed.\n\nThe Web proxy and configured browser mirror were unavailable. You can still import the official TXT lists manually.",
        "FIDE Database",
        "warning"
      );
    }
    return ok;
  };

  window.__cpWebFide={enabled:true,proxyBase,browserMirror:true};
})();
