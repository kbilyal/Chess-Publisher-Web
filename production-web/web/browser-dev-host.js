(()=>{
  "use strict";

  // Mobile-only presentation layer. Keep the exact desktop application and all
  // controls available; only add safe touch sizing, scrolling and viewport fit.
  // No application logic, menu items, tabs or actions are removed/rearranged.
  function installMobileFriendlyStyles(){
    if(document.getElementById("cp-mobile-friendly-styles")) return;
    const style=document.createElement("style");
    style.id="cp-mobile-friendly-styles";
    style.textContent=`
@media (max-width: 768px) {
  html, body {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch;
  }
  body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  *, *::before, *::after { box-sizing: border-box; }

  input:not([type="checkbox"]):not([type="radio"]), select, textarea {
    max-width: 100%;
    min-height: 44px;
    font-size: 16px !important;
  }
  button, [role="button"], input[type="button"], input[type="submit"] {
    min-height: 44px;
    touch-action: manipulation;
  }

  nav, [role="tablist"], [class*="tabs"], [class*="tab-bar"], [class*="toolbar"] {
    max-width: 100%;
    overflow-x: auto !important;
    overflow-y: visible;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }
  [role="tablist"], [class*="tabs"], [class*="tab-bar"] {
    flex-wrap: nowrap !important;
  }
  [role="tab"], [class*="tab-button"], [class*="tab-item"] {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  table {
    width: max-content;
    min-width: 100%;
    max-width: none;
  }

  dialog, [role="dialog"], [class*="modal"] {
    max-width: calc(100vw - 16px) !important;
    max-height: calc(100dvh - 16px) !important;
    overflow: auto !important;
  }

  [class*="login-card"], [class*="auth-card"],
  [class*="login-panel"], [class*="auth-panel"] {
    width: calc(100vw - 24px) !important;
    max-width: 480px !important;
    margin-left: auto !important;
    margin-right: auto !important;
  }
  [class*="login-card"] input, [class*="auth-card"] input,
  [class*="login-panel"] input, [class*="auth-panel"] input,
  [class*="login-card"] button, [class*="auth-card"] button,
  [class*="login-panel"] button, [class*="auth-panel"] button {
    max-width: 100%;
  }

  img, svg, canvas, video { max-width: 100%; height: auto; }
  pre, code { max-width: 100%; overflow-x: auto; }
}
`;
    document.head.appendChild(style);
    document.documentElement.dataset.cpMobileFriendly="full-access";
  }

  installMobileFriendlyStyles();

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
