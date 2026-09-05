(()=>{
  "use strict";

  function openCloudTournaments(){
    const old=document.getElementById("cpWebMyOnlineTournamentsMenu");
    if(old)old.remove();
    try{if(typeof window.closeFileMenu==="function")window.closeFileMenu();}catch(_){}
    const back=document.getElementById("cpBeta7Back");
    if(back){try{back.click();}catch(_){}}
    const start=document.getElementById("cpBeta7Start");
    if(start)start.style.display="";
    setTimeout(async()=>{
      const refresh=document.getElementById("cpBeta7CloudRefresh");
      if(refresh){try{refresh.click();return;}catch(_){}}
      try{if(typeof window.cpCloudRefreshList==="function")await window.cpCloudRefreshList({quiet:false});}
      catch(error){console.error("My Cloud Tournaments refresh failed:",error);}
    },0);
  }

  function ensureVisibleShortcut(){
    const old=document.getElementById("cpWebMyOnlineTournamentsMenu");
    if(old)old.remove();
    let button=document.getElementById("cpWebMyCloudTournamentsButton");
    if(button)return true;
    if(!document.body)return false;
    button=document.createElement("button");
    button.id="cpWebMyCloudTournamentsButton";
    button.type="button";
    button.textContent="☁ My Cloud Tournaments";
    button.title="Open tournaments synchronized with your Organizer Token";
    button.style.cssText="position:fixed;right:116px;top:14px;z-index:100000;padding:8px 13px;border-radius:8px;font-weight:700;cursor:pointer;white-space:nowrap";
    button.addEventListener("click",openCloudTournaments);
    document.body.appendChild(button);
    return true;
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ensureVisibleShortcut,{once:true});
  else ensureVisibleShortcut();
  let attempts=0;
  const timer=setInterval(()=>{attempts++;if(ensureVisibleShortcut()&&attempts>=20)clearInterval(timer);if(attempts>=100)clearInterval(timer);},100);

  window.__cpWebCloudTournamentsShortcut={
    enabled:true,
    visible:true,
    label:"My Cloud Tournaments",
    control:"cpWebMyCloudTournamentsButton",
    legacyOnlineMenuRemoved:true,
    open:openCloudTournaments
  };
})();
