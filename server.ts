import express from 'express';
import dns from 'node:dns';
import https from 'node:https';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GacruxAdapter } from './src/server/adapters/GacruxAdapter';
import { IndependentPairingCheckerAdapter } from './src/server/adapters/IndependentPairingCheckerAdapter';
import { ChessPublisherTieBreakCheckerAdapter } from './src/engine/adapters/TieBreakCheckerAdapter';
import { StrictTrfValidatorAdapter } from './src/engine/adapters/TrfValidatorAdapter';
import { generateDutchPairings } from './src/engine/dutchEngine';
import { auditStore } from './src/server/auditStore';
import { tournamentStore } from './src/server/tournamentStore';
import { fideService, fideRepository } from './src/server/fide';
import { getRoundLifecycleState } from './src/engine/roundEntryValidator';
import { generateFideSyncPreflight, applyFidePlayerSync } from './src/transactions/fideSyncWorkflow';
import { FideSyncField, FidePlayerSyncSelection } from './src/transactions/types';

const PORT = 3000;
const CLOUD_API_PROXY_BASE = 'https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev';
const app = express();

dns.setDefaultResultOrder('ipv4first');

function requestCloudApi(pathname: string, method: string, headers: Headers, body: string | NodeJS.ReadableStream | undefined) {
  const target = new URL(`${CLOUD_API_PROXY_BASE}${pathname}`);
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }>((resolve, reject) => {
    const request = https.request({
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      method,
      family: 4,
      servername: target.hostname,
      headers: Object.fromEntries(headers)
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({
        status: response.statusCode || 502,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });
    request.on('error', reject);
    if (body && typeof body === 'object' && 'pipe' in body) (body as NodeJS.ReadableStream).pipe(request);
    else {
      if (body) request.write(body);
      request.end();
    }
  });
}

// Initialize FIDE service and repository on startup
fideService.initialize().catch(err => {
  console.log('[FIDE] Database initialization notice:', err.message);
});

app.use(express.json({ limit: '10mb' }));

// Local development proxy avoids browser CORS restrictions for the cloud API.
app.use('/cloud-api', async (req, res) => {
  const upstreamPath = req.originalUrl.replace(/^\/cloud-api/, '') || '/';
  const headers = new Headers();
  Object.entries(req.headers).forEach(([key, value]) => {
    if (key === 'host' || key === 'content-length' || value == null) return;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  });

  try {
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined
      : req.body === undefined ? req : JSON.stringify(req.body);
    const upstream = await requestCloudApi(upstreamPath, req.method, headers, body);
    res.status(upstream.status);
    Object.entries(upstream.headers).forEach(([key, value]) => {
      if (value !== undefined) res.setHeader(key, value);
    });
    res.send(upstream.body);
  } catch (error: any) {
    res.status(502).json({
      ok: false,
      error: 'cloud_proxy_unavailable',
      message: error?.message || 'Cloud Workspace is unavailable.'
    });
  }
});

// Initialize adapters
const gacruxAdapter = new GacruxAdapter();
const checkerAdapter = new IndependentPairingCheckerAdapter();
const tieBreakAdapter = new ChessPublisherTieBreakCheckerAdapter();
const trfAdapter = new StrictTrfValidatorAdapter();

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.05.01-RC1',
    timestamp: new Date().toISOString()
  });
});

