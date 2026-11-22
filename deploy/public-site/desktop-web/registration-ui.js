(() => {
  if (window.__cpRegRedesignApplied) return;
  window.__cpRegRedesignApplied = true;

  const qs = (sel, root = document) => root.querySelector(sel);

  function syncSegmentedRatingUI() {
    const sel = document.getElementById("defaultRating");
    if (!sel) return;
    const val = sel.value || "std";
    document.querySelectorAll(".cp-reg-rating-seg-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.ratingCtrl === val);
    });
  }

  function syncFideMiniSummary() {
    const el = document.getElementById("cpRegFideMiniSummaryText");
    if (!el) return;
    const fmt = (raw) => {
      const n = parseInt(String(raw || "").replace(/[^0-9]/g, ""), 10);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n >= 1000 ? `${Math.floor(n / 1000)}k` : String(n);
    };
    const date = (qs("#ratingListsStdDate")?.textContent || "").trim();
    const std = fmt(qs("#ratingListsStdCount")?.textContent);
    const rpd = fmt(qs("#ratingListsRapidCount")?.textContent);
    const blz = fmt(qs("#ratingListsBlitzCount")?.textContent);
    const parts = [];
    if (std) parts.push(`STD ${std}`);
    if (rpd) parts.push(`RPD ${rpd}`);
    if (blz) parts.push(`BLZ ${blz}`);
    const next = parts.length
      ? `FIDE ${date ? date + " · " : ""}${parts.join(" · ")}`
      : ((qs("#fideAutoStatus")?.textContent || "").trim() || "FIDE Rating DB");
    if (el.textContent !== next) el.textContent = next;
  }

  function syncResortButtonHighlight() {
    const badge = document.getElementById("startingRankResortState");
    const btn = document.getElementById("resortStartingListBtn");
    if (!badge || !btn) return;
    const needs = badge.classList.contains("workflow-warn") || /required|warn/i.test(badge.textContent || "");
    btn.classList.toggle("cp-reg-needs-action", needs);
  }

  function enhanceRegistrationPage() {
    const reg = document.getElementById("registration");
    if (!reg || reg.dataset.cpRegEnhanced === "1") return;
    reg.dataset.cpRegEnhanced = "1";

    /* 1. Top Command Strip + Collapsible 2-Column Drawer (#cpPlayersRatingDataBox) */
    const ratingBox = document.getElementById("cpPlayersRatingDataBox");
    if (ratingBox) {
      ratingBox.classList.add("cp-reg-drawer-collapsed");

      const importBtn = qs(".player-import-toolbar button", ratingBox);
      const updateBtn = document.getElementById("btnAutoUpdateFide");
      const reviewBtn = document.getElementById("btnUpdateRegisteredFromFide");
      const toggleBtn = document.getElementById("btnToggleRatingTools");
      const fideAutoStatus = document.getElementById("fideAutoStatus");
      const libHome = document.getElementById("cpRatingListLibraryHome");
      const libStatus = document.getElementById("cpRatingListLibraryStatus");
      const importInfo = document.getElementById("importInfo");
      const clusterGrid = qs(".button-cluster-grid", ratingBox);
      const clusters = clusterGrid ? Array.from(clusterGrid.querySelectorAll(":scope > .button-cluster")) : [];
      const integratedPanel = document.getElementById("integratedRatingListsPanel");

      if (updateBtn) {
        updateBtn.textContent = "⬇ Download / Update FIDE Lists";
        if (!updateBtn.title) {
          updateBtn.title = "Download and update official FIDE Standard, Rapid and Blitz rating lists";
        }
      }

      const cmdStrip = document.createElement("div");
      cmdStrip.className = "cp-reg-command-strip";

      const stripLeft = document.createElement("div");
      stripLeft.className = "cp-reg-strip-left";
      if (importBtn) stripLeft.appendChild(importBtn);

      const div1 = document.createElement("span");
      div1.className = "cp-reg-strip-divider";
      stripLeft.appendChild(div1);

      const fideMini = document.createElement("div");
      fideMini.className = "cp-reg-fide-mini";
      fideMini.innerHTML = '<span class="cp-reg-fide-dot"></span><span id="cpRegFideMiniSummaryText">FIDE Rating DB</span>';
      stripLeft.appendChild(fideMini);

      if (updateBtn) stripLeft.appendChild(updateBtn);
      if (reviewBtn) stripLeft.appendChild(reviewBtn);

      const stripRight = document.createElement("div");
      stripRight.className = "cp-reg-strip-right";
      if (libStatus) stripRight.appendChild(libStatus);
      if (toggleBtn) {
        toggleBtn.textContent = "⚙ Rating Data & Library ▾";
        stripRight.appendChild(toggleBtn);
      }

      cmdStrip.appendChild(stripLeft);
      cmdStrip.appendChild(stripRight);

      const drawerBody = document.createElement("div");
      drawerBody.className = "cp-reg-drawer-body";

      /* Drawer Left Card: Integrated FIDE Lists */
      const leftCard = document.createElement("div");
      leftCard.className = "cp-reg-drawer-card";
      const leftHead = document.createElement("div");
      leftHead.className = "cp-reg-drawer-card-header";
      const leftTitle = document.createElement("span");
      leftTitle.textContent = "Integrated FIDE Rating Lists";
      leftHead.appendChild(leftTitle);
      if (fideAutoStatus) leftHead.appendChild(fideAutoStatus);
      leftCard.appendChild(leftHead);

      const fideDrawerContent = document.createElement("div");
      fideDrawerContent.className = "cp-reg-fide-drawer-body";
      if (integratedPanel) fideDrawerContent.appendChild(integratedPanel);
      if (clusters[1]) {
        Array.from(clusters[1].children).forEach(ch => {
          if (!ch.classList.contains("button-cluster-title") && !ch.classList.contains("fide-db-toolbar")) {
            fideDrawerContent.appendChild(ch);
          }
        });
      }
      leftCard.appendChild(fideDrawerContent);

      /* Drawer Right Card: Rating List Library + Manual .txt Import */
      const rightCard = document.createElement("div");
      rightCard.className = "cp-reg-drawer-card";
      const rightHead = document.createElement("div");
      rightHead.className = "cp-reg-drawer-card-header";
      rightHead.innerHTML = '<span>Custom Rating List Library</span><span class="help">Searchable only</span>';
      rightCard.appendChild(rightHead);

      if (libHome) {
        const libTitle = qs(".group-title", libHome);
        if (libTitle) libTitle.classList.add("cp-reg-hidden-shell");
        rightCard.appendChild(libHome);
      }

      if (clusters[2]) {
        const manualDetails = document.createElement("details");
        manualDetails.className = "cp-reg-manual-txt-details";
        const manualSummary = document.createElement("summary");
        manualSummary.textContent = "Manual FIDE .txt Rating List Import (Advanced)";
        manualDetails.appendChild(manualSummary);

        const manualInner = document.createElement("div");
        manualInner.className = "cp-reg-manual-txt-inner";
        Array.from(clusters[2].children).forEach(ch => {
          if (!ch.classList.contains("button-cluster-title")) {
            manualInner.appendChild(ch);
          }
        });
        if (importInfo) manualInner.appendChild(importInfo);
        manualDetails.appendChild(manualInner);
        rightCard.appendChild(manualDetails);
      }

      drawerBody.appendChild(leftCard);
      drawerBody.appendChild(rightCard);

      const oldTitle = qs(":scope > .group-title", ratingBox);
      if (oldTitle) oldTitle.classList.add("cp-reg-hidden-shell");
      if (clusterGrid) clusterGrid.classList.add("cp-reg-hidden-shell");

      ratingBox.prepend(drawerBody);
      ratingBox.prepend(cmdStrip);

      const origToggle = window.toggleRatingToolsCollapse;
      window.toggleRatingToolsCollapse = function () {
        const collapsed = ratingBox.classList.toggle("cp-reg-drawer-collapsed");
        if (toggleBtn) {
          toggleBtn.textContent = collapsed ? "⚙ Rating Data & Library ▾" : "▲ Collapse Rating Tools";
        }
        if (typeof origToggle === "function") {
          try {
            if (clusterGrid && clusterGrid.classList.contains("hidden")) {
              clusterGrid.classList.remove("hidden");
            }
          } catch (_) {}
        }
      };

      syncFideMiniSummary();
    }

    /* 2. Manual player entry: preview-matching compact disclosure.
       The original form, field IDs and event handlers are retained intact. */
    const manualAddBtn = document.getElementById("manualAddPlayerBtn");
    const manualBox = manualAddBtn?.closest(".groupbox");
    if (manualBox) {
      manualBox.classList.add("cp-reg-manual-box", "cp-reg-manual-collapsed");
      const mTitle = qs(":scope > .group-title", manualBox);
      if (mTitle && !qs(".cp-reg-manual-collapse-btn", mTitle)) {
        const hint = document.createElement("span");
        hint.className = "cp-reg-manual-hint";
        hint.textContent = "— add unrated or unlisted player directly to Starting Rank List";
        mTitle.appendChild(hint);
        const mToggle = document.createElement("button");
        mToggle.type = "button";
        mToggle.className = "cp-reg-manual-collapse-btn";
        mToggle.textContent = "Show Form ▾";
        mToggle.title = "Collapse or expand manual player entry form";
        mToggle.setAttribute("aria-expanded", "false");
        mToggle.addEventListener("click", () => {
          const isHidden = manualBox.classList.toggle("cp-reg-manual-collapsed");
          mToggle.textContent = isHidden ? "Show Form ▾" : "Hide Form ▴";
          mToggle.setAttribute("aria-expanded", String(!isHidden));
        });
        mTitle.appendChild(mToggle);
      }
    }

    /* 3. Left Pane (#fideResultsBox): Clear Rating Time-Control Switcher + Search */
    const fideResultsBox = document.getElementById("fideResultsBox");
    const fideSearch = document.getElementById("fideSearch");
    const defaultRating = document.getElementById("defaultRating");
    if (fideResultsBox) {
      const fideTitle = qs(".fide-results-title", fideResultsBox);
      const controlBar = document.createElement("div");
      controlBar.className = "cp-reg-rating-control-bar";
      controlBar.title = "Choose which FIDE rating (Standard, Rapid, or Blitz) is used when adding players";

      const labelSpan = document.createElement("span");
      labelSpan.className = "cp-reg-rating-control-label";
      labelSpan.textContent = "Add with Rating:";
      controlBar.appendChild(labelSpan);

      const segGroup = document.createElement("div");
      segGroup.className = "cp-reg-rating-segmented";
      segGroup.setAttribute("role", "group");
      segGroup.setAttribute("aria-label", "Rating time control");

      [
        ["std", "Standard"],
        ["rapid", "Rapid"],
        ["blitz", "Blitz"]
      ].forEach(([val, text]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cp-reg-rating-seg-btn";
        b.dataset.ratingCtrl = val;
        b.textContent = text;
        b.addEventListener("click", () => {
          if (!defaultRating) return;
          defaultRating.value = val;
          syncSegmentedRatingUI();
          defaultRating.dispatchEvent(new Event("change", { bubbles: true }));
          if (typeof window.queueFideSearch === "function") {
            try { window.queueFideSearch(); } catch (_) {}
          }
        });
        segGroup.appendChild(b);
      });
      controlBar.appendChild(segGroup);

      if (defaultRating) {
        defaultRating.classList.add("cp-reg-sr-select");
        defaultRating.addEventListener("change", syncSegmentedRatingUI);
        controlBar.appendChild(defaultRating);
      }

      const searchBar = document.createElement("div");
      searchBar.className = "cp-reg-fide-search-bar";
      if (fideSearch) searchBar.appendChild(fideSearch);

      if (fideTitle && fideTitle.nextSibling) {
        fideResultsBox.insertBefore(controlBar, fideTitle.nextSibling);
        fideResultsBox.insertBefore(searchBar, controlBar.nextSibling);
      } else {
        fideResultsBox.prepend(searchBar);
        fideResultsBox.prepend(controlBar);
      }
      syncSegmentedRatingUI();
    }

    /* 4. Right Pane (#startingRankBox): Header CTA + Action Row + Unified Exports */
    const startingBox = document.getElementById("startingRankBox");
    if (startingBox) {
      const header = qs(":scope > .group-title", startingBox);
      const resortState = document.getElementById("startingRankResortState");
      const fontControls = qs(".starting-font-controls", startingBox);
      const maximizeBtn = document.getElementById("btnMaximizeLists");
      const pairingsBtn = document.getElementById("btnStartingListToPairings");

      if (header) {
        const leftWrap = document.createElement("div");
        leftWrap.className = "cp-reg-pane-head-left";
        const origLabel = qs("span:first-child", header);
        if (origLabel) leftWrap.appendChild(origLabel);
        if (resortState) leftWrap.appendChild(resortState);

        const rightWrap = document.createElement("div");
        rightWrap.className = "cp-reg-pane-head-right";
        if (fontControls) rightWrap.appendChild(fontControls);
        if (maximizeBtn) rightWrap.appendChild(maximizeBtn);
        if (pairingsBtn) rightWrap.appendChild(pairingsBtn);

        header.textContent = "";
        header.appendChild(leftWrap);
        header.appendChild(rightWrap);
      }

      const origTools = qs(".starting-rank-tools", startingBox);
      const tableFrame = qs(".table-frame", startingBox);
      const searchInput = document.getElementById("startingRankSearch");
      const sortMode = document.getElementById("sortMode");
      const sortTools = sortMode?.closest(".inline-tools");
      const actionRow = qs(".player-action-row", reg);
      const editBtn = actionRow ? qs('button[onclick*="editSelectedPlayer"]', actionRow) : null;
      const deleteBtn = document.getElementById("deleteSelectedPlayersBtn");
      const selectedCount = document.getElementById("selectedCount");

      const row2 = document.createElement("div");
      row2.className = "cp-reg-subbar";
      const row2Left = document.createElement("div");
      row2Left.className = "cp-reg-subbar-group";
      if (searchInput) row2Left.appendChild(searchInput);
      if (sortTools) row2Left.appendChild(sortTools);

      const row2Right = document.createElement("div");
      row2Right.className = "cp-reg-subbar-group";
      if (selectedCount) row2Right.appendChild(selectedCount);
      if (editBtn) row2Right.appendChild(editBtn);
      if (deleteBtn) row2Right.appendChild(deleteBtn);

      row2.appendChild(row2Left);
      row2.appendChild(row2Right);

      const resortBtn = document.getElementById("resortStartingListBtn");
      const tpnDrawBtn = document.getElementById("cpRrTpnDrawBtn");
      const tpnExchBtn = document.getElementById("cpTpnExchangeBtn");
      const publishStrip = qs(".publish-strip-pro", reg);
      const txtBtn = publishStrip ? qs('button[onclick*="exportParticipantsTxt"]', publishStrip) : null;
      const pdfBtn = publishStrip ? qs('button[onclick*="openStartingListExportDialog"]', publishStrip) : null;
      const xmlBtn = document.getElementById("exportPlayersXmlBtn");

      const row3 = document.createElement("div");
      row3.className = "cp-reg-subbar cp-reg-subbar-muted";
      const tpnGroup = document.createElement("div");
      tpnGroup.className = "cp-reg-subbar-group cp-reg-tpn-group";
      if (resortBtn) tpnGroup.appendChild(resortBtn);
      if (tpnDrawBtn) tpnGroup.appendChild(tpnDrawBtn);
      if (tpnExchBtn) tpnGroup.appendChild(tpnExchBtn);

      const exportGroup = document.createElement("div");
      exportGroup.className = "cp-reg-export-segmented";
      const exportLabel = document.createElement("span");
      exportLabel.className = "cp-reg-export-label";
      exportLabel.textContent = "Export:";
      exportGroup.appendChild(exportLabel);
      if (txtBtn) exportGroup.appendChild(txtBtn);
      if (pdfBtn) exportGroup.appendChild(pdfBtn);
      if (xmlBtn) exportGroup.appendChild(xmlBtn);

      row3.appendChild(tpnGroup);
      row3.appendChild(exportGroup);

      if (origTools) origTools.classList.add("cp-reg-hidden-shell");
      if (actionRow) actionRow.classList.add("cp-reg-hidden-shell");
      if (publishStrip) publishStrip.classList.add("cp-reg-hidden-shell");

      if (tableFrame) {
        startingBox.insertBefore(row2, tableFrame);
        startingBox.insertBefore(row3, tableFrame);
      } else {
        startingBox.appendChild(row2);
        startingBox.appendChild(row3);
      }

      const lateBar = document.getElementById("cpR11LateEntryBar");
      if (lateBar && tableFrame) {
        startingBox.insertBefore(lateBar, tableFrame);
      }

      syncResortButtonHighlight();
    }

    /* 5. Lightweight observer for late-injected elements & status updates */
    const obsOpts = { childList: true, subtree: true, characterData: true };
    const observer = new MutationObserver(() => {
      // Disconnect around our own DOM sync so mutations never cascade synchronously.
      observer.disconnect();
      try {
        syncFideMiniSummary();
        syncResortButtonHighlight();
        syncSegmentedRatingUI();

        const tpnGroup = qs(".cp-reg-tpn-group", reg);
        if (tpnGroup) {
          ["cpRrTpnDrawBtn", "cpTpnExchangeBtn"].forEach(id => {
            const b = document.getElementById(id);
            if (b && b.parentElement !== tpnGroup) tpnGroup.appendChild(b);
          });
        }

        const startingTable = qs("#startingRankBox .table-frame", reg);
        const lateBar = document.getElementById("cpR11LateEntryBar");
        if (lateBar && startingTable && lateBar.parentElement !== startingTable.parentElement) {
          startingTable.parentElement.insertBefore(lateBar, startingTable);
        }

        const fideDrawer = qs(".cp-reg-fide-drawer-body", reg);
        const panel = document.getElementById("integratedRatingListsPanel");
        if (panel && fideDrawer && panel.parentElement !== fideDrawer) {
          fideDrawer.prepend(panel);
        }
      } finally {
        observer.observe(reg, obsOpts);
      }
    });
    observer.observe(reg, obsOpts);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceRegistrationPage);
  } else {
    enhanceRegistrationPage();
  }
})();
