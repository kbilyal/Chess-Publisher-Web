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

  const webview={
    addEventListener(type,listener){if(type==="message"&&typeof listener==="function")listeners.add(listener);},
    removeEventListener(type,listener){if(type==="message")listeners.delete(listener);},
    postMessage(message){
      if(message?.type==="cp:hub-secret")return handleSecret(message);
      // Intentionally do NOT emulate TRF/PGN/DGT/native pairing operations.
      // Those must be ported to a real Linux/web backend rather than faked.
      console.debug("Chess-Publisher web-dev native message ignored:",message?.type||message);
    }
  };

  if(!window.chrome)window.chrome={};
  if(!window.chrome.webview)window.chrome.webview=webview;

  window.__cpWebLinuxDevHost={
    enabled:true,
    mode:"browser-dev",
    secretStorage:"sessionStorage",
    nativePairing:false,
    nativeDgt:false,
    nativeFilesystem:false
  };

  console.info("Chess-Publisher Ubuntu web-dev host active. Native Windows services are intentionally not emulated.");
})();
