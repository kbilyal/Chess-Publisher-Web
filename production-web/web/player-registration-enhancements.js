(()=>{
  "use strict";

  const inputIds=["manualName","manualRating","manualFide","manualBirth"];
  let addInProgress=false;

  function currentTournament(){
    try{return typeof window.getCurrentTournament==="function" ? window.getCurrentTournament() : null;}
    catch(_){return null;}
  }

  function playerCount(){
    const players=currentTournament()?.players;
    return Array.isArray(players) ? players.length : 0;
  }

  function setAddButtonState(button){
    const tournamentReady=!!currentTournament();
    button.disabled=addInProgress||!tournamentReady;
    button.setAttribute("aria-busy",addInProgress?"true":"false");
    button.title=!tournamentReady
      ? "Create or open a tournament before adding players."
      : addInProgress
        ? "Adding player…"
        : "Add this player (Enter)";
  }

  async function addPlayer(button,originalAdd){
    if(addInProgress)return;
    if(!currentTournament()){
      if(typeof window.appAlert==="function"){
        await window.appAlert(
          "Create or open a tournament before adding players.",
          "Add Player",
          "warning"
        );
      }
      setAddButtonState(button);
      return;
    }

    const enteredName=String(document.getElementById("manualName")?.value||"")
      .replace(/\s+/g," ")
      .trim();
    const before=playerCount();
    addInProgress=true;
    setAddButtonState(button);

    try{
      await originalAdd();
      const after=playerCount();
      if(after>before){
        const added=currentTournament()?.players?.[after-1];
        const name=String(added?.name||enteredName||"Player");
        if(typeof window.setStatus==="function"){
          window.setStatus(`Player added: ${name} • ${after} registered player${after===1?"":"s"}`);
        }
        document.getElementById("manualName")?.focus();
      }
    }catch(error){
      console.error("Web player registration failed:",error);
      if(typeof window.appAlert==="function"){
        await window.appAlert(
          `The player could not be added.\n\n${error?.message||String(error)}`,
          "Add Player",
          "error"
        );
      }
    }finally{
      addInProgress=false;
      setAddButtonState(button);
    }
  }

  function install(){
    const registration=document.getElementById("registration");
    const button=registration?.querySelector('button[onclick="addManualPlayer()"]');
    const originalAdd=window.addManualPlayer;
    if(!registration||!button||typeof originalAdd!=="function")return false;
    if(button.dataset.cpWebRegistrationInstalled==="1")return true;

    button.dataset.cpWebRegistrationInstalled="1";
    button.id="manualAddPlayerButton";
    button.type="button";
    button.removeAttribute("onclick");
    button.onclick=null;
    button.addEventListener("click",()=>addPlayer(button,originalAdd));

    for(const id of inputIds){
      const input=document.getElementById(id);
      if(!input)continue;
      input.addEventListener("keydown",event=>{
        if(event.key!=="Enter"||event.isComposing)return;
        event.preventDefault();
        button.click();
      });
      input.addEventListener("input",()=>setAddButtonState(button));
      input.setAttribute("aria-describedby","webPlayerAddHint");
    }

    const toolbar=button.closest(".toolbar");
    if(toolbar&&!document.getElementById("webPlayerAddHint")){
      const hint=document.createElement("div");
      hint.id="webPlayerAddHint";
      hint.className="special-prize-result-note";
      hint.textContent="Name is required. Rating defaults to 0; FIDE ID and birth are optional. Press Enter to add, then Resort Starting List when registration is complete.";
      hint.style.marginTop="6px";
      toolbar.insertAdjacentElement("afterend",hint);
    }

    document.addEventListener("click",()=>queueMicrotask(()=>setAddButtonState(button)));
    setAddButtonState(button);
    window.__cpWebPlayerRegistration={enabled:true,buttonId:button.id,inputIds:[...inputIds]};
    return true;
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
