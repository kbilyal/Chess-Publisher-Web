import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(process.cwd());
const adapter = readFileSync(resolve(root, 'production-web/web/chess-results-browser-adapter.js'), 'utf8');
const index = readFileSync(resolve(root, 'production-web/index.html'), 'utf8');

function storage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key: string) { return values.has(key) ? values.get(key)! : null; },
    setItem(key: string, value: string) { values.set(key, String(value)); },
    removeItem(key: string) { values.delete(key); },
  };
}

const calls: Array<{ url: string; init: any; body: any }> = [];
const localStorage = storage({
  'cp:chess-results:ownership:1488203': 'signed-owner-proof',
});
const sessionStorage = storage();
const tournament: any = {
  chessResults: { key: '1488203', mode: 'real', federation: 'BUL', clientId: 'client-1488203' },
  // Reproduce the browser failure: a stale Web/UI value says Test although the
  // already-assigned TNR is permanently bound to Real.
  settings: { tnr: '1488203', tournamentType: 'test' },
  cloud: { cloudTournamentId: 'cloud-tournament-1488203' },
};
const tournamentTypeElement: any = {
  id: 'tournamentType',
  value: 'test',
  title: '',
  attributes: new Map<string, string>(),
  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); },
};
const documentStub = {
  readyState: 'complete',
  visibilityState: 'visible',
  addEventListener() {},
  querySelector() { return null; },
  getElementById(id: string) { return id === 'tournamentType' ? tournamentTypeElement : null; },
};
class ElementStub {}

const context: any = {
  console,
  URL,
  Response,
  Request,
  Headers,
  JSON,
  Promise,
  localStorage,
  sessionStorage,
  document: documentStub,
  Element: ElementStub,
  setTimeout() { return 0; },
  setInterval() { return 0; },
  clearInterval() {},
  fetch: async (url: string, init: any = {}) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url: String(url), init, body });
    if (String(url).endsWith('/delete-authorize')) {
      return new Response(JSON.stringify({
        ok: true,
        key: '1488203',
        url: 'https://chess-results.com/Stammdaten.aspx?key1=1488203',
        verifiedOwner: true,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  },
};
context.window = context;
context.location = { origin: 'https://web.chess-publisher.org', protocol: 'https:', hostname: 'web.chess-publisher.org' };
context.window.location = context.location;
context.window.addEventListener = () => {};
context.window.cpNativeHubSecretGet = async () => 'organizer-token';
context.window.getCurrentTournament = () => tournament;
// This mirrors the critical desktop saveAll behavior: it copies the current DOM
// Tournament Type into tournament.settings before Publish performs its mode guard.
context.window.saveAll = () => {
  tournament.settings.tournamentType = String(tournamentTypeElement.value || 'real');
};

vm.runInNewContext(adapter, context, { filename: 'chess-results-browser-adapter.js' });
assert.equal(typeof context.window.chessResultsLocalJson, 'function', 'browser adapter did not install chessResultsLocalJson');

// TNR 1488203 is already Real. Web must repair the stale Test selector before
// desktop saveAll can persist it, otherwise Publish aborts with the reproduced
// “Tournament type changed after TNR ... Restore Real tournament” error.
context.window.saveAll();
assert.equal(tournament.settings.tournamentType, 'real', 'linked Real TNR must remain authoritative across Web saveAll');
assert.equal(tournamentTypeElement.value, 'real', 'Web Tournament Type selector must be restored to the assigned TNR mode');
assert.equal(context.window.__cpChessResultsLastModeLock?.key, '1488203', 'mode-lock diagnostic must identify the linked TNR');
assert.equal(context.window.__cpChessResultsLastModeLock?.mode, 'real', 'mode-lock diagnostic must preserve the assigned Real mode');
assert.equal(context.window.__cpChessResultsBrowserAdapter?.linkedTnrModeLock, true, 'browser adapter must declare linked-TNR mode locking');

const deleteAuth = await context.window.chessResultsLocalJson('/chessresults/delete-authorize', {
  key: '1488203',
  clientId: 'client-1488203',
});
assert.equal(deleteAuth.canDelete, true, 'verified Worker ownership must map to desktop canDelete=true');
assert.equal(deleteAuth.adminUrl, 'https://chess-results.com/Stammdaten.aspx?key1=1488203', 'Worker url must map to desktop adminUrl');
assert.equal(deleteAuth.verifiedOwner, true, 'verifiedOwner must be preserved');
assert.equal(deleteAuth.alreadyDeleted, false, 'missing alreadyDeleted must normalize to false');
assert.equal(calls.length, 1, 'delete-authorize should reuse the saved ownership proof without an unnecessary claim request');
assert.equal(calls[0].body.ownershipProof, 'signed-owner-proof', 'delete-authorize must send the saved organizer-scoped ownership proof');
assert.match(calls[0].init.headers.Authorization, /^Bearer organizer-token$/, 'delete-authorize must use the Organizer Token');

// Reset Tournament is the explicit identity boundary. Once it clears key+mode,
// the user is allowed to select another Real/Test type and request a fresh TNR.
tournament.chessResults.key = '';
tournament.chessResults.mode = '';
tournamentTypeElement.value = 'test';
context.window.saveAll();
assert.equal(tournament.settings.tournamentType, 'test', 'Tournament Type must become editable again after Reset clears TNR identity');

for (const marker of [
  'Pin Board / Remarks',
  'id="crPinBoardEnabled"',
  'id="crPinBoardText"',
  'function chessResultsPinBoardRemark',
  'crAttr("remark",chessResultsPinBoardRemark(cr))',
  'updateChessResultsPinBoardFromUi()',
]) {
  assert(index.includes(marker), `Pin Board / Remarks contract missing: ${marker}`);
}

assert(adapter.includes('desktopContract(operation,result)'), 'desktop compatibility mapper is not active');
assert(adapter.includes('canDelete:result?.canDelete===true||result?.verifiedOwner===true'), 'delete-authorize canDelete compatibility mapping missing');
assert(adapter.includes('adminUrl'), 'delete-authorize adminUrl compatibility mapping missing');
assert(adapter.includes('enforceLinkedTnrMode("saveAll")'), 'linked TNR mode must be repaired before desktop saveAll');
assert(adapter.includes('linkedTnrModeAuthority:"chessResults.mode-until-reset"'), 'linked TNR mode authority declaration missing');
assert(!/AES_KEY|AES_IV/.test(adapter), 'Chess-Results bridge secrets must not enter browser adapter');

console.log('Chess-Results Web compatibility: TNR mode-lock + delete-authorize + Pin Board / Remarks PASS');
