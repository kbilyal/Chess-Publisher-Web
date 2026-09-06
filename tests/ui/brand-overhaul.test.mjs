import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import postcss from 'postcss';

const baseline=JSON.parse(readFileSync(new URL('./brand-baseline.json',import.meta.url),'utf8'));
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const sha=text=>createHash('sha256').update(text).digest('hex');
const html=read('production-web/index.html');
const link='<link id="cpBrandOverhaul" rel="stylesheet" media="screen" href="/web/brand-overhaul.css?v=20260906-1">\n';
assert.equal(html.split(link).length,2,'one screen-only theme link, including print isolation');
assert.equal(sha(html.replace(link,'')),baseline.htmlSha256,
  'every original HTML node, button, handler, script, connection and data attribute must remain byte-identical');
for(const [path,hash] of Object.entries(baseline.scripts)) {
  assert.equal(sha(read(path)),hash,`unchanged production adapter: ${path}`);
}
let scripts=0;
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if(/\bsrc=|application\/json|application\/ld\+json/.test(match[1])||!match[2].trim())continue;
  new Script(match[2],{filename:`production-inline-${++scripts}`});
}
const css=read('production-web/web/brand-overhaul.css');
const ast=postcss.parse(css);
ast.walkRules(rule=>assert.ok(rule.selector.startsWith('html[data-cp-production-web="1"]'),
  `theme must be scoped to the real Web app: ${rule.selector}`));
ast.walkDecls(decl=>{
  assert.ok(!(decl.prop==='display'&&decl.value==='none'),'no removal of controls via display');
  assert.ok(!(decl.prop==='visibility'&&decl.value==='hidden'),'no hiding controls');
  assert.ok(!(decl.prop==='pointer-events'&&decl.value==='none'),'no disabling interactions');
});
assert.ok(css.includes(':not(.cp-beta7-app-hidden):not([style*="display: none"]):not([style*="display:none"])'),
  'desktop grid must respect sign-in hiding and Close/Reopen');
assert.ok(css.includes('#appWindow.app-window-minimized {height:auto!important'),
  'minimized window must keep its taller titlebar controls reachable');
for(const color of ['#091526','#1769e0','#63d6df'])assert.ok(css.includes(color),'official brand color '+color);
for(const query of ['min-width:1100px','max-width:1099px','max-width:768px','prefers-reduced-motion:reduce']) {
  assert.ok(css.includes(query),'responsive/accessibility condition '+query);
}
console.log(`UI preservation PASS: exact baseline ${baseline.baseCommit}, ${scripts} inline scripts, ${Object.keys(baseline.scripts).length} adapters; CSS syntax/scope, visibility and print isolation. Browser visual acceptance is separate.`);
