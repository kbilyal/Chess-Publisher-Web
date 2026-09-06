import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';

const css=readFileSync(new URL('../../production-web/web/brand-overhaul.css',import.meta.url),'utf8');
const ast=postcss.parse(css);

const required=[
  'Full UI Overhaul v2',
  '.group-title',
  'position:static!important',
  '.table-frame',
  'overflow-x:auto!important',
  'grid-template-columns:minmax(0,1fr)!important',
  '.registration-lists',
  '.modal-window',
  '#cpBeta7Start',
  '#cpWebMyCloudDialog',
  'max-width:768px',
  'max-width:520px',
  'touch-action:manipulation!important',
  'width:max-content!important',
  'min-width:720px!important'
];
for(const marker of required)assert(css.includes(marker),`full-overhaul contract missing: ${marker}`);

let mobile768='';
let mobile520='';
for(const node of ast.nodes){
  if(node.type!=='atrule'||node.name!=='media')continue;
  if(node.params.includes('max-width:768px'))mobile768=node.toString();
  if(node.params.includes('max-width:520px'))mobile520=node.toString();
}
assert(mobile768,'mobile 768px contract missing');
assert(mobile520,'small-phone 520px contract missing');

for(const marker of [
  '#appWindow>.content',
  '.form-grid',
  '.form-grid-4',
  '.cp-beta7-cloud-grid',
  '.button-cluster-grid',
  '.registration-lists',
  '.table-frame',
  '.modal-window',
  '#cpBeta7Start',
  '#cpBeta7LoginButton'
])assert(mobile768.includes(marker),`mobile layout does not cover ${marker}`);

for(const marker of ['.toolbar>button','.button-row>button','.actions>button','.modal-bottom>button']){
  assert(mobile520.includes(marker),`small-phone action layout does not cover ${marker}`);
}

ast.walkDecls(decl=>{
  if(decl.prop==='display')assert.notEqual(decl.value,'none','theme must not remove controls');
  if(decl.prop==='visibility')assert.notEqual(decl.value,'hidden','theme must not hide controls');
  if(decl.prop==='pointer-events')assert.notEqual(decl.value,'none','theme must not disable controls');
});

console.log('Full UI Overhaul v2 regression PASS: workspace, cards/forms, artifact cleanup, tables, modals, login and true mobile reflow are covered without removing controls.');
