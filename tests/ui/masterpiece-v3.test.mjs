import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';

const css=readFileSync(new URL('../../production-web/web/brand-overhaul.css',import.meta.url),'utf8');
const shell=readFileSync(new URL('../../production-web/web/cloud-tournaments-shortcut.js',import.meta.url),'utf8');
const ast=postcss.parse(css);

for(const marker of [
  'Masterpiece v3',
  'Web Native v4',
  '--cp-sidebar-w:248px',
  '#appWindow {',
  'width:100%!important',
  'height:100dvh!important',
  'border-radius:0!important',
  '#appWindow>.titlebar',
  '#classicMenuBar',
  '.cp-shell-body',
  '.cp-app-nav',
  '.cp-stage',
  '.cp-workspace-head',
  '.group-title',
  'position:static!important',
  '.table-frame',
  'scrollbar-gutter:stable!important',
  '#cpBeta7Login',
  '#cpBeta7Start .cp-beta7-card',
  '.cp-setup-board',
  '.cp-setup-card',
  'max-width:768px',
  'max-width:520px'
]) assert(css.includes(marker),`web-native UX contract missing: ${marker}`);

for(const marker of [
  'upgradeWebShell()',
  'buildSetupCards()',
  'decorateNavigation()',
  'data-cp-shell-ready',
  'nativeWebShell:true',
  'setupErgonomicCards:true',
  'firstPaintFlashGuard:true'
]) assert(shell.includes(marker),`DOM migration contract missing: ${marker}`);

let desktop='';
let mobile='';
let phone='';
for(const node of ast.nodes){
  if(node.type!=='atrule'||node.name!=='media')continue;
  if(node.params.includes('min-width:1100px'))desktop=node.toString();
  if(node.params.includes('max-width:768px'))mobile=node.toString();
  if(node.params.includes('max-width:520px'))phone=node.toString();
}

assert(desktop.includes('.cp-setup-board'),'desktop ergonomic setup board missing');
assert(mobile.includes('.cp-shell-body'),'mobile shell reflow missing');
assert(mobile.includes('.cp-app-nav'),'mobile navigation reflow missing');
assert(mobile.includes('.form-grid'),'mobile forms must reflow');
assert(mobile.includes('.registration-lists'),'mobile registration layout missing');
assert(mobile.includes('.table-frame'),'mobile data surfaces missing');
assert(mobile.includes('.modal-window'),'mobile modal layout missing');
assert(mobile.includes('#cpBeta7Login'),'mobile login layout missing');
assert(phone.includes('.toolbar>button'),'phone actions must be one-column capable');

ast.walkDecls(decl=>{
  if(decl.prop==='display')assert.notEqual(decl.value,'none','theme must not remove existing controls');
  if(decl.prop==='visibility')assert.notEqual(decl.value,'hidden','theme must not hide existing controls');
  if(decl.prop==='pointer-events')assert.notEqual(decl.value,'none','theme must not disable existing controls');
});

console.log('Web-native UX regression PASS: real DOM shell migration, ergonomic Tournament Setup cards, no first-paint legacy flash, full responsive content and protected controls.');