// 2. Engine and checker status (Reflects REAL runtime state)
app.get('/api/engine/status', async (req, res) => {
  const diagnostic = await gacruxAdapter.getDiagnostic();
  const checkerAvailable = await checkerAdapter.isAvailable();
  const tieBreakAvailable = await tieBreakAdapter.isAvailable();
  const trfAvailable = await trfAdapter.isAvailable();

  res.json({
    engines: [
      {
        id: 'gacrux',
        name: 'Gacrux',
        available: diagnostic.available,
        authoritative: true,
        version: diagnostic.version,
        runtime: null,
        platform: diagnostic.platform,
        diagnostic: diagnostic.diagnostic
      }
    ],
    checkers: [
      {
        id: 'pairing-checker',
        available: checkerAvailable,
        authoritative: true,
        version: checkerAvailable ? checkerAdapter.version : null
      }
    ],
    pairingChecker: {
      available: checkerAvailable,
      authoritative: true,
      version: checkerAvailable ? checkerAdapter.version : null,
      status: checkerAvailable ? 'ONLINE' : 'CHECKER_NOT_CONFIGURED'
    },
    engine: {
      id: gacruxAdapter.id,
      name: gacruxAdapter.name,
      version: diagnostic.version,
      authoritative: true,
      available: diagnostic.available,
      status: diagnostic.available ? 'ONLINE' : 'AUTHORITATIVE_ENGINE_NOT_CONFIGURED',
      message: diagnostic.diagnostic
    },
    tieBreakChecker: {
      id: tieBreakAdapter.id,
      name: tieBreakAdapter.name,
      available: tieBreakAvailable,
      status: tieBreakAvailable ? 'ONLINE' : 'TIEBREAK_CHECKER_NOT_CONFIGURED'
    },
    trfValidator: {
      id: trfAdapter.id,
      name: trfAdapter.name,
      available: trfAvailable,
      status: trfAvailable ? 'ONLINE' : 'TRF_VALIDATOR_NOT_CONFIGURED'
    }
  });
});

// 3. Authoritative Pairing Generation endpoint
app.post('/api/pairings/generate', async (req, res) => {
  const { tournament, round, options } = req.body;

  // 1. Validate request
  if (!tournament || !round || typeof round !== 'number' || round < 1 || !Array.isArray(tournament.players)) {
    res.status(400).json({
      success: false,
      code: 'INVALID_REQUEST',
      message: 'Tournament object with players array and positive round number are required.'
    });
    return;
  }

  // Security: Prevent client from injecting arbitrary executable or engine paths
  if (req.body.executablePath || req.body.enginePath || req.body.customPath) {
    res.status(400).json({
      success: false,
      code: 'INVALID_ARGUMENT',
      message: 'Client cannot choose or override the server executable path.'
    });
    return;
  }

  try {
    // 2. Check authoritative engine availability
    const isAvailable = await gacruxAdapter.isAvailable();
    if (!isAvailable) {
      // STRICT SAFETY POLICY: Return 503 ENGINE_UNAVAILABLE; Never fall back to prototype!
      res.status(503).json({
        success: false,
        code: 'ENGINE_UNAVAILABLE',
        message: 'Authoritative Gacrux pairing engine binary (v1.9.57) is not installed or configured on this system.',
        engine: {
          id: 'gacrux',
          name: 'Gacrux',
          available: false,
          authoritative: true
        }
      });
      return;
    }

    // 3. Execute authoritative engine
    const result = await gacruxAdapter.generatePairing(tournament, Number(round), options);

    // 4. Return DRAFT pairing only - do NOT commit or mark checker-pass
    res.json({
      success: true,
      draft: true,
      committed: false,
      checkerPassed: false,
      status: 'DRAFT / UNCHECKED',
      result,
      auditRecordId: result.auditRecordId
    });
  } catch (err: any) {
    const isTimeout = err.code === 'ENGINE_TIMEOUT';
    const isUnavailable = err.code === 'AUTHORITATIVE_ENGINE_NOT_CONFIGURED';
    const statusCode = isUnavailable ? 503 : isTimeout ? 504 : 500;

    res.status(statusCode).json({
      success: false,
      code: err.code || 'ENGINE_EXECUTION_FAILED',
      message: err.message || 'Engine execution failed',
      exitCode: err.exitCode ?? null,
      stderr: err.stderr ? err.stderr.slice(0, 1000) : ''
    });
  }
});

