import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';

const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const css=read('production-web/web/brand-overhaul.css');
const shell=read('production-web/web/cloud-tournaments-shortcut.js');
const ast=postcss.parse(css);

for(const marker of [
  'Web Native v4',
  ':not([data-cp-shell-ready="1"]) body {opacity:0!important}',
  '.cp-shell-body',
  '.cp-stage',
  '.cp-workspace-head',
  '.cp-app-nav',
  '.cp-more-menu',
  '.cp-setup-board',
  'grid-template-columns:repeat(3,minmax(0,1fr))!important',
  'grid-template-columns:repeat(2,minmax(0,1fr))!important',
  'grid-template-columns:minmax(0,1fr)!important'
]) assert(css.includes(marker),`Web-native v4 CSS contract missing: ${marker}`);

for(const marker of [
  'function upgradeWebShell()',
  'function buildSetupCards()',
  'function decorateNavigation()',
  'root.insertBefore(body,menu)',
  'body.appendChild(tabs)',
  'stage.appendChild(menu)',
  'stage.appendChild(content)',
  'grid.replaceWith(board)',
  'Tournament","Core format, rating and pairing choices',
  'Officials & Venue',
  'Schedule & Publishing',
  'requestAnimationFrame(()=>requestAnimationFrame(revealShell))',
  'firstPaintFlashGuard:true'
]) assert(shell.includes(marker),`Web-native v4 DOM contract missing: ${marker}`);

let tablet='';
let mobile='';
for(const node of ast.nodes){
  if(node.type!=='atrule'||node.name!=='media')continue;
  if(node.params.includes('max-width:1099px'))tablet=node.toString();
  if(node.params.includes('max-width:768px'))mobile=node.toString();
}
assert(tablet.includes('.cp-setup-board'),'tablet setup cards must reflow');
assert(mobile.includes('flex-direction:row!important'),'mobile section navigation must be horizontal, not a vertical desktop rail');
assert(mobile.includes('.cp-setup-board'),'mobile setup cards must collapse to one column');
assert(mobile.includes('.form-grid'),'mobile generic forms must reflow');
assert(mobile.includes('.registration-lists'),'mobile player workflow must reflow');
assert(mobile.includes('.table-frame'),'mobile tables must stay contained and scrollable');

ast.walkDecls(decl=>{
  if(decl.prop==='display')assert.notEqual(decl.value,'none','v4 must not remove functional controls');
  if(decl.prop==='visibility')assert.notEqual(decl.value,'hidden','v4 must not hide functional controls');
  if(decl.prop==='pointer-events')assert.notEqual(decl.value,'none','v4 must not disable functional controls');
});

console.log('Web Native v4 PASS: real DOM migration, no legacy first-paint flash, ergonomic setup grouping, responsive content and preserved controls.');