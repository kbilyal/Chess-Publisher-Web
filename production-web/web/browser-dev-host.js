(()=>{
  "use strict";

  // Mobile-only presentation layer. All rules are scoped to <= 768px so the
  // desktop web UI remains untouched. No application logic is changed here.
  function installMobileFriendlyStyles(){
    if(document.getElementById("cp-mobile-friendly-styles")) return;
    const style=document.createElement("style");
    style.id="cp-mobile-friendly-styles";
    style.textContent=`
@media (max-width: 768px) {
  html, body { max-width: 100%; overflow-x: hidden; }
  body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  *, *::before, *::after { box-sizing: border-box; }
  main, section, article, aside, header, footer,
  [class*="container"], [class*="content"], [class*="panel"], [class*="card"],
  [class*="dialog"], [class*="modal"] { max-width: 100%; }
  input:not([type="checkbox"]):not([type="radio"]), select, textarea {
    max-width: 100%; min-height: 44px; font-size: 16px !important;
  }
  button, [role="button"], input[type="button"], input[type="submit"] {
    min-height: 44px; touch-action: manipulation;
  }
  form { max-width: 100%; }
  form input:not([type="checkbox"]):not([type="radio"]), form select, form textarea,
  form button, form [role="button"] { width: 100%; }
  nav, [role="tablist"], [class*="tabs"], [class*="tab-bar"], [class*="toolbar"] {
    max-width: 100%; overflow-x: auto; overflow-y: hidden;
    -webkit-overflow-scrolling: touch; scrollbar-width: thin;
  }
  [role="tablist"], [class*="tabs"], [class*="tab-bar"] { flex-wrap: nowrap !important; }
  [role="tab"], [class*="tab-button"], [class*="tab-item"] {
    flex: 0 0 auto; white-space: nowrap;
  }
  table {
    display: block; width: 100%; max-width: 100%; overflow-x: auto;
    -webkit-overflow-scrolling: touch; white-space: nowrap;
  }
  [class*="grid"], [class*="columns"], [class*="split"],
  [class*="two-column"], [class*="three-column"] {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  [class*="row"], [class*="actions"], [class*="button-group"] {
    max-width: 100%; flex-wrap: wrap;
  }
  [class*="actions"] > button, [class*="button-group"] > button { flex: 1 1 140px; }
  dialog, [role="dialog"], [class*="modal"] {
    width: calc(100vw - 24px) !important; max-width: calc(100vw - 24px) !important;
    max-height: calc(100dvh - 24px) !important; overflow: auto; margin: 12px auto !important;
  }
  [class*="login"], [class*="auth"], [id*="login"], [id*="auth"] { max-width: 100% !important; }
  [class*="login"] form, [class*="auth"] form, [id*="login"] form, [id*="auth"] form {
    width: 100% !important; max-width: 100% !important;
  }
  [class*="login-card"], [class*="auth-card"], [class*="login-panel"], [class*="auth-panel"] {
    width: calc(100vw - 24px) !important; max-width: 480px !important;
    margin-left: auto !important; margin-right: auto !important;
  }
  img, svg, canvas, video { max-width: 100%; height: auto; }
  pre, code { max-width: 100%; overflow-x: auto; }
}
`;
    document.head.appendChild(style);
    document.documentElement.dataset.cpMobileFriendly="1";
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