// 4. Explicit Prototype Engine Route (Strictly Non-Authoritative)
app.post('/api/prototype/pairings/generate', async (req, res) => {
  const { tournament, round, options } = req.body;

  if (!tournament || !round || typeof round !== 'number' || !Array.isArray(tournament.players)) {
    res.status(400).json({
      success: false,
      code: 'INVALID_REQUEST',
      message: 'Tournament object and round number are required.'
    });
    return;
  }

  try {
    const totalRounds = parseInt(tournament.settings?.rounds || '9', 10);
    const initialTopColor = options?.initialTopColor || 'w';

    // Calculate player states if not provided
    const playerStates = tournament.players.map((p: any) => ({
      playerKey: p.localKey,
      pairingNumber: p.pairingNumber,
      points: 0,
      colorHistory: '',
      opponents: []
    }));

    const result = generateDutchPairings({
      round: Number(round),
      totalRounds,
      players: tournament.players,
      playerStates,
      initialTopColor,
      manualByes: options?.manualByes || {},
      excludedKeys: options?.excludedKeys || [],
      fixedBoards: options?.fixedBoards || {},
      pabPoints: options?.pabPoints ?? 1.0
    });

    res.json({
      success: true,
      authoritative: false,
      prototype: true,
      result: {
        round: result.round,
        boards: result.boards,
        unpairedKeys: result.unpairedKeys,
        pabKey: result.pabKey,
        ruleLog: result.ruleLog,
        engine: {
          id: 'prototype-dutch',
          name: 'Prototype Dutch Engine',
          version: '1.05.01-proto',
          authoritative: false,
          engineType: 'prototype'
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      code: 'PROTOTYPE_EXECUTION_ERROR',
      message: err.message
    });
  }
});

// 5. Dual Engine Validation Endpoint (Gacrux Draft -> BBP Independent Checker -> Arbiter Review)
app.post('/api/pairings/validate-dual', async (req, res) => {
  const { tournament, round, options } = req.body;

  if (!tournament || !round || typeof round !== 'number' || round < 1 || !Array.isArray(tournament.players)) {
    res.status(400).json({
      success: false,
      code: 'INVALID_REQUEST',
      message: 'Tournament object with players array and positive round number are required.'
    });
    return;
  }

  // Security check: client cannot override paths
  if (req.body.executablePath || req.body.enginePath || req.body.customPath) {
    res.status(400).json({
      success: false,
      code: 'INVALID_ARGUMENT',
      message: 'Client cannot choose or override the server executable path.'
    });
    return;
  }

  try {
    const isEngineAvailable = await gacruxAdapter.isAvailable();
    if (!isEngineAvailable) {
      res.status(503).json({
        success: false,
        code: 'ENGINE_UNAVAILABLE',
        message: 'Authoritative Gacrux pairing engine (v1.9.57) is unavailable.'
      });
      return;
    }

    // Step 1: Generate draft via Gacrux
    const draft = await gacruxAdapter.generatePairing(tournament, Number(round), options);

    // Step 2: Check draft independently via BBP
    const checkResult = await checkerAdapter.check(tournament, draft.boards, Number(round));

    // Store in tournamentStore as pending uncommitted draft
    tournamentStore.setPendingDraft(Number(round), {
      round: Number(round),
      tournamentId: tournament.name || 'tournament',
      boards: draft.boards,
      unpairedKeys: draft.unpairedKeys || [],
      pabKey: draft.pabKey,
      gacruxSuccess: true,
      bbpStatus: checkResult.status,
      bbpPassed: checkResult.passed,
      engineMetadata: {
        id: draft.engine.id,
        name: draft.engine.name,
        version: draft.engine.version,
        authoritative: true
      },
      ruleLog: draft.ruleLog || [],
      createdAt: new Date().toISOString()
    });

    res.json({
      success: true,
      draft: {
        ...draft,
        status: 'DRAFT / ARBITER_REVIEW',
        committed: false
      },
      checker: checkResult,
      dualEngineAgreement: checkResult.passed,
      auditRecordId: draft.auditRecordId
    });
  } catch (err: any) {
    const isTimeout = err.code === 'ENGINE_TIMEOUT';
    const isUnavailable = err.code === 'AUTHORITATIVE_ENGINE_NOT_CONFIGURED';
    const statusCode = isUnavailable ? 503 : isTimeout ? 504 : 500;

    res.status(statusCode).json({
      success: false,
      code: err.code || 'VALIDATION_PIPELINE_FAILED',
      message: err.message || 'Dual engine validation pipeline failed',
      exitCode: err.exitCode ?? null,
      stderr: err.stderr ? err.stderr.slice(0, 1000) : ''
    });
  }
});

// 6. Independent Pairing Checker endpoint
app.post('/api/pairings/check', async (req, res) => {
  const { tournament, proposedBoards, round } = req.body;

  if (!tournament || !proposedBoards || !round) {
    res.status(400).json({
      success: false,
      code: 'INVALID_REQUEST',
      message: 'Tournament state, proposed boards, and round number are required.'
    });
    return;
  }

  try {
    const checkResult = await checkerAdapter.check(tournament, proposedBoards, Number(round));
    res.json({
      success: true,
      checkResult
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      code: 'CHECKER_ERROR',
      message: err.message
    });
  }
});

// 7. Tie-Break Checker endpoint
app.post('/api/tiebreaks/check', async (req, res) => {
  const { tournament } = req.body;
  if (!tournament) {
    res.status(400).json({ success: false, message: 'Tournament state is required.' });
    return;
  }

  const result = await tieBreakAdapter.verifyStandings(tournament);
  res.json({ success: true, result });
});

// 8. TRF Validator endpoint
app.post('/api/trf/validate', async (req, res) => {
  const { trfContent } = req.body;
  if (!trfContent) {
    res.status(400).json({ success: false, message: 'TRF content is required.' });
    return;
  }

  const result = await trfAdapter.validateTrf(trfContent);
  res.json({ success: true, result });
});

// Chess-Results credentials and encryption material belong to an installed or
// separately operated bridge, never to browser JavaScript or tournament data.
// This route is deliberately a strict pass-through contract: it does not
// fabricate a TNR, SID, upload success, or fallback transport.
const chessResultsOperations = new Set(['test', 'create', 'publish', 'admin-link', 'delete-authorize', 'unlink']);

app.post('/api/chess-results/:operation', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const operation = String(req.params.operation || '');
  if (!chessResultsOperations.has(operation)) {
    res.status(404).json({ ok: false, code: 'UNKNOWN_CHESS_RESULTS_OPERATION', message: 'Unknown Chess-Results bridge operation.' });
    return;
  }
  const bridgeBase = String(process.env.CHESS_RESULTS_BRIDGE_URL || '').trim();
  if (!bridgeBase) {
    res.status(503).json({ ok: false, code: 'CHESS_RESULTS_BRIDGE_NOT_CONFIGURED', message: 'Chess-Results bridge is not configured. Set CHESS_RESULTS_BRIDGE_URL on the server; credentials must not be placed in the browser.' });
    return;
  }
  if (operation === 'publish' && (!/^\d+$/.test(String(req.body?.key || '')) || typeof req.body?.xml !== 'string' || !req.body.xml.startsWith('<?xml'))) {
    res.status(400).json({ ok: false, code: 'INVALID_PUBLICATION_PAYLOAD', message: 'A numeric TNR and a well-formed XML payload are required.' });
    return;
  }
  try {
    const base = new URL(bridgeBase);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Bridge URL must use HTTP or HTTPS.');
    const target = new URL(`/chessresults/${operation}`, base);
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (process.env.CHESS_RESULTS_BRIDGE_TOKEN) headers.Authorization = `Bearer ${process.env.CHESS_RESULTS_BRIDGE_TOKEN}`;
    const upstream = await fetch(target, { method: 'POST', headers, body: JSON.stringify(req.body || {}), redirect: 'error', signal: AbortSignal.timeout(40_000) });
    const raw = await upstream.text();
    let payload: any = {};
    try { payload = JSON.parse(raw); } catch { payload = null; }
    if (!payload || typeof payload !== 'object' || (upstream.ok && payload.ok !== true)) {
      res.status(502).json({ ok: false, code: 'INVALID_CHESS_RESULTS_BRIDGE_RESPONSE', message: 'Chess-Results bridge returned an invalid response.' });
      return;
    }
    res.status(upstream.status).json(payload);
  } catch (error: any) {
    res.status(502).json({ ok: false, code: 'CHESS_RESULTS_BRIDGE_UNAVAILABLE', message: error?.message || 'Chess-Results bridge is unavailable.' });
  }
});

// Production Guard Middleware for Audit Endpoints
function requireAuditAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (process.env.NODE_ENV === 'production') {
    const token = req.headers['authorization'] || req.headers['x-audit-token'];
    const expected = process.env.AUDIT_SECRET_TOKEN;
    if (!token || (expected && token !== expected && token !== `Bearer ${expected}`)) {
      res.status(403).json({
        success: false,
        code: 'AUDIT_ACCESS_RESTRICTED',
        message: 'Production access to engine audit records requires valid authorization token.'
      });
      return;
    }
  }
  next();
}

