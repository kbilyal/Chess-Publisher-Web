(()=>{
  "use strict";

  // Linux/browser DEVELOPMENT bridge only.
  // It emulates only the small WebView message surface needed by the beta.4
  // Hub credential adapter. Secrets live in sessionStorage and disappear when
  // the browser session closes. Production web auth must use a server-side,
  // secure HttpOnly session/cookie flow instead of this bridge.
  const listeners=new Set();
  const prefix="cp:web-dev:secret:";

  function emit(data){
    queueMicrotask(()=>{
      for(const listener of listeners){
        try{listener({data});}catch(error){console.error("Web dev bridge listener:",error);}
      }
    });
  }

  function secretKey(key){
    return `${prefix}${String(key||"")}`;
  }

  function handleSecret(message){
    const requestId=String(message.requestId||"");
    const key=secretKey(message.key);
    try{
      if(message.operation==="get"){
        const value=sessionStorage.getItem(key);
        emit({type:"cp:hub-secret-result",requestId,ok:true,found:value!==null,value:value||""});
        return;
      }
      if(message.operation==="set"){
        sessionStorage.setItem(key,String(message.value||""));
        emit({type:"cp:hub-secret-result",requestId,ok:true,found:true});
        return;
      }
      if(message.operation==="remove"){
        sessionStorage.removeItem(key);
        emit({type:"cp:hub-secret-result",requestId,ok:true,found:false});
        return;
      }
      emit({type:"cp:hub-secret-result",requestId,ok:false,error:"Unsupported web-dev secret operation."});
    }catch(error){
      emit({type:"cp:hub-secret-result",requestId,ok:false,error:error?.message||String(error)});
    }
  }

  const browserBridge={
    addEventListener(type,listener){if(type==="message"&&typeof listener==="function")listeners.add(listener);},
    removeEventListener(type,listener){if(type==="message")listeners.delete(listener);},
    postMessage(message){
      if(message?.type==="cp:hub-secret")return handleSecret(message);
      // Intentionally do NOT emulate TRF/PGN/DGT/native operations here.
      // Native operations require a verified desktop bridge or server backend.
      console.debug("Chess-Publisher web-dev native message ignored:",message?.type||message);
    }
  };

  // Do not expose a fake window.chrome.webview. The protected desktop shell
  // uses its presence as a real Windows WebView2 capability check.
  window.__cpBrowserHostBridge=browserBridge;

  window.__cpWebLinuxDevHost={
    enabled:true,
    mode:"browser-dev",
    secretStorage:"sessionStorage",
    nativePairing:false,
    nativeTieBreak:false,
    nativePairingChecker:false,
    nativeDgt:false,
    nativeFilesystem:false
  };

  console.info("Chess-Publisher Ubuntu web-dev host active. Native Windows services are intentionally not emulated.");
})();
