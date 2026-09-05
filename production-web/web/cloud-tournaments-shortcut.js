(()=>{
  "use strict";

  let saveSyncTail=Promise.resolve();
  let localSaveTimer=0;

  function removeLegacyControls(){
    document.getElementById("cpWebMyOnlineTournamentsMenu")?.remove();
    document.getElementById("cpWebMyCloudTournamentsButton")?.remove();
  }

  function hidePublicOnlineTournamentList(){
    const groups=[...document.querySelectorAll("#hub .groupbox")];
    for(const group of groups){
      const title=group.querySelector(":scope > .group-title")?.textContent?.trim()||"";
      if(title==="My Online Tournaments"){
        group.hidden=true;
        group.style.setProperty("display","none","important");
        group.setAttribute("aria-hidden","true");
        group.dataset.cpWebHiddenOnlineTournamentList="1";
      }
    }
  }

  function cloudGroup(){
    return [...document.querySelectorAll("#cloudWorkspace .groupbox,#hub .groupbox")].find(group=>{
      const title=group.querySelector(":scope > .group-title")?.textContent?.trim()||"";
      return title==="My Private Cloud Tournaments"||title==="My Cloud Tournaments";
    })||null;
  }

  async function openMyCloud(){
    removeLegacyControls();
    hidePublicOnlineTournamentList();
    try{if(typeof window.closeFileMenu==="function")window.closeFileMenu();}catch(_){}
    const tab=document.getElementById("tabCloudWorkspace");
    if(tab){
      try{
        if(typeof window.showTab==="function")window.showTab("cloudWorkspace",tab);
        else tab.click();
      }catch(_){try{tab.click();}catch(__){}}
    }
    await new Promise(resolve=>setTimeout(resolve,0));
    try{if(typeof window.cpCloudRefreshList==="function")await window.cpCloudRefreshList({quiet:false});}catch(error){console.error("My Cloud refresh failed:",error);}
    const group=cloudGroup();
    if(group){
      const title=group.querySelector(":scope > .group-title");
      if(title)title.textContent="My Cloud Tournaments";
      group.scrollIntoView({behavior:"smooth",block:"start"});
    }
  }

  function ensureFileMenuItem(){
    removeLegacyControls();
    hidePublicOnlineTournamentList();
    const menu=document.getElementById("fileMenu");
    if(!menu)return false;
    let button=document.getElementById("cpWebMyCloudMenu");
    if(!button){
      button=document.createElement("button");
      button.id="cpWebMyCloudMenu";
      button.type="button";
      button.innerHTML="<span>My Cloud</span><span></span>";
      button.title="Open tournaments synchronized with your Organizer Token";
      button.addEventListener("click",event=>{event.stopPropagation();void openMyCloud();});
      const recent=[...menu.querySelectorAll("button")].find(item=>/Recent Tournaments/i.test(item.textContent||""));
      if(recent)recent.insertAdjacentElement("afterend",button);
      else menu.prepend(button);
    }
    return true;
  }

  function persistLocalNow(){
    try{if(typeof window.saveAll==="function")window.saveAll();}catch(error){console.error("Web saveAll failed:",error);}
    try{if(typeof window.saveData==="function")window.saveData();}catch(error){console.error("Web saveData failed:",error);}
  }

  function queueCloudSave(){
    saveSyncTail=saveSyncTail.catch(()=>undefined).then(async()=>{
      persistLocalNow();
      if(typeof window.cpCloudSyncCurrent==="function"){
        await window.cpCloudSyncCurrent({force:false,quiet:false,allowPull:false});
      }
    });
    return saveSyncTail;
  }

  function ensureDurableSave(){
    const button=document.getElementById("manualSaveButton")||document.getElementById("cpWebManualSaveButton");
    if(!button)return false;
    if(button.dataset.cpWebDurableSaveBound==="1")return true;
    button.dataset.cpWebDurableSaveBound="1";
    button.addEventListener("click",()=>{
      setTimeout(()=>{void queueCloudSave().catch(error=>console.error("Web durable Save failed:",error));},0);
    });
    return true;
  }

  function scheduleSafeLocalSave(){
    clearTimeout(localSaveTimer);
    localSaveTimer=setTimeout(()=>persistLocalNow(),350);
  }

  function install(){
    ensureFileMenuItem();
    ensureDurableSave();
    hidePublicOnlineTournamentList();

    document.addEventListener("change",scheduleSafeLocalSave,true);
    window.addEventListener("pagehide",persistLocalNow);

    const observer=new MutationObserver(()=>{
      removeLegacyControls();
      hidePublicOnlineTournamentList();
      ensureFileMenuItem();
      ensureDurableSave();
      const group=cloudGroup();
      const title=group?.querySelector(":scope > .group-title");
      if(title&&title.textContent.trim()==="My Private Cloud Tournaments")title.textContent="My Cloud Tournaments";
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});

    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      ensureFileMenuItem();
      ensureDurableSave();
      hidePublicOnlineTournamentList();
      if(attempts>=100)clearInterval(timer);
    },100);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();

  window.__cpWebCloudTournamentsShortcut={
    enabled:true,
    visible:false,
    fileMenu:true,
    label:"My Cloud",
    control:"cpWebMyCloudMenu",
    legacyOnlineMenuRemoved:true,
    publicOnlineListHidden:true,
    durableSave:true,
    localSaveOnChange:true,
    cloudSaveOnManualSave:true,
    open:openMyCloud
  };
})();
