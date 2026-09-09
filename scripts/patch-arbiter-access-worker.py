from pathlib import Path
import sys


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return source.replace(old, new, 1)


path = Path(sys.argv[1] if len(sys.argv) > 1 else "worker.js")
source = path.read_text(encoding="utf-8")
marker = "arbiter_access_v1"
if marker in source:
    print("Restricted Arbiter Access routes already present.")
    raise SystemExit(0)

if "private_cloud_hard_delete_v1" not in source:
    raise SystemExit("Protected private Cloud hard-delete baseline is required before Arbiter Access can be applied.")

router_anchor = '''  // private_cloud_archive_v1 — reversible Organizer-owned Trash.\n'''
router_code = r'''  // arbiter_access_v1 — tournament-scoped QR access for pairings + result entry only.
  const arbiterAccessMatch = path.match(
    /^\/api\/v1\/cloud\/tournaments\/([^/]+)\/arbiter-access$/
  );
  if (arbiterAccessMatch) {
    const tournamentId = decodeURIComponent(arbiterAccessMatch[1]);
    if (request.method === "GET") return organizerArbiterAccessStatus(request, env, tournamentId);
    if (request.method === "POST") return createOrganizerArbiterGrant(request, env, tournamentId);
    if (request.method === "DELETE") return revokeOrganizerArbiterGrant(request, env, tournamentId);
  }

  const arbiterResultsAckMatch = path.match(
    /^\/api\/v1\/cloud\/tournaments\/([^/]+)\/arbiter-results\/ack$/
  );
  if (request.method === "POST" && arbiterResultsAckMatch) {
    return acknowledgeOrganizerArbiterResults(
      request,
      env,
      decodeURIComponent(arbiterResultsAckMatch[1])
    );
  }

  const arbiterResultsMatch = path.match(
    /^\/api\/v1\/cloud\/tournaments\/([^/]+)\/arbiter-results$/
  );
  if (request.method === "GET" && arbiterResultsMatch) {
    return listOrganizerArbiterResults(
      request,
      env,
      decodeURIComponent(arbiterResultsMatch[1])
    );
  }

  if (request.method === "POST" && path === "/api/v1/arbiter/join") {
    return joinTournamentAsArbiter(request, env);
  }
  if (request.method === "GET" && path === "/api/v1/arbiter/tournament") {
    return getArbiterTournament(request, env);
  }
  if (request.method === "POST" && path === "/api/v1/arbiter/results") {
    return submitArbiterResult(request, env);
  }

'''
source = replace_once(source, router_anchor, router_code + router_anchor, "Arbiter Access router")

