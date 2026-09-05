import ownershipWorker from './ownership-worker.js';

const text = value => String(value ?? '').trim();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function decodeProofPayload(proof) {
  try {
    const payloadPart = text(proof).split('.')[0];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadPart.length / 4) * 4, '=');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function smokeXml(key) {
  return `<?xml version="1.0" encoding="UTF-8"?><chessresults><tournamentdata><tournament key="${key}" type="0" name="Chess-Publisher Web Bridge Smoke Test" federation="XXX" creator="100" /></tournamentdata><rounds><round round="1" date="" time="" /></rounds><players><player no="1" lastname="Test Player 1" rtg="1500" rtgfide="1500" sex="M" fed="XXX" rank="1" /><player no="2" lastname="Test Player 2" rtg="1500" rtgfide="1500" sex="M" fed="XXX" rank="2" /></players><playerpairings></playerpairings><security><securitydata source="21" sid="x" creator_sid="x" tnr_sid="x" /></security></chessresults>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'POST' && /\/api\/chess-results\/upload-smoke\/?$/i.test(url.pathname)) {
      let body;
      try { body = await request.clone().json(); } catch { body = {}; }
      const key = text(body?.key);
      const ownershipProof = text(body?.ownershipProof);
      const payload = decodeProofPayload(ownershipProof);
      if (!/^\d+$/.test(key) || !ownershipProof) {
        return json({ ok: false, code: 'SMOKE_INPUT_INVALID', message: 'key and ownershipProof are required.' }, 400);
      }
      if (payload?.mode !== 'test' || payload?.federation !== 'XXX' || text(payload?.key) !== key) {
        return json({ ok: false, code: 'SMOKE_TEST_TNR_REQUIRED', message: 'The short smoke route is restricted to signed test TNRs with federation XXX.' }, 403);
      }
      const diagnosticUrl = new URL(request.url);
      diagnosticUrl.pathname = '/api/chess-results/upload-diagnostic';
      const forwarded = new Request(diagnosticUrl, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({ key, ownershipProof, xml: smokeXml(key) }),
      });
      return ownershipWorker.fetch(forwarded, env);
    }
    return ownershipWorker.fetch(request, env);
  },
};