// 9. Audit log retrieve endpoints
app.get('/api/audit/records', requireAuditAuth, (req, res) => {
  const records = auditStore.getAll();
  res.json({
    success: true,
    count: records.length,
    records: records.slice(0, 50)
  });
});

app.get('/api/audit/records/:requestId', requireAuditAuth, (req, res) => {
  const record = auditStore.getById(req.params.requestId);
  if (!record) {
    res.status(404).json({ success: false, code: 'RECORD_NOT_FOUND', message: 'Audit record not found.' });
    return;
  }
  res.json({ success: true, record });
});

// 10. Official Tournament State Management endpoints
app.get('/api/tournament/state', (req, res) => {
  const tourn = tournamentStore.getOfficialTournament();
  res.json({ success: true, tournament: tourn });
});

app.post('/api/tournament/state', (req, res) => {
  const { tournament } = req.body;
  if (!tournament || !Array.isArray(tournament.players)) {
    res.status(400).json({ success: false, message: 'Valid tournament object with players array required.' });
    return;
  }
  tournamentStore.setOfficialTournament(tournament);
  res.json({ success: true, message: 'Official tournament state updated.' });
});

// 11. Official Pairing Acceptance Endpoint (Strict 3-condition Gate)
app.post('/api/pairings/accept', async (req, res) => {
  const { round, arbiterConfirmed, arbiterName, notes, customDraft } = req.body;

  if (!round || typeof round !== 'number' || round < 1) {
    res.status(400).json({
      success: false,
      code: 'INVALID_REQUEST',
      message: 'Positive round number is required.'
    });
    return;
  }

  try {
    const result = tournamentStore.acceptPairing(Number(round), {
      arbiterConfirmed: Boolean(arbiterConfirmed),
      arbiterName: arbiterName || 'Arbiter',
      notes,
      customDraft
    });

    res.json({
      success: true,
      committed: true,
      message: `Pairings for Round ${round} successfully committed to official tournament state.`,
      result
    });
  } catch (err: any) {
    const isPrecondition = err.code === 'ACCEPTANCE_PRECONDITION_FAILED';
    const status = isPrecondition ? 409 : 500;
    res.status(status).json({
      success: false,
      code: err.code || 'ACCEPTANCE_FAILED',
      reason: err.reason || 'UNKNOWN',
      message: err.message || 'Acceptance gate prevented commitment to official tournament state.'
    });
  }
});