function_anchor = '''async function deleteCloudTournamentPermanently(request, env, tournamentId) {\n'''
function_code = r'''const ARBITER_ALLOWED_RESULTS = new Set(["1 - 0", "½ - ½", "0 - 1"]);
const ARBITER_ADMIN_ENTRY_TYPES = new Set([
  "PAB",
  "REQUESTED_BYE",
  "ZERO_POINT_BYE",
  "UNPAIRED",
  "ABSENT",
  "WITHDRAWN"
]);

function arbiterText(value) {
  return value == null ? "" : String(value).trim();
}

function arbiterIsoNow() {
  return new Date().toISOString();
}

function arbiterRandomToken(prefix) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const token = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${prefix}${token}`;
}

async function arbiterHash(value) {
  const encoded = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function arbiterJsonBody(request) {
  const contentType = arbiterText(request.headers.get("Content-Type")).toLowerCase();
  if (!contentType.includes("application/json")) {
    throw new ApiError(415, "arbiter_json_required", "Arbiter Access accepts JSON requests only.");
  }
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    throw new ApiError(400, "arbiter_invalid_json", "Request body is not valid JSON.");
  }
}

async function ensureArbiterAccessSchema(env) {
  await ensureCloudSchema(env);
  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS cloud_arbiter_grants (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL,
        organizer_id TEXT NOT NULL,
        access_code_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS cloud_arbiter_sessions (
        id TEXT PRIMARY KEY,
        grant_id TEXT NOT NULL,
        tournament_id TEXT NOT NULL,
        organizer_id TEXT NOT NULL,
        name TEXT NOT NULL,
        device_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        last_submit_at TEXT,
        revoked_at TEXT
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS cloud_arbiter_results (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL,
        organizer_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        arbiter_name TEXT NOT NULL,
        round_number INTEGER NOT NULL,
        board_number INTEGER NOT NULL,
        white_key TEXT NOT NULL,
        black_key TEXT NOT NULL,
        result TEXT NOT NULL,
        base_revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        acknowledged_at TEXT
      )
    `),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_cloud_arbiter_grants_tournament ON cloud_arbiter_grants(tournament_id, organizer_id, revoked_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_cloud_arbiter_sessions_grant ON cloud_arbiter_sessions(grant_id, revoked_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_cloud_arbiter_sessions_token ON cloud_arbiter_sessions(token_hash)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_cloud_arbiter_results_pending ON cloud_arbiter_results(tournament_id, acknowledged_at, round_number, board_number)`)
  ]);
}

function arbiterSessionSummary(row) {
  const lastSeenAt = arbiterText(row?.last_seen_at);
  const lastSeen = Date.parse(lastSeenAt);
  return {
    id: arbiterText(row?.id),
    name: arbiterText(row?.name),
    deviceId: arbiterText(row?.device_id),
    createdAt: arbiterText(row?.created_at),
    lastSeenAt,
    lastSubmitAt: arbiterText(row?.last_submit_at),
    online: Number.isFinite(lastSeen) && Date.now() - lastSeen <= 30000
  };
}

function arbiterSubmissionRecord(row) {
  return {
    id: arbiterText(row?.id),
    tournamentId: arbiterText(row?.tournament_id),
    round: Number(row?.round_number || 0),
    board: Number(row?.board_number || 0),
    whiteKey: arbiterText(row?.white_key),
    blackKey: arbiterText(row?.black_key),
    result: arbiterText(row?.result),
    baseRevision: Number(row?.base_revision || 0),
    sessionId: arbiterText(row?.session_id),
    arbiterName: arbiterText(row?.arbiter_name),
    createdAt: arbiterText(row?.created_at),
    updatedAt: arbiterText(row?.updated_at)
  };
}

async function activeOrganizerArbiterGrant(env, organizerId, tournamentId) {
  return env.DB.prepare(`
    SELECT *
    FROM cloud_arbiter_grants
    WHERE tournament_id = ? AND organizer_id = ? AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(tournamentId, organizerId).first();
}

async function buildOrganizerArbiterStatus(env, organizerId, tournamentId) {
  const grant = await activeOrganizerArbiterGrant(env, organizerId, tournamentId);
  let sessions = [];
  if (grant) {
    const result = await env.DB.prepare(`
      SELECT *
      FROM cloud_arbiter_sessions
      WHERE grant_id = ? AND tournament_id = ? AND organizer_id = ? AND revoked_at IS NULL
      ORDER BY last_seen_at DESC
      LIMIT 100
    `).bind(grant.id, tournamentId, organizerId).all();
    sessions = (result?.results || []).map(arbiterSessionSummary);
  }
  const pendingRow = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM cloud_arbiter_results
    WHERE tournament_id = ? AND organizer_id = ? AND acknowledged_at IS NULL
  `).bind(tournamentId, organizerId).first();
  return {
    ok: true,
    tournamentId,
    grant: grant ? {
      id: arbiterText(grant.id),
      createdAt: arbiterText(grant.created_at),
      lastUsedAt: arbiterText(grant.last_used_at)
    } : null,
    sessions,
    pendingResults: Number(pendingRow?.count || 0)
  };
}

async function organizerArbiterAccessStatus(request, env, tournamentId) {
  const organizer = await organizerFromBearer(request, env);
  await ensureArbiterAccessSchema(env);
  const row = await cloudTournamentForOrganizer(env, organizer.organizer_id, tournamentId);
  if (row.archived_at) throw new ApiError(409, "arbiter_tournament_archived", "Arbiter Access is unavailable for an archived tournament.");
  return json(request, await buildOrganizerArbiterStatus(env, organizer.organizer_id, row.id), 200, { "Cache-Control": "no-store" });
}

async function createOrganizerArbiterGrant(request, env, tournamentId) {
  const organizer = await organizerFromBearer(request, env);
  await ensureArbiterAccessSchema(env);
  const row = await cloudTournamentForOrganizer(env, organizer.organizer_id, tournamentId);
  if (row.archived_at) throw new ApiError(409, "arbiter_tournament_archived", "Arbiter Access is unavailable for an archived tournament.");

  const now = arbiterIsoNow();
  const accessCode = arbiterRandomToken("arb_");
  const accessHash = await arbiterHash(accessCode);
  const grantId = `arb-grant:${crypto.randomUUID()}`;

  const oldGrants = await env.DB.prepare(`
    SELECT id FROM cloud_arbiter_grants
    WHERE tournament_id = ? AND organizer_id = ? AND revoked_at IS NULL
  `).bind(row.id, organizer.organizer_id).all();

  const statements = [];
  for (const old of oldGrants?.results || []) {
    statements.push(env.DB.prepare(`UPDATE cloud_arbiter_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`).bind(now, old.id));
    statements.push(env.DB.prepare(`UPDATE cloud_arbiter_sessions SET revoked_at = ? WHERE grant_id = ? AND revoked_at IS NULL`).bind(now, old.id));
  }
  statements.push(env.DB.prepare(`
    INSERT INTO cloud_arbiter_grants (id, tournament_id, organizer_id, access_code_hash, created_at, last_used_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, NULL, NULL)
  `).bind(grantId, row.id, organizer.organizer_id, accessHash, now));
  await env.DB.batch(statements);

  const origin = arbiterText(env.WEB_ORIGIN || "https://web.chess-publisher.org").replace(/\/+$/g, "") || "https://web.chess-publisher.org";
  const status = await buildOrganizerArbiterStatus(env, organizer.organizer_id, row.id);
  status.accessUrl = `${origin}/?arbiter=${encodeURIComponent(accessCode)}`;
  return json(request, status, 200, { "Cache-Control": "no-store" });
}

async function revokeOrganizerArbiterGrant(request, env, tournamentId) {
  const organizer = await organizerFromBearer(request, env);
  await ensureArbiterAccessSchema(env);
  const row = await cloudTournamentForOrganizer(env, organizer.organizer_id, tournamentId);
  const now = arbiterIsoNow();
  const grants = await env.DB.prepare(`
    SELECT id FROM cloud_arbiter_grants
    WHERE tournament_id = ? AND organizer_id = ? AND revoked_at IS NULL
  `).bind(row.id, organizer.organizer_id).all();
  const statements = [];
  for (const grant of grants?.results || []) {
    statements.push(env.DB.prepare(`UPDATE cloud_arbiter_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`).bind(now, grant.id));
    statements.push(env.DB.prepare(`UPDATE cloud_arbiter_sessions SET revoked_at = ? WHERE grant_id = ? AND revoked_at IS NULL`).bind(now, grant.id));
  }
  if (statements.length) await env.DB.batch(statements);
  return json(request, { ok: true, revoked: statements.length > 0, tournamentId: row.id }, 200, { "Cache-Control": "no-store" });
}

async function arbiterSessionFromBearer(request, env) {
  await ensureArbiterAccessSchema(env);
  const authorization = arbiterText(request.headers.get("Authorization"));
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError(401, "arbiter_session_required", "Arbiter session is required.");
  const tokenHash = await arbiterHash(match[1].trim());
  const session = await env.DB.prepare(`
    SELECT s.*, g.revoked_at AS grant_revoked_at
    FROM cloud_arbiter_sessions s
    JOIN cloud_arbiter_grants g ON g.id = s.grant_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND g.revoked_at IS NULL
    LIMIT 1
  `).bind(tokenHash).first();
  if (!session) throw new ApiError(401, "arbiter_session_invalid", "This Arbiter Access session is no longer valid.");
  return session;
}

async function joinTournamentAsArbiter(request, env) {
  await ensureArbiterAccessSchema(env);
  const body = await arbiterJsonBody(request);
  const accessCode = arbiterText(body.accessCode);
  const name = arbiterText(body.name).replace(/\s+/g, " ");
  const deviceId = arbiterText(body.deviceId);
  if (accessCode.length < 24) throw new ApiError(400, "arbiter_access_code_invalid", "The Arbiter Access link is invalid.");
  if (name.length < 2 || name.length > 80) throw new ApiError(400, "arbiter_name_invalid", "Enter an arbiter name between 2 and 80 characters.");
  if (!deviceId || deviceId.length > 180) throw new ApiError(400, "arbiter_device_invalid", "This device could not be registered for Arbiter Access.");

  const accessHash = await arbiterHash(accessCode);
  const grant = await env.DB.prepare(`
    SELECT * FROM cloud_arbiter_grants
    WHERE access_code_hash = ? AND revoked_at IS NULL
    LIMIT 1
  `).bind(accessHash).first();
  if (!grant) throw new ApiError(404, "arbiter_access_not_found", "This Arbiter Access QR code has expired or was revoked.");

  const tournament = await cloudTournamentForOrganizer(env, grant.organizer_id, grant.tournament_id);
  if (tournament.archived_at) throw new ApiError(409, "arbiter_tournament_archived", "This tournament is no longer available for Arbiter Access.");

  const now = arbiterIsoNow();
  const rawSessionToken = arbiterRandomToken("arb_sess_");
  const sessionHash = await arbiterHash(rawSessionToken);
  const existing = await env.DB.prepare(`
    SELECT * FROM cloud_arbiter_sessions
    WHERE grant_id = ? AND device_id = ? AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(grant.id, deviceId).first();

  let sessionId;
  if (existing) {
    sessionId = existing.id;
    await env.DB.prepare(`
      UPDATE cloud_arbiter_sessions
      SET name = ?, token_hash = ?, last_seen_at = ?
      WHERE id = ? AND grant_id = ? AND revoked_at IS NULL
    `).bind(name, sessionHash, now, sessionId, grant.id).run();
  } else {
    sessionId = `arb-session:${crypto.randomUUID()}`;
    await env.DB.prepare(`
      INSERT INTO cloud_arbiter_sessions (
        id, grant_id, tournament_id, organizer_id, name, device_id, token_hash,
        created_at, last_seen_at, last_submit_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
    `).bind(sessionId, grant.id, grant.tournament_id, grant.organizer_id, name, deviceId, sessionHash, now, now).run();
  }
  await env.DB.prepare(`UPDATE cloud_arbiter_grants SET last_used_at = ? WHERE id = ?`).bind(now, grant.id).run();

  return json(request, {
    ok: true,
    role: "arbiter",
    permissions: { pairings: true, results: true, publish: false },
    sessionToken: rawSessionToken,
    session: { id: sessionId, name },
    tournament: { id: tournament.id, name: tournament.name }
  }, 200, { "Cache-Control": "no-store" });
}

async function arbiterSnapshotObject(env, objectKey) {
  if (!objectKey) throw new ApiError(409, "arbiter_snapshot_missing", "The organizer has not synchronized this tournament to Cloud yet.");
  const buckets = Object.values(env).filter(binding =>
    binding && typeof binding.get === "function" && typeof binding.put === "function" &&
    typeof binding.delete === "function" && typeof binding.list === "function" && typeof binding.head === "function"
  );
  for (const bucket of buckets) {
    try {
      const object = await bucket.get(objectKey);
      if (!object) continue;
      const raw = await object.text();
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Try the next R2 binding. Private snapshot discovery remains fail-closed.
    }
  }
  throw new ApiError(503, "arbiter_snapshot_unavailable", "The synchronized tournament snapshot is temporarily unavailable.");
}

function arbiterTournamentFromSnapshot(snapshot, fallbackName) {
  const tournaments = snapshot?.data?.tournaments;
  if (!tournaments || typeof tournaments !== "object") throw new ApiError(409, "arbiter_snapshot_invalid", "Cloud snapshot does not contain a tournament.");
  const keys = Object.keys(tournaments);
  const requested = arbiterText(snapshot?.data?.currentTournament || snapshot?.currentTournament || fallbackName);
  const key = requested && tournaments[requested] ? requested : keys[0];
  const tournament = key ? tournaments[key] : null;
  if (!tournament || typeof tournament !== "object") throw new ApiError(409, "arbiter_snapshot_invalid", "Cloud snapshot does not contain a tournament.");
  return tournament;
}

async function buildRestrictedArbiterTournament(env, row) {
  const snapshot = await arbiterSnapshotObject(env, row.current_object_key);
  const tournament = arbiterTournamentFromSnapshot(snapshot, row.name);
  const liveBoards = JSON.parse(JSON.stringify(tournament?.pairings?.liveBoards || {}));

  const queued = await env.DB.prepare(`
    SELECT * FROM cloud_arbiter_results
    WHERE tournament_id = ? AND organizer_id = ? AND acknowledged_at IS NULL
    ORDER BY updated_at ASC
  `).bind(row.id, row.organizer_id).all();
  for (const submission of queued?.results || []) {
    const roundKey = String(Number(submission.round_number || 0));
    const boards = Array.isArray(liveBoards[roundKey]) ? liveBoards[roundKey] : [];
    const board = boards.find(item => Number(item?.board || 0) === Number(submission.board_number || 0));
    if (!board) continue;
    if (arbiterText(board.whiteKey) !== arbiterText(submission.white_key) || arbiterText(board.blackKey) !== arbiterText(submission.black_key)) continue;
    board.result = arbiterText(submission.result);
  }

  const players = Array.isArray(tournament?.players) ? tournament.players : [];
  return {
    id: row.id,
    name: arbiterText(tournament?.name || row.name || "Tournament"),
    revision: Math.max(0, Number(row.current_revision || 0)),
    round: arbiterText(tournament?.pairings?.round || ""),
    players: players.map(player => ({
      localKey: arbiterText(player?.localKey),
      pairingNumber: Number(player?.pairingNumber || 0),
      name: arbiterText(player?.name),
      rating: Number(player?.rating || 0),
      fed: arbiterText(player?.fed),
      fideId: arbiterText(player?.fideId),
      title: arbiterText(player?.title)
    })),
    pairings: {
      liveBoards,
      finalizedRounds: tournament?.pairings?.finalizedRounds || {},
      roundStatus: tournament?.pairings?.roundStatus || {}
    }
  };
}

async function getArbiterTournament(request, env) {
  const session = await arbiterSessionFromBearer(request, env);
  const row = await cloudTournamentForOrganizer(env, session.organizer_id, session.tournament_id);
  if (row.archived_at) throw new ApiError(409, "arbiter_tournament_archived", "This tournament is no longer available for Arbiter Access.");
  const now = arbiterIsoNow();
  await env.DB.prepare(`UPDATE cloud_arbiter_sessions SET last_seen_at = ? WHERE id = ?`).bind(now, session.id).run();
  const tournament = await buildRestrictedArbiterTournament(env, row);
  return json(request, {
    ok: true,
    role: "arbiter",
    permissions: { pairings: true, results: true, publish: false },
    session: { id: session.id, name: session.name },
    tournament
  }, 200, { "Cache-Control": "no-store" });
}

async function submitArbiterResult(request, env) {
  const session = await arbiterSessionFromBearer(request, env);
  const body = await arbiterJsonBody(request);
  const row = await cloudTournamentForOrganizer(env, session.organizer_id, session.tournament_id);
  if (row.archived_at) throw new ApiError(409, "arbiter_tournament_archived", "This tournament is no longer available for Arbiter Access.");

  const round = Number(body.round);
  const boardNumber = Number(body.board);
  const whiteKey = arbiterText(body.whiteKey);
  const blackKey = arbiterText(body.blackKey);
  const result = arbiterText(body.result);
  const baseRevision = Number(body.baseRevision);
  const currentRevision = Math.max(0, Number(row.current_revision || 0));
  if (!Number.isInteger(round) || round < 1 || !Number.isInteger(boardNumber) || boardNumber < 1) {
    throw new ApiError(400, "arbiter_board_invalid", "Round and board must identify a valid pairing.");
  }
  if (!ARBITER_ALLOWED_RESULTS.has(result)) {
    throw new ApiError(400, "arbiter_result_invalid", "Arbiter Access accepts only 1-0, 1/2-1/2 or 0-1 played results.");
  }
  if (!Number.isInteger(baseRevision) || baseRevision !== currentRevision) {
    return json(request, {
      ok: false,
      error: "cloud_revision_conflict",
      message: "The organizer changed the tournament. Refresh before sending this result.",
      currentRevision
    }, 409, { "Cache-Control": "no-store" });
  }

  const snapshot = await arbiterSnapshotObject(env, row.current_object_key);
  const tournament = arbiterTournamentFromSnapshot(snapshot, row.name);
  const roundKey = String(round);
  if (tournament?.pairings?.finalizedRounds?.[roundKey]) {
    throw new ApiError(409, "arbiter_round_finalized", `Round ${round} is finalized and read-only.`);
  }
  const boards = Array.isArray(tournament?.pairings?.liveBoards?.[roundKey]) ? tournament.pairings.liveBoards[roundKey] : [];
  const board = boards.find(item => Number(item?.board || 0) === boardNumber);
  if (!board) throw new ApiError(404, "arbiter_board_not_found", "This board is not present in the current pairing.");
  if (arbiterText(board.whiteKey) !== whiteKey || arbiterText(board.blackKey) !== blackKey) {
    return json(request, {
      ok: false,
      error: "cloud_revision_conflict",
      message: "The pairing changed before this result was sent. Refresh the tournament.",
      currentRevision
    }, 409, { "Cache-Control": "no-store" });
  }
  if (!whiteKey || !blackKey || ARBITER_ADMIN_ENTRY_TYPES.has(arbiterText(board.entryType))) {
    throw new ApiError(409, "arbiter_administrative_pairing", "Administrative pairings cannot receive played results from Arbiter Access.");
  }

  const existing = await env.DB.prepare(`
    SELECT * FROM cloud_arbiter_results
    WHERE tournament_id = ? AND organizer_id = ? AND round_number = ? AND board_number = ? AND acknowledged_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(row.id, session.organizer_id, round, boardNumber).first();

  if (existing && existing.session_id !== session.id && arbiterText(existing.result) !== result) {
    throw new ApiError(
      409,
      "arbiter_result_conflict",
      `Board ${boardNumber} already has a different pending result from ${arbiterText(existing.arbiter_name) || "another arbiter"}. Ask the organizer to review it.`
    );
  }

  const now = arbiterIsoNow();
  let submission;
  if (existing) {
    if (existing.session_id === session.id) {
      await env.DB.prepare(`
        UPDATE cloud_arbiter_results
        SET result = ?, base_revision = ?, arbiter_name = ?, white_key = ?, black_key = ?, updated_at = ?
        WHERE id = ? AND acknowledged_at IS NULL
      `).bind(result, baseRevision, session.name, whiteKey, blackKey, now, existing.id).run();
      submission = await env.DB.prepare(`SELECT * FROM cloud_arbiter_results WHERE id = ?`).bind(existing.id).first();
    } else {
      submission = existing;
    }
  } else {
    const submissionId = `arb-result:${crypto.randomUUID()}`;
    await env.DB.prepare(`
      INSERT INTO cloud_arbiter_results (
        id, tournament_id, organizer_id, session_id, arbiter_name,
        round_number, board_number, white_key, black_key, result, base_revision,
        created_at, updated_at, acknowledged_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).bind(
      submissionId,
      row.id,
      session.organizer_id,
      session.id,
      session.name,
      round,
      boardNumber,
      whiteKey,
      blackKey,
      result,
      baseRevision,
      now,
      now
    ).run();
    submission = await env.DB.prepare(`SELECT * FROM cloud_arbiter_results WHERE id = ?`).bind(submissionId).first();
  }

  await env.DB.prepare(`
    UPDATE cloud_arbiter_sessions SET last_seen_at = ?, last_submit_at = ? WHERE id = ?
  `).bind(now, now, session.id).run();

  return json(request, { ok: true, submission: arbiterSubmissionRecord(submission) }, 200, { "Cache-Control": "no-store" });
}

async function listOrganizerArbiterResults(request, env, tournamentId) {
  const organizer = await organizerFromBearer(request, env);
  await ensureArbiterAccessSchema(env);
  const row = await cloudTournamentForOrganizer(env, organizer.organizer_id, tournamentId);
  const result = await env.DB.prepare(`
    SELECT * FROM cloud_arbiter_results
    WHERE tournament_id = ? AND organizer_id = ? AND acknowledged_at IS NULL
    ORDER BY round_number ASC, board_number ASC, updated_at ASC
    LIMIT 1000
  `).bind(row.id, organizer.organizer_id).all();
  return json(request, { ok: true, results: (result?.results || []).map(arbiterSubmissionRecord) }, 200, { "Cache-Control": "no-store" });
}

async function acknowledgeOrganizerArbiterResults(request, env, tournamentId) {
  const organizer = await organizerFromBearer(request, env);
  await ensureArbiterAccessSchema(env);
  const row = await cloudTournamentForOrganizer(env, organizer.organizer_id, tournamentId);
  const body = await arbiterJsonBody(request);
  const ids = Array.isArray(body.submissionIds)
    ? [...new Set(body.submissionIds.map(arbiterText).filter(Boolean))].slice(0, 500)
    : [];
  if (!ids.length) return json(request, { ok: true, acknowledged: 0 }, 200, { "Cache-Control": "no-store" });
  const now = arbiterIsoNow();
  const statements = ids.map(id => env.DB.prepare(`
    UPDATE cloud_arbiter_results
    SET acknowledged_at = ?
    WHERE id = ? AND tournament_id = ? AND organizer_id = ? AND acknowledged_at IS NULL
  `).bind(now, id, row.id, organizer.organizer_id));
  const results = await env.DB.batch(statements);
  const acknowledged = results.reduce((sum, item) => sum + Number(item?.meta?.changes || 0), 0);
  return json(request, { ok: true, acknowledged }, 200, { "Cache-Control": "no-store" });
}

'''
source = replace_once(source, function_anchor, function_code + function_anchor, "Arbiter Access functions")
path.write_text(source, encoding="utf-8")
print("Applied restricted tournament Arbiter Access routes.")
