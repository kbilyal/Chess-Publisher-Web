(()=>{
  "use strict";

  const FIDE_TIE_BREAK_RULES="https://handbook.fide.com/chapter/TieBreakRegulations032026";
  const ratingTypes=new Set(["Standard","Rapid","Blitz"]);
  let updateQueued=false;

  function currentTournament(){
    try{return typeof window.getCurrentTournament==="function" ? window.getCurrentTournament() : null;}
    catch(_){return null;}
  }

  function field(id){return document.getElementById(id);}
  function value(id){return String(field(id)?.value||"").trim();}

  function effectiveTimeControl(){
    return value("timeControl")==="Custom" ? value("customTimeControl") : value("timeControl");
  }

  function addIssue(issues,id,message){issues.push({id,message});}

  function reviewSetup(){
    const tournament=currentTournament();
    if(!tournament)return [{id:"mainTournamentName",message:"Create or open a tournament."}];

    const issues=[];
    if(!value("mainTournamentName"))addIssue(issues,"mainTournamentName","Tournament Name is required.");
    if(!value("country"))addIssue(issues,"country","Country / FED is required.");
    if(!effectiveTimeControl())addIssue(issues,value("timeControl")==="Custom"?"customTimeControl":"timeControl","Time Control is required.");
    if(!value("startDate"))addIssue(issues,"startDate","Start Date & Time is required.");
    if(!value("endDate"))addIssue(issues,"endDate","End Date & Time is required.");

    const start=Date.parse(value("startDate"));
    const end=Date.parse(value("endDate"));
    if(Number.isFinite(start)&&Number.isFinite(end)&&end<start){
      addIssue(issues,"endDate","End Date & Time cannot be earlier than the start.");
    }

    const roundRobin=/round robin/i.test(value("tournamentFormat"));
    const registered=Array.isArray(tournament.players)?tournament.players.length:0;
    const rounds=Number(value("rounds"));
    const maximum=roundRobin?999:99;
    if(roundRobin&&registered<2){
      addIssue(issues,"webSetupOpenPlayers","Add at least 2 players to calculate the Round Robin schedule.");
    }else if(!Number.isInteger(rounds)||rounds<1||rounds>maximum){
      addIssue(issues,"rounds",`Number of Rounds must be a whole number from 1 to ${maximum}.`);
    }
    if(!value("tournamentFormat"))addIssue(issues,"tournamentFormat","Tournament Format is required.");
    if(!value("pairingSystem"))addIssue(issues,"pairingSystem","Pairing System is required.");
    if(!value("fideRated"))addIssue(issues,"fideRated","FIDE Rated must be selected.");
    if(!value("tournamentRatingType"))addIssue(issues,"tournamentRatingType","Rating Type is required.");
    if(!value("initialRatingSource"))addIssue(issues,"initialRatingSource","Rating / Strength Source is required.");
    if(value("pairingScoreSystem")!=="game-1-0.5-0"){
      addIssue(issues,"pairingScoreSystem","Pairing Score must be game points (1, ½, 0).");
    }
    if(!value("tournamentType")||value("tournamentType")==="unknown"){
      addIssue(issues,"tournamentType","Tournament Type must be selected.");
    }

    if(value("fideRated")==="Yes"){
      if(!value("chiefArbiter"))addIssue(issues,"chiefArbiter","Chief Arbiter is required for a FIDE-rated tournament.");
      if(!value("city"))addIssue(issues,"city","City is required for a FIDE-rated tournament.");
      const ratingType=value("tournamentRatingType");
      const calculation=value("regRating");
      if(ratingType==="Unrated"){
        addIssue(issues,"tournamentRatingType","A FIDE-rated tournament cannot use Unrated as its Rating Type.");
      }else if(ratingTypes.has(ratingType)&&calculation!==`FIDE ${ratingType} Rated`){
        addIssue(issues,"regRating",`Rating Calculation must be FIDE ${ratingType} Rated.`);
      }
      if(value("tournamentType")==="test"){
        addIssue(issues,"tournamentType","A Test tournament cannot be marked FIDE Rated.");
      }
    }

    const maximumPlayers=value("maximumPlayers");
    if(maximumPlayers){
      const limit=Number(maximumPlayers);
      if(!Number.isInteger(limit)||limit<1)addIssue(issues,"maximumPlayers","Maximum Players must be a positive whole number.");
      else if(limit<registered)addIssue(issues,"maximumPlayers",`Maximum Players cannot be below the ${registered} registered players.`);
    }

    const email=value("email");
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))addIssue(issues,"email","Contact E-mail is not valid.");

    return issues;
  }

  function selectedTieBreaks(){
    try{return typeof window.getTournamentTieBreakPriority==="function" ? window.getTournamentTieBreakPriority() : [];}
    catch(_){return [];}
  }

  function enhanceTieBreakControls(){
    const rows=[...document.querySelectorAll("#tieBreakPriorityList .tie-break-priority-row")];
    rows.forEach((row,index)=>{
      const name=row.querySelector(".tie-break-name span")?.textContent?.trim()||`TB${index+1}`;
      const buttons=[...row.querySelectorAll("button")];
      for(const button of buttons){
        const text=button.textContent.trim();
        if(text==="↑")button.setAttribute("aria-label",`Move ${name} to higher priority`);
        else if(text==="↓")button.setAttribute("aria-label",`Move ${name} to lower priority`);
        else if(text==="Remove")button.setAttribute("aria-label",`Remove ${name}`);
        else if(text==="Settings")button.setAttribute("aria-label",`Settings for ${name}`);
      }
    });
  }

  function renderReview(){
    updateQueued=false;
    const panel=field("webSetupReview");
    if(!panel)return;
    const issues=reviewSetup();
    const ties=selectedTieBreaks();
    const badge=field("webSetupReviewBadge");
    const summary=field("webSetupReviewSummary");
    const next=field("webSetupReviewNext");
    const tieStatus=field("webTieBreakReviewStatus");
    const roundRobin=/round robin/i.test(value("tournamentFormat"));
    const essentialsTitle=document.querySelector("#main .pairing-essentials-box > .group-title");
    if(essentialsTitle)essentialsTitle.textContent=`Pairing Essentials (${roundRobin?"Round Robin":"Swiss"})`;

    if(badge){
      badge.textContent=issues.length?`${issues.length} item${issues.length===1?"":"s"} to review`:"Setup complete";
      badge.className=`badge ${issues.length?"cp-web-review-warn":"cp-web-review-ok"}`;
    }
    if(summary){
      summary.textContent=issues.length?issues[0].message:"Required setup fields are complete.";
      summary.title=issues.map(issue=>issue.message).join("\n");
    }
    if(next){
      next.disabled=!issues.length;
      next.textContent=issues.length?"Review next item":"Reviewed";
      next.onclick=()=>{
        if(issues[0]?.id==="webSetupOpenPlayers"){
          field("webSetupOpenPlayers")?.click();
          return;
        }
        const target=field(issues[0]?.id);
        target?.scrollIntoView({behavior:"smooth",block:"center"});
        target?.focus();
      };
    }

    document.querySelectorAll(".cp-web-setup-missing").forEach(element=>{
      element.classList.remove("cp-web-setup-missing");
      element.removeAttribute("data-cp-web-setup-message");
    });
    for(const issue of issues){
      const target=field(issue.id);
      if(!target)continue;
      target.classList.add("cp-web-setup-missing");
      target.dataset.cpWebSetupMessage=issue.message;
    }

    if(tieStatus){
      const rated=value("fideRated")==="Yes";
      tieStatus.textContent=ties.length
        ? `${ties.length}/6 selected • applied from TB1 downward`
        : rated
          ? "No tie-breaks selected • publish an ordered list before the event starts"
          : "No tie-breaks selected";
      tieStatus.className=`badge ${ties.length?"cp-web-review-ok":"cp-web-review-warn"}`;
    }
    enhanceTieBreakControls();
  }

  function queueReview(){
    if(updateQueued)return;
    updateQueued=true;
    queueMicrotask(renderReview);
  }

  function synchronizeRatingCalculation(){
    const tournament=currentTournament();
    if(!tournament)return false;
    const select=field("regRating");
    if(!select)return false;
    const rated=value("fideRated");
    const type=value("tournamentRatingType");
    const current=value("regRating");
    let wanted="";

    if(rated==="No"&&(!current||/^FIDE\s+(?:Standard|Rapid|Blitz)\s+Rated$/i.test(current)))wanted="Unrated";
    if(rated==="Yes"&&effectiveTimeControl()&&ratingTypes.has(type)&&(!current||current==="Unrated"||/^FIDE\s+(?:Standard|Rapid|Blitz)\s+Rated$/i.test(current))){
      wanted=`FIDE ${type} Rated`;
    }
    if(!wanted||wanted===current)return false;

    select.value=wanted;
    if(typeof window.saveAll==="function")window.saveAll();
    if(typeof window.setStatus==="function")window.setStatus(`Rating Calculation synchronized: ${wanted}`);
    return true;
  }

  function install(){
    const page=field("main");
    const tieList=field("tieBreakPriorityList");
    if(!page||!tieList)return false;
    if(field("webSetupReview"))return true;

    const style=document.createElement("style");
    style.id="cpWebTournamentSetupStyles";
    style.textContent=`
      #webSetupReview{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px;padding:8px 10px;border:1px solid #b8c7d9;border-radius:6px;background:#f6f9fc}
      #webSetupReviewSummary{flex:1;min-width:260px}
      .cp-web-review-ok{background:#e8f7ea!important;color:#145c24!important;border-color:#9ecba8!important}
      .cp-web-review-warn{background:#fff4d6!important;color:#765300!important;border-color:#dabd6d!important}
      .cp-web-setup-missing{outline:2px solid #d08a00!important;outline-offset:1px}
      #webTieBreakReview{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 7px}
      #webTieBreakReview a{margin-left:auto}
    `;
    document.head.appendChild(style);

    const review=document.createElement("section");
    review.id="webSetupReview";
    review.setAttribute("aria-live","polite");
    review.innerHTML=`<b>Setup review</b><span id="webSetupReviewBadge" class="badge"></span><span id="webSetupReviewSummary"></span><button id="webSetupReviewNext" type="button">Review next item</button><button id="webSetupOpenPlayers" type="button">Open Lists &amp; Players</button>`;
    const currentRow=page.querySelector(":scope > .current-row");
    currentRow?.insertAdjacentElement("afterend",review);
    field("webSetupOpenPlayers").onclick=()=>window.showTab?.("registration",field("tabRegistration"));

    const tieReview=document.createElement("div");
    tieReview.id="webTieBreakReview";
    tieReview.innerHTML=`<b>Tie-break review</b><span id="webTieBreakReviewStatus" class="badge"></span><span>Priority is evaluated from TB1 downward.</span><a href="${FIDE_TIE_BREAK_RULES}" target="_blank" rel="noopener noreferrer">FIDE 2026 rules ↗</a>`;
    tieList.insertAdjacentElement("beforebegin",tieReview);

    const ratingTriggers=new Set(["timeControl","customTimeControl","fideRated","tournamentRatingType"]);
    page.addEventListener("input",event=>{
      if(ratingTriggers.has(event.target?.id))queueMicrotask(synchronizeRatingCalculation);
      queueReview();
    });
    page.addEventListener("change",event=>{
      if(ratingTriggers.has(event.target?.id))queueMicrotask(synchronizeRatingCalculation);
      queueReview();
    });
    document.addEventListener("click",event=>{
      if(event.target?.id==="tabMain")setTimeout(renderReview,0);
    });
    new MutationObserver(queueReview).observe(tieList,{childList:true,subtree:true});

    for(const delay of [0,250,1000])setTimeout(()=>{
      synchronizeRatingCalculation();
      renderReview();
    },delay);
    window.__cpWebTournamentSetup={
      enabled:true,
      fideRulesUrl:FIDE_TIE_BREAK_RULES,
      review:reviewSetup,
      render:renderReview,
      synchronizeRatingCalculation
    };
    return true;
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