// 12. Tournament Reset endpoint
app.post('/api/tournament/reset', (req, res) => {
  const { tournament } = req.body;
  tournamentStore.resetTournament(tournament);
  res.json({ success: true, message: 'Tournament store reset.' });
});

// 12a. Round Lifecycle & Finalization endpoints
app.get('/api/rounds/:round/status', (req, res) => {
  const round = parseInt(req.params.round, 10);
  if (isNaN(round) || round < 1) {
    res.status(400).json({ success: false, message: 'Invalid round number.' });
    return;
  }
  const status = getRoundLifecycleState(tournamentStore.getOfficialTournament(), round);
  res.json({ success: true, round, lifecycle: status });
});

app.post('/api/rounds/finalize', (req, res) => {
  const { round, arbiterName, notes } = req.body;
  if (!round || typeof round !== 'number' || round < 1) {
    res.status(400).json({ success: false, message: 'Valid round number required.' });
    return;
  }
  try {
    const result = tournamentStore.finalizeRound(round, { arbiterName, notes });
    res.json({
      success: true,
      message: `Round ${round} successfully finalized and locked.`,
      result
    });
  } catch (err: any) {
    const isValidation = err.code === 'FINALIZATION_VALIDATION_FAILED';
    res.status(isValidation ? 409 : 500).json({
      success: false,
      code: err.code || 'FINALIZATION_FAILED',
      message: err.message || 'Round finalization failed.'
    });
  }
});

