(()=>{
  "use strict";

  let saveSyncTail=Promise.resolve();
  let autosaveTimer=0;
  let cloudDialogRestore=null;
  const REFRESH_CONTINUITY_KEY="cpweb.refresh.continuity.v1";
  const SHELL_READY_ATTR="data-cp-shell-ready";

  // A remembered Organizer Token must not make the login screen disappear by
  // replaying a stale refresh-continuity record. The user should explicitly
  // sign in/open a tournament first; token persistence itself is left intact.
  function guardVisibleLoginScreen(){
    const start=document.getElementById("cpBeta7Start");
    if(!start||start.hidden||start.style.display==="none")return false;
    try{sessionStorage.removeItem(REFRESH_CONTINUITY_KEY);}catch(_){}
    start.dataset.cpLoginContinuityGuard="1";
    return true;
  }

  function revealShell(){
    document.documentElement.setAttribute(SHELL_READY_ATTR,"1");
  }

  function shellMeta(tab){
    const id=tab?.id||"";
    const map={
      tabMain:["Tournament Setup","Identity, format, schedule and FIDE configuration"],
      tabRegistration:["Lists & Players","Registration, FIDE search and participant management"],
      tabPairings:["Pairings","Generate, review and publish the current round"],
      tabStandings:["Standings","Live ranking, tie-breaks and final classification"],
      tabSchedule:["Tournament Schedule","Rounds, dates, times and regulations"],
      tabDgt:["DGT Boards","Board assignment, live games and broadcast controls"],
      tabExport:["Other / Export","Reports, TRF, interchange and supporting tools"],
      tabCloudWorkspace:["Online & Cloud","Private organizer sync and public publishing"],
      tabHub:["Tournament Hub","Online tournament publishing and public workspace"]
    };
    return map[id]||[(tab?.textContent||"Tournament").trim(),"Tournament workspace"];
  }

  function iconSvg(id){
    const paths={
      tabMain:'<path d="M4 5h16v14H4z"/><path d="M8 3v4M16 3v4M4 9h16"/>',
      tabRegistration:'<circle cx="9" cy="8" r="3"/><path d="M3 19c.8-3.3 3-5 6-5s5.2 1.7 6 5M17 8h4M19 6v4"/>',
      tabPairings:'<path d="M7 4v16M17 4v16M4 8h6M14 16h6M10 8l4 8"/>',
      tabStandings:'<path d="M5 19V9h4v10M10 19V5h4v14M15 19v-7h4v7"/>',
      tabSchedule:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/>',
      tabDgt:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/>',
      tabExport:'<path d="M12 3v12M8 11l4 4 4-4M5 20h14"/>',
      tabCloudWorkspace:'<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.5 4.5 0 0 0 7 18Z"/>',
      tabHub:'<circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 7.5l3 2.5M17 7.5l-3 2.5M12 15v5"/>'
    };
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id]||'<circle cx="12" cy="12" r="7"/>'}</svg>`;
  }

  function decorateNavigation(){
    const tabs=document.querySelector("#appWindow .tabs");
    if(!tabs)return false;
    tabs.classList.add("cp-app-nav");
    if(!tabs.querySelector(":scope > .cp-nav-head")){
      const head=document.createElement("div");
      head.className="cp-nav-head";
      head.innerHTML='<strong>Tournament workspace</strong><span id="cpNavTournament">No tournament open</span>';
      tabs.prepend(head);
    }
    for(const tab of tabs.querySelectorAll(":scope > .tab")){
      if(!tab.querySelector(":scope > .cp-tab-glyph")){
        const glyph=document.createElement("span");
        glyph.className="cp-tab-glyph";
        glyph.setAttribute("aria-hidden","true");
        glyph.innerHTML=iconSvg(tab.id);
        tab.prepend(glyph);
      }
    }
    return true;
  }

  function fieldLabel(field){
    return (field?.querySelector?.("label")?.textContent||"").replace(/\*/g,"").replace(/\s+/g," ").trim();
  }

  function buildSetupCards(){
    const page=document.getElementById("main");
    if(!page)return false;
    const title=[...page.querySelectorAll(".groupbox > .group-title")].find(node=>/Tournament General Information/i.test(node.textContent||""));
    const master=title?.parentElement;
    if(!master||master.dataset.cpWebNativeSetup==="1")return !!master;
    const grid=master.querySelector(":scope > .form-grid-4, :scope > .form-grid");
    if(!grid)return false;

    master.dataset.cpWebNativeSetup="1";
    master.classList.add("cp-setup-master");

    const original=[...grid.children];
    const items=[];
    for(let i=0;i<original.length;i++){
      const node=original[i];
      if(node.tagName==="LABEL"&&original[i+1]&&original[i+1].tagName!=="LABEL"){
        const control=original[++i];
        const field=document.createElement("div");
        field.className="cp-field";
        grid.insertBefore(field,node);
        field.append(node,control);
        const label=fieldLabel(field).toLowerCase();
        if(/tournament name|website|live link/.test(label))field.classList.add("cp-field-wide");
        items.push(field);
      }else{
        items.push(node);
      }
    }

    const makeCard=(key,titleText,subText)=>{
      const section=document.createElement("section");
      section.className=`cp-setup-card cp-setup-${key}`;
      section.innerHTML=`<div class="cp-setup-card-head"><strong>${titleText}</strong><span>${subText}</span></div><div class="cp-setup-card-body"></div>`;
      return section;
    };
    const tournament=makeCard("tournament","Tournament","Core format, rating and pairing choices");
    const people=makeCard("people","Officials & Venue","People, federation and playing location");
    const schedule=makeCard("schedule","Schedule & Publishing","Dates, FIDE identity and public contacts");
    const board=document.createElement("div");
    board.className="cp-setup-board";
    board.append(tournament,people,schedule);

    const peopleRe=/organizer|chief arbiter|deputy|arbiter|tournament director|venue|city|country|fed/i;
    const scheduleRe=/start date|end date|registration deadline|fide event id|website|live link|contact|phone|e-mail|email/i;
    for(const item of items){
      let target=tournament.querySelector(".cp-setup-card-body");
      const label=fieldLabel(item);
      if(item.classList?.contains("setup-date-range")||scheduleRe.test(label))target=schedule.querySelector(".cp-setup-card-body");
      else if(peopleRe.test(label))target=people.querySelector(".cp-setup-card-body");
      target.appendChild(item);
    }

    grid.replaceWith(board);
    return true;
  }

  function refreshShellContext(){
    const active=document.querySelector("#appWindow .tabs > .tab.active");
    const [title,subtitle]=shellMeta(active);
    const heading=document.getElementById("cpWorkspaceTitle");
    const hint=document.getElementById("cpWorkspaceSubtitle");
    if(heading)heading.textContent=title;
    if(hint)hint.textContent=subtitle;
    const current=(document.getElementById("currentFileLabel")?.textContent||"No tournament open").trim();
    const nav=document.getElementById("cpNavTournament");
    if(nav)nav.textContent=current;
  }

  function upgradeWebShell(){
    const root=document.getElementById("appWindow");
    if(!root)return false;
    const titlebar=root.querySelector(":scope > .titlebar");
    const menu=document.getElementById("classicMenuBar");
    const tabs=root.querySelector(".tabs");
    const content=root.querySelector(".content");
    const status=root.querySelector(".statusbar");
    if(!titlebar||!menu||!tabs||!content)return false;

    if(root.dataset.cpWebNativeShell!=="1"){
      root.dataset.cpWebNativeShell="1";
      root.classList.add("cp-native-shell");

      if(!titlebar.querySelector(".cp-brand-lockup")){
        const brand=document.createElement("div");
        brand.className="cp-brand-lockup";
        brand.innerHTML='<span class="cp-brand-mark">CP</span><span class="cp-brand-copy"><strong>Chess-Publisher</strong><span>Web Tournament Manager</span></span>';
        titlebar.prepend(brand);
      }

      const controls=titlebar.querySelector(".window-controls");
      if(controls&&!controls.querySelector(".cp-more-menu")){
        const legacyButtons=[...controls.querySelectorAll(":scope > button")].filter(button=>button.id!=="manualSaveButton");
        if(legacyButtons.length){
          const more=document.createElement("details");
          more.className="cp-more-menu";
          more.innerHTML='<summary title="More window actions" aria-label="More window actions">•••</summary><div class="cp-more-panel"></div>';
          const panel=more.querySelector(".cp-more-panel");
          for(const button of legacyButtons)panel.appendChild(button);
          controls.appendChild(more);
        }
      }

      const body=document.createElement("div");
      body.className="cp-shell-body";
      const stage=document.createElement("div");
      stage.className="cp-stage";
      const workHead=document.createElement("div");
      workHead.className="cp-workspace-head";
      workHead.innerHTML='<div><span class="cp-eyebrow">Tournament workspace</span><h1 id="cpWorkspaceTitle">Tournament Setup</h1><p id="cpWorkspaceSubtitle">Identity, format, schedule and FIDE configuration</p></div>';

      root.insertBefore(body,menu);
      body.appendChild(tabs);
      body.appendChild(stage);
      stage.appendChild(menu);
      stage.appendChild(workHead);
      stage.appendChild(content);
      if(status)stage.appendChild(status);

      tabs.addEventListener("click",event=>{
        if(event.target.closest(".tab"))setTimeout(refreshShellContext,0);
      });
    }

    decorateNavigation();
    buildSetupCards();
    refreshShellContext();
    return true;
  }

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
    try{upgradeWebShell();}catch(error){console.error("Web shell upgrade failed:",error);}
    guardVisibleLoginScreen();
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
      try{upgradeWebShell();decorateNavigation();buildSetupCards();refreshShellContext();}catch(error){console.error("Web shell refresh failed:",error);}
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
      try{upgradeWebShell();decorateNavigation();buildSetupCards();refreshShellContext();}catch(_){}
      if(attempts>=100)clearInterval(timer);
    },100);

    requestAnimationFrame(()=>requestAnimationFrame(revealShell));
  }

  // Run immediately at the end of body. CSS keeps the legacy shell transparent
  // until this DOM migration completes, eliminating the old-program first-paint flash.
  try{upgradeWebShell();}catch(error){console.error("Initial Web shell upgrade failed:",error);}
  guardVisibleLoginScreen();
  setTimeout(revealShell,1200);
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
    loginScreenContinuityGuard:true,
    nativeWebShell:true,
    setupErgonomicCards:true,
    firstPaintFlashGuard:true,
    open:openMyCloud
  };
})();