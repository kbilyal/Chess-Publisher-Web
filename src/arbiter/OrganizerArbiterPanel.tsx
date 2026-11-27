import { organizerTournamentStorageKey } from '../cloud/organizerTournamentStorage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clipboard, Link2, Loader2, QrCode, RefreshCw, ShieldCheck, UserRoundCheck, Users, X } from 'lucide-react';
import { arbiterApi, ArbiterAccessStatus, ArbiterSubmission } from './arbiterApi';
import { Tournament } from '../types';

const TOURNAMENT_STORAGE_KEY = 'fide_tournament_manager_v2';

// Compact standards-compliant QR Model 2 SVG encoder (Byte mode, ECC-L, versions 1-10)
// so Arbiter QR codes work offline without external CDN scripts.
function createQrSvgMarkup(text: string): string {
  const bytes = new TextEncoder().encode(String(text || ''));
  const CAPACITIES_L = [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
  const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
  const ECC_PER_BLOCK = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
  const BLOCK_COUNTS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
  const ALIGN_POS = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const version = CAPACITIES_L.findIndex((cap, v) => v >= 1 && bytes.length <= cap);
  if (version < 1) return '';

  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  const gfMul = (a: number, b: number) => (a && b ? GF_EXP[GF_LOG[a] + GF_LOG[b]] : 0);
  const polyMul = (p: Uint8Array, q: Uint8Array) => {
    const r = new Uint8Array(p.length + q.length - 1);
    for (let i = 0; i < p.length; i++) {
      for (let j = 0; j < q.length; j++) r[i + j] ^= gfMul(p[i], q[j]);
    }
    return r;
  };
  const rsGen = (deg: number) => {
    let g = new Uint8Array([1]);
    for (let i = 0; i < deg; i++) g = polyMul(g, new Uint8Array([1, GF_EXP[i]]));
    return g;
  };
  const rsEcc = (data: Uint8Array, eccLen: number) => {
    const gen = rsGen(eccLen);
    const res = new Uint8Array(data.length + eccLen);
    res.set(data);
    for (let i = 0; i < data.length; i++) {
      const factor = res[i];
      if (factor) for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], factor);
    }
    return res.slice(data.length);
  };

  const totalCw = TOTAL_CODEWORDS[version];
  const eccLen = ECC_PER_BLOCK[version];
  const blocks = BLOCK_COUNTS[version];
  const dataCwTotal = totalCw - eccLen * blocks;
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  pushBits(0b0100, 4);
  pushBits(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) pushBits(b, 8);
  for (let i = 0; i < 4 && bits.length < dataCwTotal * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    dataBytes.push(v);
  }
  let pad = 0;
  while (dataBytes.length < dataCwTotal) dataBytes.push((pad++ & 1) ? 0x11 : 0xec);

  const shortBlocks = blocks - (dataCwTotal % blocks);
  const shortLen = Math.floor(dataCwTotal / blocks);
  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let b = 0; b < blocks; b++) {
    const len = shortLen + (b >= shortBlocks ? 1 : 0);
    const slice = new Uint8Array(dataBytes.slice(offset, offset + len));
    offset += len;
    dataBlocks.push(slice);
    eccBlocks.push(rsEcc(slice, eccLen));
  }
  const stream: number[] = [];
  const maxDataLen = Math.max(...dataBlocks.map(b => b.length));
  for (let i = 0; i < maxDataLen; i++) for (const b of dataBlocks) if (i < b.length) stream.push(b[i]);
  for (let i = 0; i < eccLen; i++) for (const b of eccBlocks) stream.push(b[i]);

  const size = version * 4 + 17;
  const grid = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
  const fixed = Array.from({ length: size }, () => new Uint8Array(size));
  const setMod = (r: number, c: number, dark: boolean | number) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    grid[r][c] = dark ? 1 : 0;
    fixed[r][c] = 1;
  };
  const drawFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const rr = r0 + dr, cc = c0 + dc;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const inBox = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const dark = inBox && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setMod(rr, cc, dark);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) {
    setMod(6, i, i % 2 === 0);
    setMod(i, 6, i % 2 === 0);
  }
  setMod(size - 8, 8, true);
  const ap = ALIGN_POS[version];
  for (const r of ap) {
    for (const c of ap) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 8) || (r >= size - 8 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          setMod(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }
  for (let i = 0; i < 9; i++) {
    if (i !== 6) { fixed[8][i] = 1; fixed[i][8] = 1; }
  }
  for (let i = 0; i < 8; i++) {
    fixed[8][size - 1 - i] = 1;
    if (i < 7) fixed[size - 1 - i][8] = 1;
  }
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
    const vbits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = (vbits >> i) & 1;
      const a = Math.floor(i / 3), b = i % 3;
      setMod(a, size - 11 + b, bit);
      setMod(size - 11 + b, a, bit);
    }
  }

  let bitIdx = 0;
  const totalBits = stream.length * 8;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    const upward = ((size - 1 - col - (col < 6 ? 1 : 0)) >> 1) % 2 === 0;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (fixed[r][c]) continue;
        const bit = bitIdx < totalBits ? ((stream[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) : 0;
        bitIdx++;
        grid[r][c] = bit;
      }
    }
  }

  const maskFns = [
    (r: number, c: number) => (r + c) % 2 === 0,
    (r: number) => r % 2 === 0,
    (_r: number, c: number) => c % 3 === 0,
    (r: number, c: number) => (r + c) % 3 === 0,
    (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  ];

  const writeFormat = (m: Int8Array[], maskId: number) => {
    const fmtVal = (0b01 << 3) | maskId;
    let d = fmtVal << 10;
    for (let i = 4; i >= 0; i--) if ((d >> (i + 10)) & 1) d ^= 0x537 << i;
    const full = ((fmtVal << 10) | d) ^ 0x5412;
    for (let i = 0; i < 6; i++) {
      m[8][i] = (full >> (14 - i)) & 1;
      m[size - 1 - i][8] = (full >> i) & 1;
    }
    m[8][7] = (full >> 8) & 1;
    m[8][8] = (full >> 7) & 1;
    m[7][8] = (full >> 6) & 1;
    for (let i = 0; i < 6; i++) m[5 - i][8] = (full >> (5 - i)) & 1;
    for (let i = 0; i < 8; i++) m[8][size - 8 + i] = (full >> (7 - i)) & 1;
  };

  const penalty = (m: Int8Array[]) => {
    let score = 0;
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (let c = 0; c < size; c++) {
      let run = 1;
      for (let r = 1; r < size; r++) {
        if (m[r][c] === m[r - 1][c]) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
      }
    }
    return score;
  };

  let bestScore = Infinity;
  let bestGrid: Int8Array[] | null = null;
  for (let maskId = 0; maskId < 8; maskId++) {
    const m = grid.map((row, r) => row.map((v, c) => (fixed[r][c] ? v : (v ^ (maskFns[maskId](r, c) ? 1 : 0)))));
    writeFormat(m, maskId);
    const s = penalty(m);
    if (s < bestScore) { bestScore = s; bestGrid = m; }
  }
  if (!bestGrid) return '';

  const quiet = 2;
  const viewSize = size + quiet * 2;
  const pathParts: string[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (bestGrid[r][c]) pathParts.push(`M${c + quiet},${r + quiet}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" width="168" height="168" role="img" aria-label="Guest Arbiter QR Code"><rect width="${viewSize}" height="${viewSize}" fill="#ffffff"/><path d="${pathParts.join('')}" fill="#0f172a"/></svg>`;
}

function readTournament(): Tournament | null {
  try {
    const raw = localStorage.getItem(organizerTournamentStorageKey(TOURNAMENT_STORAGE_KEY));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readCloudTournamentId() {
  const tournament: any = readTournament();
  return String(tournament?.cloud?.cloudTournamentId || '').trim();
}

function relativeTime(value?: string) {
  if (!value) return 'never';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 10) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export const OrganizerArbiterPanel: React.FC<{ cloud: any }> = ({ cloud }) => {
  const token = String(cloud?.token || '').trim();
  const [localTournamentId, setLocalTournamentId] = useState(readCloudTournamentId);
  const tournamentId = String(cloud?.activeCloud?.id || localTournamentId || '').trim();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ArbiterAccessStatus | null>(null);
  const [pending, setPending] = useState<ArbiterSubmission[]>([]);
  const [accessUrl, setAccessUrl] = useState('');
  const [qrSvg, setQrSvg] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    const refreshLocalIdentity = () => {
      const next = readCloudTournamentId();
      setLocalTournamentId(current => current === next ? current : next);
    };
    refreshLocalIdentity();
    const timer = window.setInterval(refreshLocalIdentity, 500);
    window.addEventListener('storage', refreshLocalIdentity);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', refreshLocalIdentity);
    };
  }, []);

  useEffect(() => {
    const openPanel = () => setOpen(true);
    window.addEventListener('cp:open-arbiter-access', openPanel);
    return () => window.removeEventListener('cp:open-arbiter-access', openPanel);
  }, []);

  const refresh = useCallback(async () => {
    if (!token || !tournamentId || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const [nextStatus, nextPending] = await Promise.all([
        arbiterApi.organizerStatus(token, tournamentId),
        arbiterApi.organizerPendingResults(token, tournamentId)
      ]);
      setStatus(nextStatus);
      setPending(nextPending.results || []);
      if ((nextPending.results || []).length) {
        setMessage(`${nextPending.results.length} result${nextPending.results.length === 1 ? '' : 's'} waiting for Desktop ↕ SYNC.`);
      }
    } catch (error: any) {
      setMessage(error?.message || 'Could not refresh Arbiter Access.');
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [token, tournamentId]);

  useEffect(() => {
    if (!token || !tournamentId) return;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden' && navigator.onLine) void refresh();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [token, tournamentId, refresh]);

  const renderQr = async (url: string) => {
    if (!url) return;
    const markup = createQrSvgMarkup(url);
    if (markup) {
      setQrSvg(markup);
    } else {
      setQrSvg('');
      setMessage('QR renderer could not encode this link. The secure Copy link option is still available.');
    }
  };

  const createGrant = async () => {
    if (!token || !tournamentId) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await arbiterApi.createGrant(token, tournamentId);
      setStatus(result);
      setAccessUrl(result.accessUrl);
      await renderQr(result.accessUrl);
      setMessage('New Arbiter Access link created. Previous arbiter sessions for this tournament were revoked.');
    } catch (error: any) {
      setMessage(error?.message || 'Could not create Arbiter Access link.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!token || !tournamentId) return;
    if (!window.confirm('Revoke Arbiter Access for this tournament? All current arbiter sessions will stop working immediately.')) return;
    setBusy(true);
    setMessage('');
    try {
      await arbiterApi.revokeGrant(token, tournamentId);
      setAccessUrl('');
      setQrSvg('');
      setPending([]);
      await refresh();
      setMessage('Arbiter Access revoked.');
    } catch (error: any) {
      setMessage(error?.message || 'Could not revoke Arbiter Access.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!accessUrl) return;
    try {
      await navigator.clipboard.writeText(accessUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage('Could not copy automatically. Select and copy the link manually.');
    }
  };

  if (!token || !tournamentId) return null;

  const sessions = status?.sessions || [];
  const onlineCount = sessions.filter(session => session.online).length;

  return (
    <div className={`organizer-arbiter-panel ${open ? 'is-open' : ''}`} data-arbiter-organizer-panel data-cloud-tournament-id={tournamentId}>
      {!open ? (
        <button type="button" className="organizer-arbiter-fab" onClick={() => setOpen(true)} title="Manage Arbiter Access">
          <UserRoundCheck size={20} />
          <span><strong>Arbiter Access</strong><small>{onlineCount ? `${onlineCount} active` : status?.grant ? 'Access ready' : 'Generate link'}</small></span>
          {pending.length > 0 && <b>{pending.length}</b>}
        </button>
      ) : (
        <section className="organizer-arbiter-card">
          <header>
            <div><span>ARBITER ACCESS</span><h3><Users size={18} /> Tournament arbiters</h3></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Arbiter Access"><X size={18} /></button>
          </header>

          <div className="organizer-arbiter-summary">
            <span><strong>{sessions.length}</strong><small>joined</small></span>
            <span><strong>{onlineCount}</strong><small>active now</small></span>
            <span><strong>{pending.length}</strong><small>waiting for SYNC</small></span>
          </div>

          {sessions.length > 0 ? (
            <div className="organizer-arbiter-sessions">
              {sessions.map(session => (
                <div key={session.id} className="organizer-arbiter-session">
                  <i className={session.online ? 'online' : ''} />
                  <span><strong>{session.name}</strong><small>{session.online ? 'Working now' : `Last active ${relativeTime(session.lastSeenAt)}`}{session.lastSubmitAt ? ` · result ${relativeTime(session.lastSubmitAt)}` : ''}</small></span>
                </div>
              ))}
            </div>
          ) : (
            <div className="organizer-arbiter-empty">No arbiters have joined this tournament yet.</div>
          )}

          {accessUrl && (
            <div className="organizer-arbiter-share">
              {qrSvg ? <div className="organizer-arbiter-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : <div className="organizer-arbiter-qr fallback"><QrCode size={56} /></div>}
              <div><strong>Arbiter link ready</strong><small>Copy the secure link or scan the QR on the arbiter's phone. The arbiter enters a name once and keeps access until it is revoked.</small></div>
            </div>
          )}

          {pending.length > 0 && (
            <div className="organizer-arbiter-message">
              {pending.length} pending result{pending.length === 1 ? '' : 's'} are safely stored in Cloud and will remain there until Desktop ↕ SYNC validates, saves, synchronizes and acknowledges them.
            </div>
          )}

          <div className="organizer-arbiter-actions">
            <button type="button" className="primary" disabled={busy} onClick={() => void createGrant()}>{busy ? <Loader2 size={16} className="spin" /> : <Link2 size={16} />}{status?.grant ? 'Generate new link' : 'Generate link'}</button>
            {accessUrl && <button type="button" disabled={busy} onClick={() => void copyLink()}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? 'Copied' : 'Copy link'}</button>}
            {status?.grant && <button type="button" className="danger" disabled={busy} onClick={() => void revoke()}><ShieldCheck size={16} /> Revoke</button>}
            <button type="button" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} /> Refresh</button>
          </div>

          {message && <div className="organizer-arbiter-message">{message}</div>}
          <footer><ShieldCheck size={14} /> Arbiter results stay pending until Desktop ↕ SYNC. Publishing permissions are never issued.</footer>
        </section>
      )}
    </div>
  );
};