app.post('/api/rounds/unlock', (req, res) => {
  const { round, arbiterConfirmed, arbiterName } = req.body;
  if (!round || typeof round !== 'number' || round < 1) {
    res.status(400).json({ success: false, message: 'Valid round number required.' });
    return;
  }
  try {
    const result = tournamentStore.unlockRound(round, {
      arbiterConfirmed: Boolean(arbiterConfirmed),
      arbiterName
    });
    res.json({
      success: true,
      message: `Round ${round} unlocked for corrections.`,
      result
    });
  } catch (err: any) {
    const isBlocked = err.code === 'EARLIER_ROUND_DEPENDENCY' || err.code === 'ARBITER_CONFIRMATION_REQUIRED';
    res.status(isBlocked ? 409 : 500).json({
      success: false,
      code: err.code || 'UNLOCK_FAILED',
      message: err.message || 'Failed to unlock round.'
    });
  }
});

// 13. FIDE Rating Database endpoints (Batch B)
app.get('/api/fide/status', (req, res) => {
  const status = fideService.getStatus();
  res.json(status);
});

app.post('/api/fide/update-rating-list', async (req, res) => {
  // Security validation: Prevent client from supplying custom URL parameters
  if (req.body && (req.body.url || req.body.downloadUrl || req.body.sourceUrl || req.body.customUrl)) {
    res.status(400).json({
      success: false,
      code: 'INVALID_ARGUMENT',
      message: 'Client cannot supply or override the authoritative FIDE download URL.'
    });
    return;
  }

  try {
    const result = await fideService.updateRatingList({
      allowSeedOnNetworkFail: true
    });
    res.json({
      success: true,
      result
    });
  } catch (err: any) {
    if (err.message && err.message.includes('UPDATE_ALREADY_IN_PROGRESS')) {
      res.status(409).json({
        success: false,
        code: 'UPDATE_ALREADY_IN_PROGRESS',
        message: err.message
      });
      return;
    }
    res.status(500).json({
      success: false,
      code: 'UPDATE_FAILED',
      message: err.message || 'Failed to update FIDE rating database.',
      databasePreserved: true
    });
  }
});

app.post('/api/fide/auto-download-all', async (req, res) => {
  try {
    const result = await fideService.updateRatingList({
      allowSeedOnNetworkFail: true
    });
    res.json({
      success: true,
      message: `Automatically downloaded and synchronized all FIDE rating lists (Standard, Rapid, Blitz) from https://ratings.fide.com/download_lists.phtml.`,
      result
    });
  } catch (err: any) {
    if (err.message && err.message.includes('UPDATE_ALREADY_IN_PROGRESS')) {
      res.status(409).json({
        success: false,
        code: 'UPDATE_ALREADY_IN_PROGRESS',
        message: err.message
      });
      return;
    }
    res.status(500).json({
      success: false,
      code: 'AUTO_DOWNLOAD_FAILED',
      message: err.message || 'Failed to auto-download all FIDE rating lists.',
      databasePreserved: true
    });
  }
});

// Download and synchronize LEGACY format (not rated included) STD, RPD, BLZ combined
app.post('/api/fide/download-legacy', async (req, res) => {
  try {
    const result = await fideService.updateRatingList({
      sourceFormat: 'legacy_txt',
      allowSeedOnNetworkFail: true
    });
    res.json({
      success: true,
      message: `Successfully synchronized LEGACY format (not rated included) STD, RPD, BLZ combined from https://ratings.fide.com/download_lists.phtml.`,
      result
    });
  } catch (err: any) {
    if (err.message && err.message.includes('UPDATE_ALREADY_IN_PROGRESS')) {
      res.status(409).json({
        success: false,
        code: 'UPDATE_ALREADY_IN_PROGRESS',
        message: err.message
      });
      return;
    }
    res.status(500).json({
      success: false,
      code: 'DOWNLOAD_LEGACY_FAILED',
      message: err.message || 'Failed to download legacy FIDE rating list.',
      databasePreserved: true
    });
  }
});

