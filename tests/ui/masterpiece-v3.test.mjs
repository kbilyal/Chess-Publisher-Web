import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';

const css=readFileSync(new URL('../../production-web/web/brand-overhaul.css',import.meta.url),'utf8');
const ast=postcss.parse(css);

for(const marker of [
  'Masterpiece v3',
  '--cp-sidebar-w:232px',
  '#appWindow {',
  'width:100%!important',
  'height:100dvh!important',
  'border-radius:0!important',
  '#appWindow>.titlebar',
  '#classicMenuBar',
  '#appWindow>.tabs',
  '.group-title',
  'position:static!important',
  '.table-frame',
  'scrollbar-gutter:stable!important',
  '#cpBeta7Login',
  '#cpBeta7Start .cp-beta7-card',
  'grid-template-columns:repeat(2,minmax(0,1fr))!important',
  'position:sticky!important',
  'bottom:0!important',
  'safe-area-inset-bottom',
  'max-width:768px',
  'max-width:520px'
]) assert(css.includes(marker),`masterpiece UX contract missing: ${marker}`);

let desktop='';
let mobile='';
let phone='';
for(const node of ast.nodes){
  if(node.type!=='atrule'||node.name!=='media')continue;
  if(node.params.includes('min-width:1100px'))desktop=node.toString();
  if(node.params.includes('max-width:768px'))mobile=node.toString();
  if(node.params.includes('max-width:520px'))phone=node.toString();
}

assert(desktop.includes('grid-template-columns:var(--cp-sidebar-w) minmax(0,1fr)!important'),'desktop must use product sidebar + work canvas');
assert(desktop.includes('#appWindow>.tabs'),'desktop navigation contract missing');
assert(mobile.includes('#appWindow>.content'),'mobile content reflow missing');
assert(mobile.includes('.form-grid'),'mobile forms must reflow');
assert(mobile.includes('.registration-lists'),'mobile registration layout missing');
assert(mobile.includes('.table-frame'),'mobile data surfaces missing');
assert(mobile.includes('.modal-window'),'mobile modal layout missing');
assert(mobile.includes('#cpBeta7Login'),'mobile login layout missing');
assert(mobile.includes('bottom:0!important'),'mobile navigation must be bottom-docked');
assert(phone.includes('.toolbar>button'),'phone actions must be one-column capable');

ast.walkDecls(decl=>{
  if(decl.prop==='display')assert.notEqual(decl.value,'none','theme must not remove existing controls');
  if(decl.prop==='visibility')assert.notEqual(decl.value,'hidden','theme must not hide existing controls');
  if(decl.prop==='pointer-events')assert.notEqual(decl.value,'none','theme must not disable existing controls');
});

console.log('Masterpiece v3 UX regression PASS: full-viewport Web shell, coherent desktop hierarchy, stable cards/data surfaces, real mobile reflow and touch-first navigation/actions.');
