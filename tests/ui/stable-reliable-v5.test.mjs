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

// UI v5 is no longer the active production artifact, but it remains the
// explicit rollback shell. The deployment workflow must preserve that rollback
// while publishing only the validated Vite Companion dist artifact.
assert(deploy.includes('Preserve legacy production shell as rollback artifact'),
  'deployment must retain the legacy stable UI as an explicit rollback artifact');
assert(deploy.includes('name: chess-publisher-web-legacy-production-rollback'),
  'deployment must archive the legacy production-web rollback package');
assert(deploy.includes('Build clean Vite Companion production artifact'),
  'deployment must build the new Companion instead of mutating the legacy shell');
assert(deploy.includes("source: 'vite-dist'"),
  'deployment identity must declare the Vite Companion as the active production source');
assert(!deploy.includes('cp -R production-web/. dist/'),
  'deployment must not publish the retired legacy shell as the active Pages artifact');

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

console.log('Stable Reliable UI v5 PASS: preserved rollback shell remains intact while production deployment is switched safely to the Vite Companion.');