// Direct import of FIDE archive or text file (e.g. players_list_foa.zip, players_list_foa.txt)
app.post('/api/fide/upload-archive', async (req, res) => {
  const { filename, base64Data } = req.body || {};
  if (!base64Data || typeof base64Data !== 'string') {
    res.status(400).json({
      success: false,
      code: 'INVALID_DATA',
      message: 'Base64 file data is required for archive upload.'
    });
    return;
  }

  try {
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(cleanBase64, 'base64');

    const result = await fideService.updateRatingList({
      customSourceBuffer: buffer,
      customSourceName: `Imported file: ${filename || 'FIDE archive'}`
    });

    res.json({
      success: true,
      message: `Успешно импортиран файл ${filename || 'FIDE архив'}: заредени ${result.recordCount} състезатели.`,
      result
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      code: 'UPLOAD_FAILED',
      message: err.message || 'Failed to parse and import uploaded FIDE rating file.',
      databasePreserved: true
    });
  }
});

app.get('/api/fide/search', (req, res) => {
  const q = String(req.query.q || req.query.query || '').trim();
  const fed = (req.query.fed || req.query.federation) ? String(req.query.fed || req.query.federation).trim() : undefined;
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
  const tournamentType = (req.query.tournamentType as 'Standard' | 'Rapid' | 'Blitz') || undefined;
  const filterRating = (req.query.filterRating as 'all' | 'rated' | 'unrated') || undefined;

  const players = fideService.search({
    query: q,
    federation: fed,
    limit,
    tournamentType,
    filterRating
  });

  res.json({
    success: true,
    count: players.length,
    players
  });
});

app.get('/api/fide/player/:fideId', (req, res) => {
  const fideId = parseInt(req.params.fideId, 10);
  if (isNaN(fideId) || fideId <= 0) {
    res.status(400).json({
      success: false,
      code: 'INVALID_FIDE_ID',
      message: 'A valid positive numerical FIDE ID is required.'
    });
    return;
  }

  const player = fideService.getPlayer(fideId);
  if (!player) {
    res.status(404).json({
      success: false,
      code: 'PLAYER_NOT_FOUND',
      message: `No FIDE player record found for FIDE ID ${fideId}.`
    });
    return;
  }

  res.json({
    success: true,
    player
  });
});

// 14. Authoritative FIDE Player Synchronization (Batch C)
app.post('/api/fide/sync-player', (req, res) => {
  try {
    const {
      playerKey,
      playerId,
      fideId,
      apply = false,
      arbiterConfirmed = false,
      arbiterName = 'Arbiter',
      selectedFields,
      tournament: customTourn
    } = req.body || {};

    const activeTournament = customTourn || tournamentStore.getOfficialTournament();

    let targetKey = playerKey;
    if (!targetKey && playerId !== undefined) {
      const found = activeTournament.players.find(p => p.id === playerId);
      if (found) targetKey = found.localKey;
    }
    if (!targetKey && fideId !== undefined) {
      const found = activeTournament.players.find(p => String(p.fideId).trim() === String(fideId).trim());
      if (found) targetKey = found.localKey;
    }

    if (!targetKey) {
      res.status(400).json({
        success: false,
        code: 'PLAYER_NOT_FOUND',
        message: 'Must provide valid playerKey, playerId, or fideId identifying a tournament player.'
      });
      return;
    }

    const fideLookup = (id: number) => fideService.getPlayer(id);
    const dbStatus = fideService.getStatus();

    if (!apply) {
      const diffReport = generateFideSyncPreflight(
        activeTournament,
        fideLookup,
        targetKey,
        dbStatus
      );
      const diffItem = diffReport.players.find(p => p.playerKey === targetKey);
      res.json({
        success: true,
        preview: true,
        playerKey: targetKey,
        item: diffItem,
        diffReport
      });
      return;
    }

    // Apply requested
    if (arbiterConfirmed !== true) {
      res.status(400).json({
        success: false,
        code: 'ARBITER_CONFIRMATION_REQUIRED',
        message: 'Explicit arbiter confirmation is required to apply FIDE synchronization.'
      });
      return;
    }

    let fieldsToApply: FideSyncField[] = selectedFields;
    if (!fieldsToApply || fieldsToApply.length === 0) {
      const preflight = generateFideSyncPreflight(activeTournament, fideLookup, targetKey, dbStatus);
      const preItem = preflight.players.find(p => p.playerKey === targetKey);
      if (!preItem || preItem.status !== 'CHANGED') {
        res.json({
          success: true,
          appliedCount: 0,
          startingListOutdated: false,
          tournament: activeTournament,
          message: 'No changes required for player.'
        });
        return;
      }
      fieldsToApply = preItem.diffs.map(d => d.field);
    }

    const result = applyFidePlayerSync(
      activeTournament,
      [{ playerKey: targetKey, selectedFields: fieldsToApply }],
      fideLookup,
      { arbiterConfirmed: true, arbiterName }
    );

    if (!customTourn) {
      tournamentStore.setOfficialTournament(result.tournament);
    }

    res.json({
      success: true,
      committed: true,
      appliedCount: result.appliedCount,
      startingListOutdated: result.startingListOutdated,
      tournament: result.tournament
    });
  } catch (err: any) {
    const statusCode = err.code === 'ARBITER_CONFIRMATION_REQUIRED' ? 400
      : (err.code === 'UNMATCHED_PLAYER_MUTATION_FORBIDDEN' || err.code === 'DUPLICATE_FIDE_ID_MUTATION_FORBIDDEN' ? 409 : 500);
    res.status(statusCode).json({
      success: false,
      code: err.code || 'SYNC_FAILED',
      message: err.message || 'Failed to synchronize player with FIDE.'
    });
  }
});

