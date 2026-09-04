(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.ChessPublisherCloudWorkspaceApi=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const DEFAULT_BASE_URL="https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev";
  const DEFAULT_CLIENT_VERSION="1.06.00-beta.6";

  class CloudWorkspaceApiError extends Error{
    constructor(message,details={}){
      super(message||"Chess-Publisher Cloud Workspace request failed.");
      this.name="CloudWorkspaceApiError";
      this.status=Number(details.status||0);
      this.code=String(details.code||"cloud_api_error");
      this.currentRevision=details.currentRevision==null?null:Number(details.currentRevision);
      this.response=details.response||null;
    }
  }

  const text=v=>v==null?"":String(v).trim();
  function required(v,label){const s=text(v);if(!s)throw new Error(`${label} is required.`);return s;}
  function revision(v,label="Revision"){
    const n=Number(v);
    if(!Number.isInteger(n)||n<0)throw new Error(`${label} must be a non-negative integer.`);
    return n;
  }
  function normalizeBaseUrl(v){return required(v||DEFAULT_BASE_URL,"Cloud API base URL").replace(/\/+$/,"");}
  function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}

  function createClient(options={}){
    const baseUrl=normalizeBaseUrl(options.baseUrl||DEFAULT_BASE_URL);
    const fetchImpl=options.fetchImpl||options.fetch||(typeof fetch==="function"?fetch.bind(globalThis):null);
    const clientVersion=text(options.clientVersion)||DEFAULT_CLIENT_VERSION;
    if(typeof fetchImpl!=="function")throw new Error("A fetch implementation is required for Cloud Workspace.");

    async function request(path,init={}){
      const headers=new Headers(init.headers||{});
      headers.set("Accept","application/json");
      headers.set("X-Client-Version",clientVersion);
      let body=init.body;
      if(body!==undefined&&body!==null&&typeof body!=="string"){
        headers.set("Content-Type","application/json");
        body=JSON.stringify(body);
      }
      let response;
      try{
        response=await fetchImpl(`${baseUrl}${path}`,{...init,headers,body,cache:"no-store"});
      }catch(error){
        throw new CloudWorkspaceApiError("Cloud Workspace is unavailable.",{code:"network_error",response:{message:text(error?.message)}});
      }
      const raw=await response.text();
      let payload=null;
      if(raw){try{payload=JSON.parse(raw);}catch{payload={raw};}}
      if(!response.ok){
        throw new CloudWorkspaceApiError(
          text(payload?.message)||`Cloud Workspace returned HTTP ${response.status}.`,
          {
            status:response.status,
            code:text(payload?.error)||`http_${response.status}`,
            currentRevision:payload?.currentRevision,
            response:payload
          }
        );
      }
      return payload;
    }

    const bearer=token=>({Authorization:`Bearer ${required(token,"Organizer token")}`});

    return Object.freeze({
      baseUrl,
      clientVersion,
      workspace(token){return request("/api/v1/cloud/workspace",{method:"GET",headers:bearer(token)});},
      getSettings(token){return request("/api/v1/cloud/settings",{method:"GET",headers:bearer(token)});},
      putSettings(token,args){
        if(!args||typeof args!=="object")throw new Error("Cloud settings arguments are required.");
        const baseRevision=revision(args.baseRevision||0,"Settings base revision");
        if(!args.settings||typeof args.settings!=="object"||Array.isArray(args.settings))throw new Error("Cloud settings are required.");
        return request("/api/v1/cloud/settings",{
          method:"PUT",headers:{...bearer(token),"X-Expected-Revision":String(baseRevision)},
          body:{baseRevision,settings:clone(args.settings),deviceId:text(args.deviceId),deviceLabel:text(args.deviceLabel)}
        });
      },
      listTournaments(token){return request("/api/v1/cloud/tournaments",{method:"GET",headers:bearer(token)});},
      getTournament(token,tournamentId){return request(`/api/v1/cloud/tournaments/${encodeURIComponent(required(tournamentId,"Cloud tournament ID"))}`,{method:"GET",headers:bearer(token)});},
      createTournament(token,input){
        if(!input||typeof input!=="object")throw new Error("Cloud tournament metadata is required.");
        return request("/api/v1/cloud/tournaments",{
          method:"POST",headers:bearer(token),body:{
            localKey:required(input.localKey,"Cloud local key"),
            name:required(input.name,"Tournament name"),
            deviceId:text(input.deviceId),deviceLabel:text(input.deviceLabel)
          }
        });
      },
      putSnapshot(token,args){
        if(!args||typeof args!=="object")throw new Error("Cloud snapshot arguments are required.");
        const id=encodeURIComponent(required(args.tournamentId,"Cloud tournament ID"));
        if(!args.snapshot||typeof args.snapshot!=="object")throw new Error("Cloud snapshot is required.");
        const baseRevision=revision(args.baseRevision||0,"Base revision");
        return request(`/api/v1/cloud/tournaments/${id}/snapshot`,{
          method:"PUT",
          headers:{...bearer(token),"X-Expected-Revision":String(baseRevision)},
          body:{baseRevision,snapshot:clone(args.snapshot),deviceId:text(args.deviceId),deviceLabel:text(args.deviceLabel)}
        });
      },
      getCurrentSnapshot(token,tournamentId){
        const id=encodeURIComponent(required(tournamentId,"Cloud tournament ID"));
        return request(`/api/v1/cloud/tournaments/${id}/snapshot`,{method:"GET",headers:bearer(token)});
      },
      listRevisions(token,tournamentId){
        const id=encodeURIComponent(required(tournamentId,"Cloud tournament ID"));
        return request(`/api/v1/cloud/tournaments/${id}/revisions`,{method:"GET",headers:bearer(token)});
      },
      getRevision(token,tournamentId,rev){
        const id=encodeURIComponent(required(tournamentId,"Cloud tournament ID"));
        const n=revision(rev,"Cloud revision");if(n<1)throw new Error("Cloud revision must be positive.");
        return request(`/api/v1/cloud/tournaments/${id}/revisions/${n}`,{method:"GET",headers:bearer(token)});
      },
      restoreRevision(token,tournamentId,rev){
        const id=encodeURIComponent(required(tournamentId,"Cloud tournament ID"));
        const n=revision(rev,"Cloud revision");if(n<1)throw new Error("Cloud revision must be positive.");
        return request(`/api/v1/cloud/tournaments/${id}/restore/${n}`,{method:"POST",headers:bearer(token)});
      }
    });
  }

  return Object.freeze({DEFAULT_BASE_URL,DEFAULT_CLIENT_VERSION,CloudWorkspaceApiError,createClient});
});
