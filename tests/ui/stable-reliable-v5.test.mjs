import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';

const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const css=read('production-web/web/brand-overhaul.css');
const deploy=read('.github/workflows/deploy-web.yml');
const shortcut=read('production-web/web/cloud-tournaments-shortcut.js');
const ast=postcss.parse(css);

for(const marker of [
  'Stable Reliable UI v5',
  'CSS-only production interface',
  '--cp-sidebar-w:232px',
  '#appWindow>.titlebar',
  '#classicMenuBar',
  '#appWindow>.tabs',
  '#appWindow>.content',
  '.groupbox',
  '.form-grid',
  '.table-frame',
  '#cpBeta7Login',
  '#cpWebMyCloudDialog',
  'scrollbar-gutter:stable!important',
  'safe-area-inset-bottom',
  'prefers-reduced-motion:reduce'
]) assert(css.includes(marker),`stable-ui-v5 marker missing: ${marker}`);

assert(!shortcut.includes('upgradeWebShell'), 'production shortcut must not perform runtime shell DOM migration');
assert(!shortcut.includes('buildSetupCards'), 'production shortcut must not re-parent Tournament Setup fields');
assert(!shortcut.includes('SHELL_READY_ATTR'), 'production shortcut must not gate first paint on a JS shell migration');

assert(deploy.includes("text = text.replace('/web/brand-overhaul.css?v=20260906-1', f'/web/brand-overhaul.css?v={sha}')"),
  'deployment must cache-bust the production UI stylesheet with the exact commit SHA');
assert(deploy.includes('grep -q "/web/brand-overhaul.css?v=${GITHUB_SHA}" dist/index.html'),
  'deployment must verify the cache-busted stylesheet URL');

let desktop='';
let tablet='';
let mobile='';
let phone='';
for(const node of ast.nodes){
  if(node.type!=='atrule'||node.name!=='media')continue;
  if(node.params.includes('min-width:1100px'))desktop=node.toString();
  if(node.params.includes('max-width:1099px'))tablet=node.toString();
  if(node.params.includes('max-width:768px'))mobile=node.toString();
  if(node.params.includes('max-width:520px'))phone=node.toString();
}
assert(desktop.includes('grid-template-columns:var(--cp-sidebar-w) minmax(0,1fr)!important'),'desktop shell must use CSS grid only');
assert(tablet.includes('#appWindow>.tabs'),'tablet navigation must stay reachable');
assert(mobile.includes('bottom:0!important'),'mobile navigation must be bottom docked');
assert(mobile.includes('.form-grid'),'mobile forms must reflow');
assert(mobile.includes('.table-frame'),'mobile tables must stay horizontally scrollable');
assert(phone.includes('.toolbar>button'),'small-phone actions must be one-column capable');

ast.walkDecls(decl=>{
  if(decl.prop==='display')assert.notEqual(decl.value,'none','stable UI must not remove controls');
  if(decl.prop==='visibility')assert.notEqual(decl.value,'hidden','stable UI must not hide controls');
  if(decl.prop==='pointer-events')assert.notEqual(decl.value,'none','stable UI must not disable controls');
});

console.log('Stable Reliable UI v5 PASS: CSS-only shell, responsive forms/data/dialogs, no runtime DOM migration, cache-safe deployment and preserved controls.');
