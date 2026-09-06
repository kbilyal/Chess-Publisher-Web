import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../production-web/web/cloud-tournaments-shortcut.js',import.meta.url),'utf8');
const removed=[];
const start={hidden:false,style:{display:''},dataset:{}};
const document={
  readyState:'loading',
  getElementById(id){return id==='cpBeta7Start'?start:null;},
  addEventListener(){},
};
const sessionStorage={
  removeItem(key){removed.push(key);},
};
const context={
  console,
  Promise,
  document,
  sessionStorage,
  window:{},
  setTimeout(){return 0;},
  clearTimeout(){},
  setInterval(){return 0;},
  clearInterval(){},
  MutationObserver:class {observe(){}},
};
context.window=context;
context.window.addEventListener=()=>{};

vm.runInNewContext(source,context,{filename:'cloud-tournaments-shortcut.js'});

assert.deepEqual(removed,['cpweb.refresh.continuity.v1'],
  'visible login screen must clear only stale refresh continuity before delayed restore');
assert.equal(start.style.display,'','login screen must remain visible');
assert.equal(start.dataset.cpLoginContinuityGuard,'1','login guard diagnostic marker missing');
assert.equal(context.window.__cpWebCloudTournamentsShortcut?.loginScreenContinuityGuard,true,
  'runtime capability marker missing');
assert(source.includes('const REFRESH_CONTINUITY_KEY="cpweb.refresh.continuity.v1"'),
  'refresh continuity key guard missing');
assert(!source.includes('organizerToken.remembered')&&!source.includes('organizer-primary'),
  'login guard must not erase or rewrite Organizer Token persistence');

console.log('Login persistence PASS: visible sign-in screen survives stale refresh continuity; Organizer Token persistence untouched.');
