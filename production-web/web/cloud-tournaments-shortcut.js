(()=>{
  "use strict";

  let saveSyncTail=Promise.resolve();
  let autosaveTimer=0;
  let cloudDialogRestore=null;

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

  function ensureCloudDialog(){
    let dialog=document.getElementById("cpWebMyCloudDialog");
    if(dialog)return dialog;
    dialog=document.createElement("dialog");
    dialog.id="cpWebMyCloudDialog";
    dialog.style.cssText="width:min(1100px,calc(100vw - 28px));max-height:calc(100vh - 40px);padding:0;border:0;border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.28);overflow:hidden";
    dialog.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #ddd;background:#fff"><strong>My Cloud Tournaments</strong><button id="cpWebMyCloudClose" type="button" style="padding:6px 12px">Close</button></div><div id="cpWebMyCloudDialogBody" style="padding:14px;max-height:calc(100vh - 105px);overflow:auto;background:#fff"></div>`;
    document.body.appendChild(dialog);
    dialog.querySelector("#cpWebMyCloudClose")?.addEventListener("click",()=>dialog.close());
    dialog.addEventListener("cancel",event=>{event.preventDefault();dialog.close();});
    dialog.addEventListener("close",()=>{
      if(typeof cloudDialogRestore==="function")cloudDialogRestore();
      cloudDialogRestore=null;
    });
    dialog.addEventListener("click",event=>{
      const target=event.target?.closest?.("button,a");
      if(!target)return;
      const label=(target.textContent||"").trim().toLowerCase();
      if(label==="open"||/open.*tournament/.test(label))setTimeout(()=>{try{dialog.close();}catch(_){}},250);
    });
    return dialog;
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
    if(!group){
      if(typeof window.showMessage==="function")window.showMessage("My Cloud","Cloud tournament list is not available yet. Please try again.");
      return;
    }
    const title=group.querySelector(":scope > .group-title");
    if(title)title.textContent="My Cloud Tournaments";

    const dialog=ensureCloudDialog();
    const body=dialog.querySelector("#cpWebMyCloudDialogBody");
    const placeholder=document.createComment("cp-my-cloud-return");
    group.parentNode?.insertBefore(placeholder,group);
    body.replaceChildren(group);
    group.hidden=false;
    group.style.removeProperty("display");
    cloudDialogRestore=()=>{
      if(placeholder.parentNode)placeholder.parentNode.insertBefore(group,placeholder);
      placeholder.remove();
    };
    try{dialog.showModal();}catch(_){dialog.setAttribute("open","");}
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

  function queueCloudSave({quiet=true}={}){
    saveSyncTail=saveSyncTail.catch(()=>undefined).then(async()=>{
      persistLocalNow();
      if(typeof window.cpCloudSyncCurrent==="function"){
        await window.cpCloudSyncCurrent({force:false,quiet:!!quiet,allowPull:false});
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
      setTimeout(()=>{void queueCloudSave({quiet:false}).catch(error=>console.error("Web durable Save failed:",error));},0);
    });
    return true;
  }

  function scheduleDurableAutosave(delay=900){
    clearTimeout(autosaveTimer);
    autosaveTimer=setTimeout(()=>{
      void queueCloudSave({quiet:true}).catch(error=>console.error("Web autosave failed:",error));
    },Math.max(500,delay));
  }

  function isAutosaveAction(target){
    const button=target?.closest?.("button,input[type=button],input[type=submit]");
    if(!button)return false;
    if(button.id==="cpWebManualSaveButton"||button.id==="manualSaveButton"||button.id==="cpWebMyCloudMenu"||button.id==="cpWebMyCloudClose")return false;
    if(button.closest("#fileMenu")||button.closest('[role="tablist"]')||button.matches('[role="tab"]'))return false;
    return true;
  }

  function install(){
    ensureFileMenuItem();
    ensureDurableSave();
    hidePublicOnlineTournamentList();

    document.addEventListener("input",()=>scheduleDurableAutosave(1000),true);
    document.addEventListener("change",()=>scheduleDurableAutosave(650),true);
    document.addEventListener("click",event=>{if(isAutosaveAction(event.target))scheduleDurableAutosave(850);},true);
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
    dialog:true,
    label:"My Cloud",
    control:"cpWebMyCloudMenu",
    legacyOnlineMenuRemoved:true,
    publicOnlineListHidden:true,
    durableSave:true,
    autosaveUsesDurableSavePath:true,
    autosaveCloudSync:true,
    cloudSaveOnManualSave:true,
    open:openMyCloud
  };
})();
