(()=>{
  "use strict";

  try{
    if(window.__cpCloudWorkspaceAdapterLoaded)return;
    window.__cpCloudWorkspaceAdapterLoaded=true;

    const CLIENT_VERSION="1.06.00-beta.6";
    const WEB_APP_URL="https://web.chess-publisher.org/";
    const ORGANIZER_SECRET_KEY="organizer-primary";
    const AUTO_SYNC_KEY="ChessPublisherCloudWorkspace_AutoSync_v1";
    const DEVICE_ID_KEY="ChessPublisherCloudWorkspace_DeviceId_v1";
    const DEVICE_LABEL_KEY="ChessPublisherCloudWorkspace_DeviceLabel_v1";
    const apiLib=window.ChessPublisherCloudWorkspaceApi;
    if(!apiLib)throw new Error("Cloud Workspace API client module is unavailable.");
    const api=apiLib.createClient({clientVersion:CLIENT_VERSION});

    const text=v=>v==null?"":String(v).trim();
    const clone=v=>JSON.parse(JSON.stringify(v));
    const esc=v=>text(v).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const runtimeState=new Map();

    let tokenCache="";
    let organizerInfo=null;
    let workspaceInfo=null;
    let settingsRevision=0;
    let settingsChecksum="";
    let settingsLastSyncedAt="";
    let settingsSyncTimer=null;
    let syncChain=Promise.resolve();
    let foregroundBusy=0;
    let cloudList=[];
    let lastPersistenceSignature="";
    let autoSyncTimer=null;
    let monitorTimer=null;
    let startupSweepDone=false;
    let suppressAutoSync=0;
    // Metadata writes (cloud ID, revision, fingerprint) are consequences of
    // a cloud operation, not new tournament edits. Remember their local
    // persistence revision so the monitor does not schedule another cloud
    // operation for the save it just initiated.
    const cloudMetadataRevisions=new Set();

    function autoSyncEnabled(){
      // Beta.4 is conservative by default: background cloud backup is opt-in.
      // Existing users who explicitly enabled it keep their preference ("1").
      try{return localStorage.getItem(AUTO_SYNC_KEY)==="1";}catch(_){return false;}
    }
    function setAutoSyncEnabled(enabled){
      try{localStorage.setItem(AUTO_SYNC_KEY,enabled?"1":"0");}catch(_){ }
      const input=document.getElementById("cloudAutoSync");if(input)input.checked=!!enabled;
    }
    function uuid(){return globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;}
    function deviceId(){
      let value="";try{value=text(localStorage.getItem(DEVICE_ID_KEY));}catch(_){ }
      if(!value){value=`device:${uuid()}`;try{localStorage.setItem(DEVICE_ID_KEY,value);}catch(_){ }}
      return value;
    }
    function deviceLabel(){
      let value="";try{value=text(localStorage.getItem(DEVICE_LABEL_KEY));}catch(_){ }
      if(value)return value;
      const platform=text(navigator.userAgentData?.platform||navigator.platform)||"Windows";
      value=`${platform} PC`;
      try{localStorage.setItem(DEVICE_LABEL_KEY,value);}catch(_){ }
      return value;
    }
    function setDeviceLabel(value){
      const label=text(value).slice(0,160)||"Windows PC";
      try{localStorage.setItem(DEVICE_LABEL_KEY,label);}catch(_){ }
      return label;
    }

    function currentTournament(){try{return typeof getCurrentTournament==="function"?getCurrentTournament():null;}catch(_){return null;}}
    function currentName(){return text(data?.currentTournament);}
    function findNameByTournament(tournament){
      try{for(const [name,value] of Object.entries(data?.tournaments||{}))if(value===tournament)return name;}catch(_){ }
      return "";
    }

    function ensureCloudMeta(tournament){
      if(!tournament||typeof tournament!=="object")throw new Error("No tournament is open.");
      if(!tournament.cloud||typeof tournament.cloud!=="object"||Array.isArray(tournament.cloud))tournament.cloud={};
      const meta=tournament.cloud;
      if(!text(meta.localKey))meta.localKey=`cp-cloud:${uuid()}`;
      // internalId is the logical tournament identity shared by this PC and the
      // organizer's private cloud object. It is NOT an authorization key and is
      // deliberately separate from the installation-local localKey.
      if(!text(meta.internalId)){
        // Beta.1-beta.3 cloud records were created with localKey as their remote
        // stable key. Reusing it for already-linked tournaments migrates without
        // creating a duplicate cloud object or a needless content revision.
        meta.internalId=text(meta.cloudTournamentId)?meta.localKey:(text(tournament?.hub?.localKey)||`cp-tournament:${uuid()}`);
      }
      const previousSchema=Math.max(0,Number(meta.schemaVersion)||0);
      const previousDesktopFingerprint=text(meta.lastSyncedContentHash).toLowerCase();
      const previousWebFingerprint=text(meta.baseFingerprint).toLowerCase();
      meta.schemaVersion=4;
      meta.internalId=text(meta.internalId);
      meta.cloudTournamentId=text(meta.cloudTournamentId);
      meta.ownerId=text(meta.ownerId);
      // beta.5 dual-writes the desktop beta.1-beta.4 field names and the Web
      // schema-v4 common-base names. Legacy desktop content hashes used a
      // different payload, so they are deliberately invalidated and rebuilt
      // from the immutable base revision rather than causing a false conflict.
      meta.revision=Math.max(0,Number(meta.revision ?? meta.baseRevision)||0);
      meta.baseRevision=Math.max(0,Number(meta.baseRevision ?? meta.revision)||0);
      meta.lastSyncedAt=text(meta.lastSyncedAt||meta.lastSyncAt);
      meta.lastSyncAt=text(meta.lastSyncAt||meta.lastSyncedAt);
      meta.lastSyncedHash=text(meta.lastSyncedHash).toLowerCase();
      const compatibleFingerprint=previousWebFingerprint||(previousSchema>=4?previousDesktopFingerprint:"");
      meta.lastSyncedContentHash=compatibleFingerprint;
      meta.baseFingerprint=compatibleFingerprint;
      return meta;
    }

    function runtimeKey(name,tournament){
      const meta=tournament?.cloud;
      return text(meta?.cloudTournamentId)||text(meta?.localKey)||`name:${name}`;
    }
    function setRuntime(name,tournament,state,message=""){
      runtimeState.set(runtimeKey(name,tournament),{state,message,at:new Date().toISOString()});
      if(name===currentName())renderCurrent();
    }
    function getRuntime(name,tournament){return runtimeState.get(runtimeKey(name,tournament))||null;}

    async function getOrganizerToken(){
      if(tokenCache)return tokenCache;
      if(typeof window.cpNativeHubSecretGet!=="function")return "";
      tokenCache=text(await window.cpNativeHubSecretGet(ORGANIZER_SECRET_KEY));
      return tokenCache;
    }

    async function refreshOrganizer({quiet=false}={}){
      const token=await getOrganizerToken();
      if(!token){organizerInfo=null;workspaceInfo=null;renderAccount();return null;}
      try{
        const result=await api.workspace(token);
        organizerInfo=result?.organizer||null;
        workspaceInfo=result||null;
        try{await pullOrganizerSettings({quiet:true,apply:true});}catch(_){ }
        renderAccount();
        return organizerInfo;
      }catch(error){
        organizerInfo=null;workspaceInfo=null;
        renderAccount(error);
        if(!quiet)throw error;
        return null;
      }
    }

    function portableOrganizerSettings(){
      const prefs=clone(data?.preferences||{});
      // These are device/UI/hardware state rather than portable organizer preferences.
      for(const key of Object.keys(prefs)){
        if(key==="activeTab"||key==="dgtExpectedBoards"||/^(?:device|window|path|dgt)/i.test(key))delete prefs[key];
      }
      const tg=clone(telegramGlobal||{});
      delete tg.token;
      return {schemaVersion:1,preferences:prefs,telegramGlobal:tg};
    }

    function applyPortableOrganizerSettings(settings){
      if(!settings||typeof settings!=="object")return false;
      let changed=false;
      if(settings.preferences&&typeof settings.preferences==="object"&&!Array.isArray(settings.preferences)){
        const localOnly={activeTab:data?.preferences?.activeTab,dgtExpectedBoards:data?.preferences?.dgtExpectedBoards};
        data.preferences={...(data.preferences||{}),...clone(settings.preferences)};
        for(const [k,v] of Object.entries(localOnly))if(v!==undefined)data.preferences[k]=v;
        changed=true;
      }
      if(settings.telegramGlobal&&typeof settings.telegramGlobal==="object"&&!Array.isArray(settings.telegramGlobal)){
        const localToken=text(telegramGlobal?.token);
        telegramGlobal={...(telegramGlobal||{}),...clone(settings.telegramGlobal),token:localToken};
        changed=true;
      }
      if(changed){
        try{if(typeof saveData==="function")saveData();}catch(_){ }
        try{if(typeof saveTelegramGlobal==="function")saveTelegramGlobal();}catch(_){ }
        try{if(typeof loadAllFields==="function")loadAllFields();}catch(_){ }
      }
      return changed;
    }

    async function pullOrganizerSettings({quiet=false,apply=true}={}){
      const token=await getOrganizerToken();if(!token)return null;
      try{
        const result=await api.getSettings(token);
        settingsRevision=Math.max(0,Number(result?.revision)||0);
        settingsChecksum=text(result?.checksum).toLowerCase();
        settingsLastSyncedAt=text(result?.updatedAt);
        if(apply&&result?.settings)applyPortableOrganizerSettings(result.settings);
        return result;
      }catch(error){if(!quiet)throw error;console.warn("Cloud settings pull:",error);return null;}
    }

    async function pushOrganizerSettings({quiet=false,force=false}={}){
      const token=await getOrganizerToken();if(!token)return {skipped:true,noToken:true};
      try{
        const settings=portableOrganizerSettings();
        const checksum=await sha256Json(settings);
        if(!force&&settingsChecksum&&settingsChecksum===checksum)return {ok:true,unchanged:true,revision:settingsRevision};
        const result=await api.putSettings(token,{baseRevision:settingsRevision,settings,deviceId:deviceId(),deviceLabel:deviceLabel()});
        settingsRevision=Math.max(0,Number(result?.revision)||settingsRevision);
        settingsChecksum=text(result?.checksum||checksum).toLowerCase();
        settingsLastSyncedAt=text(result?.updatedAt)||new Date().toISOString();
        return result;
      }catch(error){
        if(error?.code==="cloud_settings_revision_conflict"){
          const remote=await pullOrganizerSettings({quiet:true,apply:true});
          if(!quiet)throw error;
          return {ok:false,conflict:true,remote};
        }
        if(!quiet)throw error;console.warn("Cloud settings push:",error);return {ok:false,error};
      }
    }

    function scheduleSettingsSync(delayMs=1800){
      clearTimeout(settingsSyncTimer);
      settingsSyncTimer=setTimeout(()=>pushOrganizerSettings({quiet:true}).catch(error=>console.warn("Cloud settings autosync:",error)),Math.max(800,delayMs));
    }

    const PRIVATE_RUNTIME_KEYS=new Set([
      "organizertoken","authtoken","accesstoken","refreshtoken","managetoken","devicetoken",
      "connectedorganizer","organizeraccount","organizersession","accountsession","authsession",
      "cloudworkspaceaccount","currentaccount","currentorganizeraccount"
    ]);

    function sanitizePortableValue(value){
      if(Array.isArray(value))return value.map(sanitizePortableValue);
      if(!value||typeof value!=="object")return value;
      const out={};
      for(const [key,item] of Object.entries(value)){
        if(PRIVATE_RUNTIME_KEYS.has(String(key).toLowerCase()))continue;
        out[key]=sanitizePortableValue(item);
      }
      return out;
    }

    function sanitizeDownloadedTournament(tournament){
      const one=sanitizePortableValue(clone(tournament||{}));
      // Private-cloud linkage belongs to the local installation/session and is
      // rebuilt below. Keep only the non-secret logical internalId long enough
      // for cross-device/browser identity recovery; all revision/local fields
      // are rebuilt from the token-scoped cloud record.
      const portableInternalId=text(one?.cloud?.internalId);
      delete one.cloud;
      if(portableInternalId)one.cloud={schemaVersion:4,internalId:portableInternalId};
      delete one.cloudWorkspace;
      delete one.deviceId;
      delete one.deviceLabel;
      return one;
    }

    function tournamentContentForFingerprint(tournament){
      const one=sanitizePortableValue(clone(tournament||{}));
      // Must match Chess-Publisher Web schema-v4 fingerprint exactly. These
      // fields are account/device/publication metadata, not tournament content.
      delete one.cloud;
      delete one.online;
      delete one.hub;
      delete one.publication;
      delete one.savedAt;
      delete one.dgt;
      if(one.telegram&&typeof one.telegram==="object"){delete one.telegram.token;delete one.telegram.botToken;}
      return one;
    }

    function canonicalValue(value){
      if(Array.isArray(value))return value.map(canonicalValue);
      if(!value||typeof value!=="object")return value;
      const out={};
      for(const key of Object.keys(value).sort())out[key]=canonicalValue(value[key]);
      return out;
    }

    function tournamentContentObject(name,tournament){
      const one=tournamentContentForFingerprint(tournament);
      // Web fingerprints the tournament object itself. The local display name
      // lives inside the tournament and must not create a platform-only hash.
      return canonicalValue(one);
    }

    async function tournamentContentHash(name,tournament){
      return sha256Json(tournamentContentObject(name,tournament));
    }

    function snapshotTournament(snapshot){
      const sourceName=text(snapshot?.data?.currentTournament||snapshot?.currentTournament);
      const sourceTournament=snapshot?.data?.tournaments?.[sourceName];
      if(!sourceName||!sourceTournament)throw new Error("Cloud snapshot does not contain its tournament.");
      return {name:sourceName,tournament:sourceTournament};
    }

    async function snapshotContentHash(snapshot){
      const source=snapshotTournament(snapshot);
      return tournamentContentHash(source.name,source.tournament);
    }

    function decideReconciliation({localHash,baseHash,remoteHash,localRevision=0,remoteRevision=0}={}){
      localHash=text(localHash).toLowerCase();baseHash=text(baseHash).toLowerCase();remoteHash=text(remoteHash).toLowerCase();
      localRevision=Math.max(0,Number(localRevision)||0);remoteRevision=Math.max(0,Number(remoteRevision)||0);
      if(remoteRevision<localRevision)return "remote-behind";
      if(localHash&&remoteHash&&localHash===remoteHash)return remoteRevision===localRevision?"converged":"advance";
      if(remoteRevision===localRevision)return "push";
      if(!baseHash)return "conflict";
      const localChanged=localHash!==baseHash;
      const remoteChanged=remoteHash!==baseHash;
      if(!localChanged&&!remoteChanged)return "advance";
      if(!localChanged&&remoteChanged)return "pull";
      if(localChanged&&!remoteChanged)return "push";
      return "conflict";
    }

    function cloudScopedSnapshot(name,tournament){
      if(!name||!tournament)throw new Error("Tournament snapshot is unavailable.");
      const base=typeof getPersistentSnapshot==="function"?getPersistentSnapshot():null;
      if(!base)throw new Error("Persistent tournament snapshot is unavailable.");
      const safe=typeof cpSnapshotForExternalFile==="function"?cpSnapshotForExternalFile(base):clone(base);
      const one=sanitizeDownloadedTournament(tournament);
      // schema v4 carries only the stable, non-secret logical identity. The
      // installation localKey, owner, revision and fingerprint never travel.
      one.cloud={schemaVersion:4,internalId:ensureCloudMeta(tournament).internalId};
      safe.data={currentTournament:name,tournaments:{[name]:one},preferences:{}};
      safe.currentTournament=name;
      safe.preferences={};
      // savedAt is a local persistence timestamp, not tournament content. Beta.2
      // included it in the cloud snapshot, which made an unchanged tournament
      // hash differently on every sync and could create revision churn.
      delete safe.savedAt;
      // Device-global Telegram settings are not part of a tournament backup.
      safe.telegramGlobal={};
      safe.cloudWorkspace={schemaVersion:4,scope:"single-tournament",private:true,internalId:ensureCloudMeta(tournament).internalId,clientVersion:CLIENT_VERSION};
      return sanitizePortableValue(safe);
    }

    async function sha256Json(value){
      const bytes=new TextEncoder().encode(JSON.stringify(value));
      const digest=await crypto.subtle.digest("SHA-256",bytes);
      return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
    }

    function updateSyncBase(meta,{revision,contentHash,checksum,updatedAt}={}){
      const rev=Math.max(0,Number(revision ?? meta.revision ?? meta.baseRevision)||0);
      const fp=text(contentHash ?? meta.lastSyncedContentHash ?? meta.baseFingerprint).toLowerCase();
      const at=text(updatedAt)||meta.lastSyncedAt||meta.lastSyncAt||new Date().toISOString();
      meta.schemaVersion=4;
      meta.revision=rev;meta.baseRevision=rev;
      meta.lastSyncedContentHash=fp;meta.baseFingerprint=fp;
      meta.lastSyncedAt=at;meta.lastSyncAt=at;
      if(checksum!==undefined)meta.lastSyncedHash=text(checksum).toLowerCase();
      return meta;
    }

    function cloudErrorText(error){
      if(error?.code==="cloud_true_conflict"||error?.code==="cloud_revision_conflict")return `Conflict: this tournament changed both on this PC and in cloud${error.currentRevision!=null?` (cloud revision ${error.currentRevision})`:""}. No data was overwritten.`;
      if(error?.code==="network_error")return "Offline — cloud backup pending. Local tournament is safe.";
      return text(error?.message)||"Cloud Workspace operation failed.";
    }

    function persistenceRevision(){
      try{
        const status=typeof window.cpPersistenceStatus==="function"?window.cpPersistenceStatus():null;
        const revision=Number(status?.revision);
        return Number.isFinite(revision)?revision:null;
      }catch(_){return null;}
    }

    function persistCloudMeta(){
      try{
        const before=persistenceRevision();
        if(typeof saveData==="function")saveData();
        const after=persistenceRevision();
        if(after!==null&&after!==before){
          cloudMetadataRevisions.add(after);
          // Bound the bookkeeping in case a browser keeps this tab open for a
          // very long time while automatic backup is disabled.
          if(cloudMetadataRevisions.size>128)cloudMetadataRevisions.clear();
        }
      }catch(error){console.warn("Cloud metadata local save warning:",error);}
    }

    function ensureCloudMetaAndPersist(tournament){
      const before=JSON.stringify(tournament?.cloud||null);
      const meta=ensureCloudMeta(tournament);
      if(before!==JSON.stringify(meta))persistCloudMeta();
      return meta;
    }

    async function ensureRemoteTournament(token,name,tournament){
      const meta=ensureCloudMetaAndPersist(tournament);
      if(!organizerInfo)await refreshOrganizer({quiet:false});
      if(!organizerInfo)throw new Error("Organizer Token is not connected.");

      // A copied local backup may contain cloud linkage owned by another
      // organizer. Never reuse another organizer's private cloud ID.
      if(meta.ownerId&&meta.ownerId!==text(organizerInfo.id)){
        meta.cloudTournamentId="";meta.revision=0;meta.baseRevision=0;meta.lastSyncedHash="";meta.lastSyncedContentHash="";meta.baseFingerprint="";meta.lastSyncedAt="";meta.lastSyncAt="";
      }
      meta.ownerId=text(organizerInfo.id);

      if(meta.cloudTournamentId)return meta;

      // If this logical tournament already exists in this organizer workspace,
      // link it by the shared internal ID instead of creating a duplicate. The
      // lookup is organizer-scoped by the authenticated token; internalId never
      // grants access by itself.
      try{
        const listed=await api.listTournaments(token);
        const rows=Array.isArray(listed?.tournaments)?listed.tournaments:[];
        const matches=rows.filter(row=>text(row?.localKey)===meta.internalId);
        if(matches.length===1){
          const remote=matches[0];
          meta.cloudTournamentId=text(remote.id);
          updateSyncBase(meta,{revision:remote.revision,checksum:remote.checksum,contentHash:meta.lastSyncedContentHash,updatedAt:remote.updatedAt});
          meta.ownerId=text(organizerInfo.id);
          persistCloudMeta();
          return meta;
        }
        if(matches.length>1)throw new Error("Multiple cloud tournaments share the same internal ID. No automatic link was made.");
      }catch(error){
        if(/Multiple cloud tournaments/.test(text(error?.message)))throw error;
        console.warn("Cloud internal-ID lookup skipped:",error);
      }

      const result=await api.createTournament(token,{
        localKey:meta.internalId,name,deviceId:deviceId(),deviceLabel:deviceLabel()
      });
      const remote=result?.tournament||{};
      meta.cloudTournamentId=text(remote.id);
      updateSyncBase(meta,{revision:remote.revision,checksum:remote.checksum,contentHash:meta.lastSyncedContentHash,updatedAt:remote.updatedAt});
      if(!meta.cloudTournamentId)throw new Error("Cloud Workspace did not return a tournament ID.");
      persistCloudMeta();
      return meta;
    }

    async function syncTournamentByName(name,{force=false,quiet=false,allowPull=!quiet}={}){
      name=text(name);
      const tournament=data?.tournaments?.[name];
      if(!name||!tournament)return {skipped:true};
      const token=await getOrganizerToken();
      if(!token){setRuntime(name,tournament,"local","Organizer Token not connected");return {skipped:true,noToken:true};}

      const job=async()=>{
        try{
          setRuntime(name,tournament,"syncing","Syncing…");
          const meta=await ensureRemoteTournament(token,name,tournament);
          const snapshot=cloudScopedSnapshot(name,tournament);
          const checksum=await sha256Json(snapshot);
          const contentHash=await tournamentContentHash(name,tournament);

          // beta.3 uses a stable tournament-content fingerprint. beta.2 compared
          // the full cloud snapshot, including volatile savedAt, so unchanged
          // tournaments could look dirty and generate needless revisions.
          let baseRevision=Math.max(0,Number(meta.revision)||0);

          // Always reconcile a linked revision before writing. The old fast
          // path reported "Synced" solely from the locally remembered hash,
          // so both Sync Now and automatic backup could miss a newer revision
          // written by another device. A newer remote revision is NOT a
          // conflict by itself; decideReconciliation selects a safe pull,
          // push, base advance, or true-conflict outcome below.
          if(meta.cloudTournamentId&&baseRevision>0){
            const remoteResponse=await api.getCurrentSnapshot(token,meta.cloudTournamentId);
            const remote=remoteResponse?.tournament||{};
            const remoteRevision=Math.max(0,Number(remote.revision)||0);
            const remoteHash=await snapshotContentHash(remoteResponse?.snapshot);
            let baseHash=text(meta.lastSyncedContentHash).toLowerCase();

            if(!baseHash&&baseRevision>0&&remoteRevision>baseRevision){
              try{
                const baseResponse=await api.getRevision(token,meta.cloudTournamentId,baseRevision);
                if(baseResponse?.snapshot)baseHash=await snapshotContentHash(baseResponse.snapshot);
              }catch(error){
                console.warn(`Cloud base revision ${baseRevision} could not be fingerprinted:`,error);
              }
            }
            if(!baseHash&&remoteRevision===baseRevision)baseHash=remoteHash;

            const decision=decideReconciliation({
              localHash:contentHash,baseHash,remoteHash,localRevision:baseRevision,remoteRevision
            });

            if(decision==="converged"||decision==="advance"){
              updateSyncBase(meta,{revision:remoteRevision,checksum:text(remote.checksum)||meta.lastSyncedHash,contentHash,updatedAt:remote.updatedAt});
              meta.ownerId=text(organizerInfo?.id)||meta.ownerId;
              persistCloudMeta();
              setRuntime(name,tournament,"synced",remoteRevision>baseRevision?`Updated sync base to cloud revision ${remoteRevision}`:"Already current");
              return {ok:true,unchanged:true,advanced:remoteRevision>baseRevision,revision:remoteRevision,checksum:meta.lastSyncedHash,contentHash};
            }

            if(decision==="pull"){
              // Background backup is push-only. Remote content is only applied
              // during an explicit user Pull Changes / foreground reconcile.
              if(!allowPull){
                setRuntime(name,tournament,"update",`Cloud revision ${remoteRevision} is newer; press Pull Changes to update safely.`);
                return {ok:true,skipped:true,updateAvailable:true,revision:remoteRevision};
              }
              if(name!==currentName()){
                // Never switch the user's active tournament during a background
                // backup sweep. Opening/syncing that tournament explicitly will
                // perform the safe fast-forward.
                setRuntime(name,tournament,"update",`Cloud revision ${remoteRevision} is newer; open this tournament to update.`);
                return {ok:true,skipped:true,updateAvailable:true,revision:remoteRevision};
              }
              const targetName=await importCloudSnapshot(remoteResponse,{showMain:false});
              const pulled=data?.tournaments?.[targetName];
              const pulledMeta=ensureCloudMeta(pulled);
              const pulledHash=await tournamentContentHash(targetName,pulled);
              updateSyncBase(pulledMeta,{revision:remoteRevision,checksum:text(remote.checksum)||pulledMeta.lastSyncedHash,contentHash:pulledHash,updatedAt:remote.updatedAt});
              persistCloudMeta();
              setRuntime(targetName,pulled,"synced",`Updated from cloud revision ${baseRevision} → ${remoteRevision}`);
              return {ok:true,pulled:true,revision:remoteRevision,checksum:pulledMeta.lastSyncedHash,contentHash:pulledMeta.lastSyncedContentHash};
            }

            if(decision==="remote-behind")throw new Error(`Cloud revision ${remoteRevision} is older than the local sync base ${baseRevision}. No data was overwritten.`);

            if(decision==="conflict"){
              throw new apiLib.CloudWorkspaceApiError(
                "The tournament was changed both on this PC and in the cloud.",
                {code:"cloud_true_conflict",currentRevision:remoteRevision,response:{baseRevision,remoteRevision}}
              );
            }

            // local-only change while the cloud has harmless/newer metadata:
            // write on top of the actual current remote revision.
            baseRevision=remoteRevision;
          }

          const result=await api.putSnapshot(token,{
            tournamentId:meta.cloudTournamentId,
            baseRevision,
            snapshot,
            deviceId:deviceId(),
            deviceLabel:deviceLabel()
          });
          updateSyncBase(meta,{revision:Number(result?.revision)||baseRevision||0,checksum:result?.checksum||checksum,contentHash,updatedAt:result?.updatedAt});
          meta.ownerId=text(organizerInfo?.id)||meta.ownerId;
          persistCloudMeta();
          setRuntime(name,tournament,"synced",result?.unchanged?"Already current":"Synced");
          return {...(result||{}),contentHash};
        }catch(error){
          if(error?.code==="cloud_revision_conflict"||error?.code==="cloud_true_conflict"){
            const meta=ensureCloudMetaAndPersist(tournament);
            if(Number.isInteger(Number(error.currentRevision)))meta.remoteRevision=Number(error.currentRevision);
            persistCloudMeta();
            setRuntime(name,tournament,"conflict",cloudErrorText(error));
          }else if(error?.code==="network_error"){
            setRuntime(name,tournament,"offline",cloudErrorText(error));
          }else{
            setRuntime(name,tournament,"error",cloudErrorText(error));
          }
          if(!quiet)throw error;
          console.warn(`Cloud sync skipped for ${name}:`,error);
          return {ok:false,error};
        }
      };
      const task=syncChain.then(job,job);
      syncChain=task.then(()=>true,()=>true);
      return task;
    }

    async function syncCurrent({force=false,quiet=false,allowPull=!quiet}={}){
      const name=currentName();if(!name)return {skipped:true};
      const tournament=currentTournament();
      if(tournament){
        ensureCloudMetaAndPersist(tournament);
        // Persist the installation-local key + shared internal ID before any
        // network operation. These IDs are bookkeeping only, not tournament
        // scoring/content and never authorize cloud access.
      }
      // A foreground cloud operation is a durability boundary: first commit the
      // exact active tournament to managed local storage, then reconcile cloud.
      if(!quiet&&typeof fileSaveTournament==="function"){
        const saved=await fileSaveTournament(true);
        if(!saved)throw new Error("Local tournament could not be saved. Cloud sync was cancelled.");
      }
      const result=await syncTournamentByName(name,{force,quiet,allowPull});
      if(result?.ok!==false)await pushOrganizerSettings({quiet:true,force});
      return result;
    }

    async function pullCurrentChanges(){
      // Safe three-way reconcile. The local file is saved first. Then:
      // cloud-only change -> pull; local-only change -> upload as a new revision;
      // identical -> advance sync base; two-sided change -> fail closed/conflict.
      return syncCurrent({force:true,quiet:false,allowPull:true});
    }

    async function syncAllLocal({quiet=false}={}){
      const token=await getOrganizerToken();
      if(!token)return {ok:false,noToken:true};
      if(!organizerInfo)await refreshOrganizer({quiet});
      if(!organizerInfo)return {ok:false};
      const names=Object.keys(data?.tournaments||{});
      let ok=0,failed=0;
      for(const name of names){
        const result=await syncTournamentByName(name,{quiet:true});
        if(result?.ok!==false)ok++;else failed++;
        await delay(120);
      }
      if(!quiet)log(`Cloud backup sweep complete: ${ok} tournament(s) current${failed?`, ${failed} pending/error`:""}.`);
      await pushOrganizerSettings({quiet:true});
      await refreshCloudList({quiet:true});
      return {ok:failed===0,count:ok,failed};
    }

    function scheduleAutoSync(delayMs=2500){
      if(!autoSyncEnabled()||suppressAutoSync)return;
      const scheduled=typeof window.cpPersistenceStatus==="function"?window.cpPersistenceStatus():null;
      const scheduledSignature=scheduled?`${scheduled.revision}:${scheduled.completed}`:"";
      clearTimeout(autoSyncTimer);
      autoSyncTimer=setTimeout(()=>{
        try{
          // A newer edit may exist even before its 300 ms local autosave has
          // entered the persistence queue. Revision equality proves the state
          // being mirrored is still the exact locally-completed state that
          // scheduled this cloud operation.
          const now=typeof window.cpPersistenceStatus==="function"?window.cpPersistenceStatus():null;
          if(now&&(Number(now.queued)!==Number(now.completed)||`${now.revision}:${now.completed}`!==scheduledSignature))return;
          if(window.__cpOnlineCloudBusy){scheduleAutoSync(1800);return;}
          syncCurrent({quiet:true,allowPull:false}).catch(error=>console.warn("Cloud autosync:",error));
        }catch(error){console.warn("Cloud autosync gate:",error);}
      },Math.max(800,Number(delayMs)||2500));
    }

    function startPersistenceMonitor(){
      clearInterval(monitorTimer);
      monitorTimer=setInterval(()=>{
        try{
          if(!autoSyncEnabled()||suppressAutoSync||typeof window.cpPersistenceStatus!=="function")return;
          const status=window.cpPersistenceStatus();
          if(!status||Number(status.queued)!==Number(status.completed))return;
          const revision=Number(status.revision);
          const sig=`${revision}:${status.completed}`;
          if(sig===lastPersistenceSignature)return;
          lastPersistenceSignature=sig;
          if(cloudMetadataRevisions.delete(revision))return;
          scheduleAutoSync(2500);
        }catch(error){console.warn("Cloud persistence monitor:",error);}
      },900);
    }

    function formatDate(value){
      if(!value)return "—";const d=new Date(value);if(Number.isNaN(d.getTime()))return text(value);
      return new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);
    }
    function formatBytes(value){const n=Math.max(0,Number(value)||0);if(n>=1048576)return `${(n/1048576).toFixed(2)} MiB`;if(n>=1024)return `${(n/1024).toFixed(1)} KiB`;return `${n} B`;}

    function renderAccount(error=null){
      const state=document.getElementById("cloudOrganizerState");
      const stats=document.getElementById("cloudWorkspaceStats");
      const device=document.getElementById("cloudDeviceId");
      const label=document.getElementById("cloudDeviceLabel");
      if(state){
        if(organizerInfo)state.innerHTML=`<b>${esc(organizerInfo.displayName||"Organizer")}</b><span class="cloud-ok">Connected securely</span>`;
        else state.innerHTML=error?`<span class="cloud-warn">${esc(cloudErrorText(error))}</span>`:`<span class="muted">Organizer Token not connected.</span>`;
      }
      if(stats){
        const storage=workspaceInfo?.storage;
        stats.textContent=storage?`${Number(storage.tournamentCount)||0} cloud tournament(s) · ${Number(storage.revisionCount)||0} revision(s)`:"—";
      }
      if(device)device.textContent=deviceId();
      if(label&&!label.matches(":focus"))label.value=deviceLabel();
    }

    function renderCurrent(){
      const name=currentName();const tournament=currentTournament();const meta=tournament?.cloud||{};const rt=getRuntime(name,tournament);
      const pairs={
        cloudCurrentName:name||"No tournament open",
        cloudCurrentInternalId:text(meta.internalId)||"Assigned on first cloud action",
        cloudCurrentId:text(meta.cloudTournamentId)||"Not linked yet",
        cloudCurrentRevision:String(Math.max(0,Number(meta.revision)||0)),
        cloudCurrentLastSync:text(meta.lastSyncedAt)?formatDate(meta.lastSyncedAt):"Never"
      };
      for(const [id,value] of Object.entries(pairs)){const el=document.getElementById(id);if(el)el.textContent=value;}
      const state=document.getElementById("cloudCurrentState");
      if(state){
        const label=rt?.state==="syncing"?"↻ Syncing":rt?.state==="synced"?"✓ Synced":rt?.state==="update"?"↓ Cloud update available":rt?.state==="offline"?"☁ Offline — pending":rt?.state==="conflict"?"⚠ Conflict":rt?.state==="error"?"⚠ Sync error":text(meta.cloudTournamentId)?"Cloud linked":"Local only";
        state.className=`cloud-state cloud-state-${rt?.state||"local"}`;state.textContent=label;
        state.title=rt?.message||"";
      }
      const syncBtn=document.getElementById("cloudPullChangesBtn");if(syncBtn)syncBtn.disabled=!name||foregroundBusy>0;
    }

    async function ensurePortableIdentityRevision(token,name,tournament,meta){
      if(!text(meta?.cloudTournamentId))return {skipped:true};
      const current=await api.getCurrentSnapshot(token,meta.cloudTournamentId);
      const remote=current?.tournament||{};
      let remoteInternalId="";
      try{remoteInternalId=text(snapshotTournament(current?.snapshot)?.tournament?.cloud?.internalId);}catch(_){ }
      if(remoteInternalId===meta.internalId)return {ok:true,unchanged:true,revision:Number(remote.revision)||meta.revision};
      // Browser continuation is the one migration boundary that may create a
      // metadata-only revision for legacy beta.1-beta.4 snapshots. Normal Pull
      // Changes keeps its previous no-needless-revision behavior.
      const snapshot=cloudScopedSnapshot(name,tournament);
      const contentHash=await tournamentContentHash(name,tournament);
      const result=await api.putSnapshot(token,{
        tournamentId:meta.cloudTournamentId,
        baseRevision:Math.max(0,Number(remote.revision)||Number(meta.revision)||0),
        snapshot,deviceId:deviceId(),deviceLabel:deviceLabel()
      });
      updateSyncBase(meta,{revision:Number(result?.revision)||Number(remote.revision)||0,checksum:result?.checksum||remote.checksum,contentHash,updatedAt:result?.updatedAt||remote.updatedAt});
      persistCloudMeta();
      log(`Cloud identity upgraded to schema v4 for browser continuation (revision ${meta.revision}).`);
      return result;
    }

    async function continueInBrowser(){
      const token=await getOrganizerToken();
      if(!token)throw new Error("Organizer Token is not connected. Connect it first in Online & Cloud.");
      const result=await syncCurrent({force:true,quiet:false,allowPull:true});
      if(result?.ok===false||result?.conflict)throw new Error("Cloud reconcile did not complete. Resolve the conflict before continuing in browser.");
      const name=currentName();const tournament=currentTournament();const meta=ensureCloudMeta(tournament);
      if(!text(meta.cloudTournamentId))throw new Error("The current tournament is not linked to Private Cloud.");
      await ensurePortableIdentityRevision(token,name,tournament,meta);
      const url=new URL(WEB_APP_URL);
      // cloud id is not a credential. Organizer Token is intentionally never
      // placed in the URL; the browser must authenticate independently.
      url.searchParams.set("cloud",meta.cloudTournamentId);
      url.searchParams.set("cloudTournamentId",meta.cloudTournamentId);
      url.searchParams.set("continue","1");
      url.searchParams.set("source","desktop");
      url.searchParams.set("schemaVersion","4");
      log(`Opening browser continuation for cloud tournament ${meta.cloudTournamentId}.`);
      try{window.open(url.toString(),"_blank","noopener");}catch(_){location.href=url.toString();}
      return url.toString();
    }

    function renderCloudList(){
      const body=document.getElementById("cloudTournamentBody");if(!body)return;
      if(!cloudList.length){body.innerHTML='<tr><td colspan="6" class="muted">No private cloud tournaments yet.</td></tr>';return;}
      body.innerHTML=cloudList.map(row=>`<tr data-cloud-id="${esc(row.id)}"><td><b>${esc(row.name)}</b><div class="muted cloud-small">${esc(row.id)}</div></td><td>${Number(row.revision)||0}</td><td>${esc(formatDate(row.updatedAt))}</td><td>${esc(row.localKey||"")}</td><td><button class="cloud-row-btn" data-cloud-action="open" data-cloud-id="${esc(row.id)}">Open</button></td><td><button class="cloud-row-btn" data-cloud-action="history" data-cloud-id="${esc(row.id)}">History</button></td></tr>`).join("");
    }

    async function refreshCloudList({quiet=false}={}){
      const token=await getOrganizerToken();if(!token){cloudList=[];renderCloudList();renderAccount();return []}
      try{
        if(!organizerInfo)await refreshOrganizer({quiet:true});
        const result=await api.listTournaments(token);cloudList=Array.isArray(result?.tournaments)?result.tournaments:[];
        renderCloudList();renderAccount();renderCurrent();return cloudList;
      }catch(error){if(!quiet)throw error;console.warn("Cloud list:",error);return []}
    }

    function localNameForCloudId(id){
      for(const [name,t] of Object.entries(data?.tournaments||{}))if(text(t?.cloud?.cloudTournamentId)===text(id))return name;
      return "";
    }
    function uniqueLocalName(preferred,exceptName=""){
      const base=text(preferred)||"Cloud Tournament";
      if(!data?.tournaments?.[base]||base===exceptName)return base;
      for(let i=1;i<1000;i++){
        const candidate=i===1?`${base} (Cloud)`:`${base} (Cloud ${i})`;
        if(!data.tournaments[candidate]||candidate===exceptName)return candidate;
      }
      return `${base} (Cloud ${Date.now()})`;
    }

    async function importCloudSnapshot(response,{showMain=true}={}){
      const remote=response?.tournament||{};const snapshot=response?.snapshot;
      if(!snapshot||typeof snapshot!=="object")throw new Error("Cloud snapshot is missing.");
      if(typeof cpValidateSnapshotStructure==="function"&&!cpValidateSnapshotStructure(snapshot))throw new Error("Cloud snapshot failed local tournament validation.");
      const sourceName=text(snapshot?.data?.currentTournament||snapshot?.currentTournament);
      const sourceTournament=snapshot?.data?.tournaments?.[sourceName];
      if(!sourceName||!sourceTournament)throw new Error("Cloud snapshot does not contain its tournament.");

      const linkedName=localNameForCloudId(remote.id);
      const targetName=uniqueLocalName(sourceName,linkedName);
      const previous=typeof getPersistentSnapshot==="function"?getPersistentSnapshot():null;
      const imported=sanitizeDownloadedTournament(sourceTournament);
      const existingLocalKey=linkedName?text(data?.tournaments?.[linkedName]?.cloud?.localKey):"";
      const existingInternalId=linkedName?text(data?.tournaments?.[linkedName]?.cloud?.internalId):"";
      const sourceInternalId=text(sourceTournament?.cloud?.internalId);
      imported.cloud={
        schemaVersion:4,
        // localKey is installation-local. internalId is organizer-scoped logical
        // identity mirrored in the token-owned cloud record's localKey.
        localKey:existingLocalKey||`cp-cloud:${uuid()}`,
        internalId:existingInternalId||sourceInternalId||text(remote.localKey)||`cp-tournament:${uuid()}`,
        cloudTournamentId:text(remote.id),
        ownerId:text(organizerInfo?.id),
        revision:Math.max(0,Number(remote.revision)||0),
        baseRevision:Math.max(0,Number(remote.revision)||0),
        lastSyncedHash:text(remote.checksum).toLowerCase(),
        lastSyncedContentHash:"",
        baseFingerprint:"",
        lastSyncedAt:text(remote.updatedAt)||new Date().toISOString(),
        lastSyncAt:text(remote.updatedAt)||new Date().toISOString()
      };

      suppressAutoSync++;
      try{
        if(linkedName&&linkedName!==targetName)delete data.tournaments[linkedName];
        data.tournaments[targetName]=imported;
        imported.cloud.lastSyncedContentHash=await tournamentContentHash(targetName,imported);
        imported.cloud.baseFingerprint=imported.cloud.lastSyncedContentHash;
        data.currentTournament=targetName;
        if(typeof cpResetTournamentDocumentBinding==="function")cpResetTournamentDocumentBinding(targetName,"cloud-open");
        if(typeof normalizeData==="function")normalizeData();
        stateDirty=true;
        if(typeof refreshEverything==="function")refreshEverything();
        const saved=typeof fileSaveTournament==="function"?await fileSaveTournament(true):false;
        if(!saved)throw new Error("Cloud tournament was downloaded but could not be committed to local managed storage.");
        setRuntime(targetName,data.tournaments[targetName],"synced","Opened from private cloud");
        if(showMain&&document.getElementById("tabMain")&&typeof showTab==="function")showTab("main",document.getElementById("tabMain"));
        log(`Opened cloud tournament “${targetName}” locally at revision ${imported.cloud.revision}.`);
        return targetName;
      }catch(error){
        if(previous&&typeof loadAndNormalizeSnapshotObject==="function"&&loadAndNormalizeSnapshotObject(previous)){
          stateDirty=false;try{refreshEverything();}catch(_){ }
        }
        throw error;
      }finally{suppressAutoSync=Math.max(0,suppressAutoSync-1);}
    }

    async function openCloudTournament(id,{skipLocalPreSync=false}={}){
      id=text(id);if(!id)throw new Error("Cloud tournament ID is missing.");
      const token=await getOrganizerToken();if(!token)throw new Error("Organizer Token is not connected.");
      if(typeof prepareCurrentTournamentForTransition==="function"){
        const ready=await prepareCurrentTournamentForTransition("Open Cloud Tournament","Save unsaved changes before opening the cloud tournament?");
        if(!ready)return false;
      }

      const existingName=localNameForCloudId(id);
      if(existingName&&!skipLocalPreSync){
        const local=data.tournaments[existingName];const meta=ensureCloudMeta(local);
        const localHash=await tournamentContentHash(existingName,local);
        if(!meta.lastSyncedContentHash||meta.lastSyncedContentHash!==localHash){
          const result=await syncTournamentByName(existingName,{quiet:false,force:true});
          if(result?.ok===false)return false;
        }
      }

      const response=await api.getCurrentSnapshot(token,id);
      return importCloudSnapshot(response);
    }

    async function loadHistory(id){
      const token=await getOrganizerToken();if(!token)throw new Error("Organizer Token is not connected.");
      const result=await api.listRevisions(token,id);
      const body=document.getElementById("cloudRevisionBody");const title=document.getElementById("cloudHistoryTitle");
      if(title)title.textContent=`Version history — ${result?.tournament?.name||id}`;
      if(body){
        const rows=Array.isArray(result?.revisions)?result.revisions:[];
        body.innerHTML=rows.length?rows.map(r=>`<tr><td><b>${Number(r.revision)||0}</b></td><td>${esc(formatDate(r.createdAt))}</td><td>${esc(r.deviceLabel||r.deviceId||"—")}</td><td>${esc(r.reason||"sync")}${r.sourceRevision?` from r${Number(r.sourceRevision)}`:""}</td><td>${esc(formatBytes(r.size))}</td><td><button class="cloud-row-btn" data-cloud-action="restore" data-cloud-id="${esc(id)}" data-cloud-revision="${Number(r.revision)||0}">Restore</button></td></tr>`).join(""):'<tr><td colspan="6" class="muted">No revisions stored.</td></tr>';
      }
      return result;
    }

    async function restoreRevision(id,revision){
      const token=await getOrganizerToken();if(!token)throw new Error("Organizer Token is not connected.");
      let ok=true;
      if(typeof appConfirm==="function")ok=await appConfirm(`Restore cloud revision ${revision}?\n\nThe old history is preserved. Restore creates a NEW current revision; nothing is deleted.`,`Restore Cloud Revision`,`warning`);
      if(!ok)return false;
      const result=await api.restoreRevision(token,id,revision);
      log(`Cloud revision ${revision} restored as new revision ${result.revision}.`);
      await openCloudTournament(id,{skipLocalPreSync:true});
      await loadHistory(id);
      await refreshCloudList({quiet:true});
      return true;
    }

    function log(message,kind="info"){
      const box=document.getElementById("cloudLog");const line=`[${new Date().toLocaleTimeString("en-GB",{hour12:false})}] ${message}`;
      if(box){box.value+=(box.value?"\n":"")+line;box.scrollTop=box.scrollHeight;}
      if(kind==="error")console.error("Chess-Publisher Cloud Workspace:",message);
    }

    async function foreground(label,fn){
      if(window.__cpOnlineCloudBusy){
        const error=new Error("Another Online & Cloud operation is already running.");
        log(error.message,"error");
        return false;
      }
      window.__cpOnlineCloudBusy=true;
      foregroundBusy++;renderCurrent();try{window.cpHubRefreshUi?.();}catch(_){ }const busy=document.getElementById("cloudBusyLabel");if(busy)busy.textContent=label;
      try{return await fn();}
      catch(error){log(cloudErrorText(error),"error");try{if(typeof appAlert==="function")await appAlert(cloudErrorText(error),"Online & Cloud","error");}catch(_){ }throw error;}
      finally{foregroundBusy=Math.max(0,foregroundBusy-1);window.__cpOnlineCloudBusy=false;if(busy)busy.textContent="";renderCurrent();try{window.cpHubRefreshUi?.();}catch(_){ }}
    }

    async function openWorkspace(){
      renderCurrent();renderAccount();
      // Re-read DPAPI each time so a token changed in Online Hub is picked up.
      tokenCache="";
      await refreshOrganizer({quiet:true});
      await refreshCloudList({quiet:true});
      renderCurrent();
    }

    function injectUi(){
      const tabs=document.querySelector("#appWindow .tabs");const content=document.querySelector("#appWindow .content");
      if(!tabs||!content)throw new Error("Chess-Publisher tab container was not found.");
      if(document.getElementById("cloudWorkspace"))return;

      // Beta.4 merges private Cloud Workspace into the existing Online Hub tab.
      // Keep tabHub/id=hub stable for preferences and regression compatibility.
      const hubTab=document.getElementById("tabHub");
      const hubPage=document.getElementById("hub");
      if(!hubTab||!hubPage)throw new Error("Online Hub must be initialized before Cloud Workspace.");
      hubTab.textContent="Online & Cloud (Beta)";

      const page=document.createElement("div");page.id="cloudWorkspace";page.className="cloud-integrated";page.innerHTML=`
        <div class="groupbox cloud-primary-box">
          <div class="group-title">Private Cloud · Current Tournament</div>
          <div class="cloud-current-grid">
            <strong>Local tournament</strong><span id="cloudCurrentName">—</span>
            <strong>Internal tournament ID</strong><span id="cloudCurrentInternalId" class="cloud-code">Assigned on first cloud action</span>
            <strong>Cloud revision</strong><span><span id="cloudCurrentRevision">0</span> · <span id="cloudCurrentState" class="cloud-state">Local only</span></span>
            <strong>Last cloud sync</strong><span id="cloudCurrentLastSync">Never</span>
          </div>
          <div class="toolbar cloud-current-actions">
            <button id="cloudPullChangesBtn" class="primary" type="button" title="Save the local tournament first, then safely reconcile local and cloud changes">Pull Changes</button>
            <button id="cloudContinueBrowserBtn" type="button" title="Reconcile this tournament, then open the same token-owned cloud tournament in Chess-Publisher Web">Continue in Browser</button>
            <span class="muted">Safe reconcile: saves locally first, pulls cloud-only changes, uploads local-only changes, and stops on a true two-sided conflict. Browser continuation never puts the Organizer Token in the URL.</span>
          </div>
          <div id="cloudCurrentId" class="cloud-hidden-id" aria-hidden="true"></div>
        </div>

        <div class="groupbox">
          <div class="group-title">My Private Cloud Tournaments</div>
          <div class="table-frame cloud-table-frame"><table><thead><tr><th>Name</th><th>Rev.</th><th>Updated</th><th>Internal ID</th><th>On this PC</th><th>Versions</th></tr></thead><tbody id="cloudTournamentBody"><tr><td colspan="6" class="muted">Open Online & Cloud to load private cloud tournaments.</td></tr></tbody></table></div>
        </div>

        <details class="groupbox cloud-more">
          <summary>Cloud Options & Version History</summary>
          <div class="cloud-account-grid cloud-options-grid">
            <strong>Connected organizer (this PC)</strong><div id="cloudOrganizerState">Checking local credential…</div><span id="cloudWorkspaceStats">—</span>
            <strong>This device</strong><div><span id="cloudDeviceId" class="cloud-code"></span><input id="cloudDeviceLabel" class="cloud-device-label" maxlength="160" title="Friendly label stored locally and recorded with new cloud revisions"></div><button id="cloudRefreshBtn" type="button">Refresh</button>
            <strong>Automatic backup</strong><label class="cloud-toggle"><input id="cloudAutoSync" type="checkbox"> Push-only cloud backup after a completed local save</label><button id="cloudSyncAllBtn" type="button">Back Up All</button>
          </div>
          <div class="muted cloud-note">Automatic backup never pulls remote content into the open tournament. Use Pull Changes for a foreground reconcile. Organizer credentials and device identity stay local to this Windows profile.</div>
          <div class="group-title cloud-history-heading" id="cloudHistoryTitle">Version History</div>
          <div class="muted cloud-note">Restore is non-destructive: a selected old revision is copied forward as a new current revision.</div>
          <div class="table-frame cloud-history-frame"><table><thead><tr><th>Revision</th><th>Created</th><th>Device</th><th>Reason</th><th>Size</th><th>Action</th></tr></thead><tbody id="cloudRevisionBody"><tr><td colspan="6" class="muted">Choose History for a cloud tournament.</td></tr></tbody></table></div>
        </details>

        <details class="groupbox cloud-log-details"><summary>Cloud Activity Log</summary><textarea id="cloudLog" class="full" readonly></textarea></details>`;
      hubPage.appendChild(page);

      const style=document.createElement("style");style.id="cpCloudWorkspaceStyle";style.textContent=`
        .cloud-integrated{margin-top:8px}.cloud-primary-box{border-color:#9fc0df}.cloud-current-grid{display:grid;grid-template-columns:165px minmax(280px,1fr);gap:6px 10px;align-items:center}.cloud-code{font-family:Consolas,"Courier New",monospace;overflow-wrap:anywhere}.cloud-device-label{display:block;margin-top:5px;max-width:360px;width:100%}.cloud-note{margin-top:8px}.cloud-toggle{display:flex;align-items:center;gap:7px}.cloud-state{font-weight:700}.cloud-state-synced,.cloud-ok{color:#107c10}.cloud-state-syncing,.cloud-state-update{color:#0f6cbd}.cloud-state-offline,.cloud-state-conflict,.cloud-state-error,.cloud-warn{color:#a15c00}.cloud-current-actions{margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.cloud-current-actions .primary{min-width:126px}.cloud-table-frame{min-height:135px;max-height:230px}.cloud-history-frame{min-height:120px;max-height:220px;margin-top:7px}.cloud-row-btn{min-width:70px}.cloud-small{font-size:10px;margin-top:2px}.cloud-more>summary,.cloud-log-details>summary{cursor:pointer;font-weight:700;padding:2px 0}.cloud-more[open]>summary,.cloud-log-details[open]>summary{margin-bottom:10px}.cloud-account-grid{display:grid;grid-template-columns:165px minmax(300px,1fr) auto;gap:7px 10px;align-items:center}.cloud-options-grid{margin-top:4px}.cloud-history-heading{margin-top:14px}.cloud-hidden-id{display:none}#cloudLog{height:80px;resize:vertical;font-family:Consolas,"Courier New",monospace;font-size:11px;margin-top:8px}@media(max-width:980px){.cloud-account-grid,.cloud-current-grid{grid-template-columns:1fr}}
      `;document.head.appendChild(style);

      document.getElementById("cloudAutoSync").checked=autoSyncEnabled();
      document.getElementById("cloudAutoSync").addEventListener("change",event=>{setAutoSyncEnabled(event.target.checked);if(event.target.checked)scheduleAutoSync(900);});
      document.getElementById("cloudDeviceLabel").value=deviceLabel();
      document.getElementById("cloudDeviceLabel").addEventListener("change",event=>{event.target.value=setDeviceLabel(event.target.value);});
      document.getElementById("cloudRefreshBtn").addEventListener("click",()=>foreground("Refreshing…",async()=>{tokenCache="";await refreshOrganizer();await refreshCloudList();log("Private cloud list refreshed.");}).catch(()=>{}));
      document.getElementById("cloudPullChangesBtn").addEventListener("click",()=>foreground("Pulling changes…",async()=>{const result=await pullCurrentChanges();await refreshCloudList({quiet:true});if(result?.pulled)log(`Pulled cloud changes into the current tournament.`);else if(result?.unchanged||result?.advanced)log(`Local and cloud tournament are current.`);else log(`Pull Changes completed safely.`);}).catch(()=>{}));
      document.getElementById("cloudContinueBrowserBtn").addEventListener("click",()=>foreground("Preparing browser continuation…",continueInBrowser).catch(()=>{}));
      document.getElementById("cloudSyncAllBtn").addEventListener("click",()=>foreground("Backing up local tournaments…",async()=>{if(typeof fileSaveTournament==="function"&&currentName()){const saved=await fileSaveTournament(true);if(!saved)throw new Error("Current tournament could not be saved locally.");}await syncAllLocal({quiet:false});}).catch(()=>{}));
      document.getElementById("cloudTournamentBody").addEventListener("click",event=>{
        const btn=event.target.closest("button[data-cloud-action]");if(!btn)return;
        const id=btn.dataset.cloudId;const action=btn.dataset.cloudAction;
        if(action==="open")foreground("Opening cloud tournament…",()=>openCloudTournament(id)).catch(()=>{});
        if(action==="history")foreground("Loading version history…",()=>loadHistory(id)).catch(()=>{});
      });
      document.getElementById("cloudRevisionBody").addEventListener("click",event=>{
        const btn=event.target.closest('button[data-cloud-action="restore"]');if(!btn)return;
        foreground("Restoring cloud revision…",()=>restoreRevision(btn.dataset.cloudId,Number(btn.dataset.cloudRevision))).catch(()=>{});
      });

      const originalShowTab=window.showTab;
      if(typeof originalShowTab==="function"&&!originalShowTab.__cpCloudWrapped){
        const wrapped=function(id,button){
          // Saved beta.1-beta.3 Cloud Workspace tab preferences transparently
          // migrate to the merged Online & Cloud tab.
          if(id==="cloudWorkspace"){
            const hub=document.getElementById("tabHub");
            const result=originalShowTab.call(this,"hub",hub||button);
            setTimeout(()=>openWorkspace().catch(error=>console.warn("Cloud Workspace open:",error)),0);
            return result;
          }
          const result=originalShowTab.apply(this,arguments);
          if(id==="hub")setTimeout(()=>openWorkspace().catch(error=>console.warn("Cloud Workspace open:",error)),0);
          return result;
        };
        wrapped.__cpCloudWrapped=true;window.showTab=wrapped;
      }

      try{
        if(data?.preferences?.activeTab==="cloudWorkspace"){
          data.preferences.activeTab="hub";
          if(typeof saveData==="function")saveData();
        }
      }catch(_){ }

      for(const selectorId of ["mainTournamentSelect","registrationTournamentSelect","pairingsTournamentSelect","chessResultsTournamentSelect","standingsTournamentSelect","scheduleTournamentSelect","exportTournamentSelect"]){
        document.getElementById(selectorId)?.addEventListener("change",()=>setTimeout(renderCurrent,0));
      }
      renderAccount();renderCurrent();startPersistenceMonitor();
      log("Private cloud service loaded inside Online & Cloud. Automatic backup is push-only; Pull Changes is the explicit reconcile action.");

      // One conservative startup backup sweep. It never pulls remote content.
      setTimeout(async()=>{
        if(startupSweepDone||!autoSyncEnabled())return;startupSweepDone=true;
        try{
          const token=await getOrganizerToken();if(!token)return;
          await refreshOrganizer({quiet:true});if(!organizerInfo)return;
          if(currentName()&&typeof fileSaveTournament==="function"){
            const current=currentTournament();if(current)ensureCloudMeta(current);
            const saved=await fileSaveTournament(true);if(!saved)return;
          }
          await syncAllLocal({quiet:true});
        }catch(error){console.warn("Cloud startup backup sweep:",error);}
      },3500);
    }

    window.ChessPublisherCloudSyncInternals=Object.freeze({
      canonicalValue,tournamentContentObject,tournamentContentHash,tournamentContentForFingerprint,cloudScopedSnapshot,decideReconciliation,sanitizeDownloadedTournament,ensureCloudMeta,updateSyncBase,ensurePortableIdentityRevision
    });
    // Export the non-UI entry points before UI injection. This keeps the cloud
    // service testable and does not change normal desktop startup behaviour.
    window.cpCloudWorkspaceOpen=openWorkspace;
    window.cpCloudOpenTournament=openCloudTournament;
    window.cpCloudSyncCurrent=syncCurrent;
    window.cpCloudPullChanges=pullCurrentChanges;
    window.cpCloudSyncAllLocal=syncAllLocal;
    window.cpCloudRefreshList=refreshCloudList;
    window.cpCloudSettingsPull=pullOrganizerSettings;
    window.cpCloudSettingsPush=pushOrganizerSettings;
    window.cpCloudContinueInBrowser=continueInBrowser;
    injectUi();
  }catch(error){console.error("Chess-Publisher Cloud Workspace adapter:",error);}
})();