app.post('/api/fide/sync-all-players', (req, res) => {
  try {
    const {
      apply = false,
      arbiterConfirmed = false,
      arbiterName = 'Arbiter',
      playerUpdates,
      tournament: customTourn
    } = req.body || {};

    const activeTournament = customTourn || tournamentStore.getOfficialTournament();
    const fideLookup = (id: number) => fideService.getPlayer(id);
    const dbStatus = fideService.getStatus();

    const preflight = generateFideSyncPreflight(
      activeTournament,
      fideLookup,
      undefined,
      dbStatus
    );

    if (!apply) {
      res.json({
        success: true,
        preview: true,
        diffReport: preflight
      });
      return;
    }

    if (arbiterConfirmed !== true) {
      res.status(400).json({
        success: false,
        code: 'ARBITER_CONFIRMATION_REQUIRED',
        message: 'Explicit arbiter confirmation is required to apply bulk FIDE synchronization.'
      });
      return;
    }

    let selections: FidePlayerSyncSelection[] = playerUpdates;
    if (!selections || selections.length === 0) {
      selections = preflight.players
        .filter(p => p.status === 'CHANGED')
        .map(p => ({
          playerKey: p.playerKey,
          selectedFields: p.diffs.map(d => d.field)
        }));
    }

    const result = applyFidePlayerSync(
      activeTournament,
      selections,
      fideLookup,
      { arbiterConfirmed: true, arbiterName }
    );

    if (!customTourn) {
      tournamentStore.setOfficialTournament(result.tournament);
    }

    res.json({
      success: true,
      committed: true,
      appliedCount: result.appliedCount,
      startingListOutdated: result.startingListOutdated,
      tournament: result.tournament
    });
  } catch (err: any) {
    const statusCode = err.code === 'ARBITER_CONFIRMATION_REQUIRED' ? 400
      : (err.code === 'UNMATCHED_PLAYER_MUTATION_FORBIDDEN' || err.code === 'DUPLICATE_FIDE_ID_MUTATION_FORBIDDEN' ? 409 : 500);
    res.status(statusCode).json({
      success: false,
      code: err.code || 'SYNC_ALL_FAILED',
      message: err.message || 'Failed to bulk synchronize players with FIDE.'
    });
  }
});


// Export app and adapters for testing purposes
export { app, gacruxAdapter, checkerAdapter, tournamentStore, fideService, fideRepository };

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Chess-Publisher] Backend server running on http://0.0.0.0:${PORT}`);
  });
}

// Start server if run directly
if (process.env.NODE_ENV !== 'test') {
  startServer();
}
