from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else 'worker.js')
source = path.read_text(encoding='utf-8')
marker = 'private_cloud_sync_lineage_v1'

if marker in source:
    print('Private Cloud sync lineage fix already present.')
    raise SystemExit(0)

required = [
    'private_cloud_hard_delete_v1',
    'arbiter_access_v1',
    'arbiter_special_results_v1',
    'async function putCloudSnapshot(',
    'async function submitArbiterResult(',
    'async function b2DownloadJson(',
    'async function b2UploadJson(',
    'function validateCloudSnapshot(',
]
for item in required:
    if item not in source:
        raise SystemExit(f'Required live Worker baseline is missing: {item}')


def function_span(text: str, name: str):
    needle = f'async function {name}('
    start = text.find(needle)
    if start < 0:
        raise SystemExit(f'Function not found: {name}')
    brace = text.find('{', start)
    if brace < 0:
        raise SystemExit(f'Function opening brace not found: {name}')
    depth = 0
    mode = 'code'
    quote = ''
    escaped = False
    i = brace
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ''
        if mode == 'line_comment':
            if ch == '\n':
                mode = 'code'
            i += 1
            continue
        if mode == 'block_comment':
            if ch == '*' and nxt == '/':
                mode = 'code'
                i += 2
                continue
            i += 1
            continue
        if mode == 'string':
            if escaped:
                escaped = False
            elif ch == '\\':
                escaped = True
            elif ch == quote:
                mode = 'code'
                quote = ''
            i += 1
            continue
        if ch == '/' and nxt == '/':
            mode = 'line_comment'
            i += 2
            continue
        if ch == '/' and nxt == '*':
            mode = 'block_comment'
            i += 2
            continue
        if ch in ('"', "'", '`'):
            mode = 'string'
            quote = ch
            i += 1
            continue
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return start, i + 1
        i += 1
    raise SystemExit(f'Function closing brace not found: {name}')


def replace_function(text: str, name: str, replacement: str):
    start, end = function_span(text, name)
    return text[:start] + replacement.rstrip() + text[end:]

helpers = r'''
// private_cloud_sync_lineage_v1
// Canonical private tournament content is shared by Web Companion and Desktop
// beta.79. Transport/public/session metadata is not allowed to manufacture a
// tournament revision or a BOTH_CHANGED conflict.
const CLOUD_SYNC_VOLATILE_KEYS = new Set([
  "updatedat", "lastviewedat", "lastaccess", "requesttimestamp", "requesttimestamps",
  "cachetimestamp", "cachetimestamps", "generatedat", "serverprocessingmetadata",
  "processingmetadata", "browserstate", "browserdata", "sessionstate", "sessiondata"
]);
const CLOUD_SYNC_LOCAL_KEYS = new Set([
  "organizertoken", "managetoken", "managekey", "admintoken", "authtoken", "accesstoken",
  "refreshtoken", "devicetoken", "password", "secret", "devicesecret", "aeskey", "aes", "iv",
  "filepath", "folderpath", "installationpath", "windowspath", "linuxpath", "executablepath",
  "workingdirectory", "serialport", "usbpath", "dgtport", "connectedorganizer", "organizeraccount",
  "organizersession", "accountsession", "authsession", "cloudworkspaceaccount", "currentaccount",
  "currentorganizeraccount"
]);

function cloudSyncStripTransportVolatile(value) {
  if (Array.isArray(value)) return value.map(cloudSyncStripTransportVolatile);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (CLOUD_SYNC_VOLATILE_KEYS.has(String(key).toLowerCase())) continue;
    out[key] = cloudSyncStripTransportVolatile(item);
  }
  return out;
}

function cloudSyncStripLocal(value) {
  if (Array.isArray(value)) return value.map(cloudSyncStripLocal);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (CLOUD_SYNC_LOCAL_KEYS.has(String(key).toLowerCase())) continue;
    out[key] = cloudSyncStripLocal(item);
  }
  return out;
}

function cloudSyncCanonicalValue(value) {
  if (Array.isArray(value)) return value.map(cloudSyncCanonicalValue);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) out[key] = cloudSyncCanonicalValue(value[key]);
  }
  return out;
}

function cloudSyncTournamentFromSnapshot(snapshot) {
  const tournaments = snapshot?.data?.tournaments;
  if (!tournaments || typeof tournaments !== "object") {
    throw new ApiError(400, "cloud_snapshot_invalid", "Cloud snapshot does not contain a tournament object.");
  }
  const keys = Object.keys(tournaments);
  const requested = String(snapshot?.data?.currentTournament || snapshot?.currentTournament || "").trim();
  const key = requested && tournaments[requested] ? requested : keys[0];
  const tournament = key ? tournaments[key] : null;
  if (!tournament || typeof tournament !== "object") {
    throw new ApiError(400, "cloud_snapshot_invalid", "Cloud snapshot does not contain a tournament object.");
  }
  return tournament;
}

function cloudSyncTournamentContent(snapshot) {
  const tournament = cloudSyncStripLocal(cloudSyncStripTransportVolatile(
    JSON.parse(JSON.stringify(cloudSyncTournamentFromSnapshot(snapshot)))
  ));
  delete tournament.cloud;
  delete tournament.online;
  delete tournament.hub;
  delete tournament.publication;
  delete tournament.savedAt;
  delete tournament.dgt;
  delete tournament.uiState;
  delete tournament.runtimeState;
  if (tournament.telegram && typeof tournament.telegram === "object") {
    delete tournament.telegram.token;
    delete tournament.telegram.botToken;
  }
  return cloudSyncCanonicalValue(tournament);
}

async function cloudSyncSnapshotContentFingerprint(snapshot) {
  const bytes = encodeUtf8(JSON.stringify(cloudSyncTournamentContent(snapshot)));
  return sha256Hex(bytes);
}

function cloudSyncCanonicalSnapshot(snapshot) {
  return cloudSyncCanonicalValue(cloudSyncStripTransportVolatile(JSON.parse(JSON.stringify(snapshot))));
}
'''

insert_at = source.find('async function putCloudSnapshot(')
if insert_at < 0:
    raise SystemExit('putCloudSnapshot insertion anchor is missing.')
source = source[:insert_at] + helpers + '\n' + source[insert_at:]

put_snapshot = r'''async function putCloudSnapshot(request, env, tournamentId) {
  const organizer = await organizerFromBearer(request, env);
  const row = await cloudTournamentForOrganizer(env, organizer.organizer_id, tournamentId);
  const body = await readJson(request, MAX_CLOUD_SNAPSHOT_BYTES + 64 * 1024);
  const snapshot = body?.snapshot;
  const validated = validateCloudSnapshot(snapshot);
  const canonicalSnapshot = cloudSyncCanonicalSnapshot(snapshot);
  const serialized = JSON.stringify(canonicalSnapshot);
  const bytes = encodeUtf8(serialized);
  if (!bytes.byteLength || bytes.byteLength > MAX_CLOUD_SNAPSHOT_BYTES) {
    throw new ApiError(413, "cloud_snapshot_too_large", "Cloud snapshot exceeds the 8 MiB beta limit.");
  }

  const checksum = await sha256Hex(bytes);
  const contentFingerprint = await cloudSyncSnapshotContentFingerprint(canonicalSnapshot);
  const expectedRevision = integerInRange(
    body?.baseRevision ?? request.headers.get("X-Expected-Revision") ?? 0,
    0,
    2147483647,
    0
  );
  const currentRevision = Math.max(0, Number(row.current_revision || 0));

  // Content equality is authoritative. Raw JSON bytes, property order and
  // transport metadata may differ without creating a tournament revision.
  if (currentRevision > 0 && row.current_object_key) {
    try {
      const currentSnapshot = await b2DownloadJson(env, row.current_object_key);
      if (currentSnapshot) {
        validateCloudSnapshot(currentSnapshot);
        const currentContentFingerprint = await cloudSyncSnapshotContentFingerprint(currentSnapshot);
        if (timingSafeEqual(String(currentContentFingerprint), String(contentFingerprint))) {
          await touchCloudDevice(env, organizer, body, request);
          return json(request, {
            ok: true,
            private: true,
            unchanged: true,
            tournamentId: row.id,
            cloudTournamentId: row.id,
            internalId: String(row.local_key || ""),
            revision: currentRevision,
            checksum: String(row.current_checksum || checksum),
            contentFingerprint,
            snapshot: cloudSyncCanonicalSnapshot(currentSnapshot),
            updatedAt: String(row.updated_at || "")
          }, 200, { "Cache-Control": "no-store" });
        }
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // If content comparison cannot be reconstructed, retain the optimistic
      // revision gate and raw checksum fallback below. No unsafe overwrite.
    }
  }

  if (row.current_checksum && timingSafeEqual(String(row.current_checksum), checksum)) {
    await touchCloudDevice(env, organizer, body, request);
    return json(request, {
      ok: true,
      private: true,
      unchanged: true,
      tournamentId: row.id,
      cloudTournamentId: row.id,
      internalId: String(row.local_key || ""),
      revision: currentRevision,
      checksum,
      contentFingerprint,
      snapshot: canonicalSnapshot,
      updatedAt: String(row.updated_at || "")
    }, 200, { "Cache-Control": "no-store" });
  }

  if (expectedRevision !== currentRevision) {
    return json(request, {
      ok: false,
      error: "cloud_revision_conflict",
      message: "The cloud copy changed on another device. No data was overwritten.",
      currentRevision,
      expectedRevision
    }, 409, { "Cache-Control": "no-store" });
  }

  const revision = currentRevision + 1;
  const now = new Date().toISOString();
  const objectKey = `private/organizers/${organizer.organizer_id}` +
    `/tournaments/${row.id}` +
    `/revisions/${String(revision).padStart(6, "0")}-${checksum.slice(0, 16)}.json`;

  await b2UploadJson(env, objectKey, bytes);
  const result = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO cloud_revisions (
        cloud_tournament_id, revision, object_key, checksum, size_bytes, created_at,
        client_version, device_id, device_label, reason, source_revision
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sync', NULL
      WHERE EXISTS (
        SELECT 1 FROM cloud_tournaments
        WHERE id = ? AND organizer_id = ? AND current_revision = ?
      )
    `).bind(
      row.id, revision, objectKey, checksum, bytes.byteLength, now,
      clientVersionFromRequest(request), cloudDeviceId(body?.deviceId) || null,
      optionalText(body?.deviceLabel, 160), row.id, organizer.organizer_id, currentRevision
    ),
    env.DB.prepare(`
      UPDATE cloud_tournaments
      SET name = ?, current_revision = ?, current_checksum = ?, current_object_key = ?, updated_at = ?
      WHERE id = ? AND organizer_id = ? AND current_revision = ?
    `).bind(
      validated.name, revision, checksum, objectKey, now,
      row.id, organizer.organizer_id, currentRevision
    )
  ]);

  if (Number(result?.[0]?.meta?.changes || 0) !== 1 || Number(result?.[1]?.meta?.changes || 0) !== 1) {
    throw new ApiError(
      409,
      "cloud_revision_conflict",
      "The cloud copy changed while this revision was being stored. No current revision was overwritten."
    );
  }

  await touchCloudDevice(env, organizer, body, request);
  return json(request, {
    ok: true,
    private: true,
    unchanged: false,
    tournamentId: row.id,
    cloudTournamentId: row.id,
    internalId: String(row.local_key || ""),
    revision,
    previousRevision: currentRevision || null,
    checksum,
    contentFingerprint,
    snapshot: canonicalSnapshot,
    size: bytes.byteLength,
    updatedAt: now
  }, 201, { "Cache-Control": "no-store" });
}'''
source = replace_function(source, 'putCloudSnapshot', put_snapshot)

arbiter_result = r'''async function submitArbiterResult(request, env) {
  const session = await arbiterSessionFromBearer(request, env);
  const body = await arbiterJsonBody(request);
  const row = await cloudTournamentForOrganizer(env, session.organizer_id, session.tournament_id);
  if (row.archived_at) throw new ApiError(409, "arbiter_tournament_archived", "This tournament is no longer available for Arbiter Access.");

  const round = Number(body.round);
  const boardNumber = Number(body.board);
  const whiteKey = arbiterText(body.whiteKey);
  const blackKey = arbiterText(body.blackKey);
  const resultValue = arbiterText(body.result);
  const baseRevision = Number(body.baseRevision);
  const currentRevision = Math.max(0, Number(row.current_revision || 0));
  if (!Number.isInteger(round) || round < 1 || !Number.isInteger(boardNumber) || boardNumber < 1) {
    throw new ApiError(400, "arbiter_board_invalid", "Round and board must identify a valid pairing.");
  }
  if (!ARBITER_ALLOWED_RESULTS.has(resultValue)) {
    throw new ApiError(400, "arbiter_result_invalid", "Arbiter Access accepts 1-0, 1/2-1/2, 0-1, 1F-0F, 0F-1F or 0F-0F results.");
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
  if (existing && existing.session_id !== session.id && arbiterText(existing.result) !== resultValue) {
    throw new ApiError(
      409,
      "arbiter_result_conflict",
      `Board ${boardNumber} already has a different pending result from ${arbiterText(existing.arbiter_name) || "another arbiter"}. Ask the organizer to review it.`
    );
  }

  const now = arbiterIsoNow();
  const currentBoardResult = arbiterText(board.result);
  const changed = currentBoardResult !== resultValue;
  let revision = currentRevision;
  let checksum = String(row.current_checksum || "");
  let canonicalSnapshot = cloudSyncCanonicalSnapshot(snapshot);
  let contentFingerprint = await cloudSyncSnapshotContentFingerprint(canonicalSnapshot);
  let objectKey = String(row.current_object_key || "");
  let submissionId = existing?.id || "";

  const resultStatements = [];
  if (existing && existing.session_id === session.id) {
    resultStatements.push(env.DB.prepare(`
      UPDATE cloud_arbiter_results
      SET result = ?, base_revision = ?, arbiter_name = ?, white_key = ?, black_key = ?, updated_at = ?
      WHERE id = ? AND acknowledged_at IS NULL
    `).bind(resultValue, changed ? currentRevision + 1 : currentRevision, session.name, whiteKey, blackKey, now, existing.id));
  } else if (!existing) {
    submissionId = `arb-result:${crypto.randomUUID()}`;
    resultStatements.push(env.DB.prepare(`
      INSERT INTO cloud_arbiter_results (
        id, tournament_id, organizer_id, session_id, arbiter_name,
        round_number, board_number, white_key, black_key, result, base_revision,
        created_at, updated_at, acknowledged_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).bind(
      submissionId, row.id, session.organizer_id, session.id, session.name,
      round, boardNumber, whiteKey, blackKey, resultValue,
      changed ? currentRevision + 1 : currentRevision, now, now
    ));
  }

  if (changed) {
    board.result = resultValue;
    canonicalSnapshot = cloudSyncCanonicalSnapshot(snapshot);
    const serialized = JSON.stringify(canonicalSnapshot);
    const bytes = encodeUtf8(serialized);
    if (!bytes.byteLength || bytes.byteLength > MAX_CLOUD_SNAPSHOT_BYTES) {
      throw new ApiError(413, "cloud_snapshot_too_large", "Cloud snapshot exceeds the 8 MiB beta limit.");
    }
    checksum = await sha256Hex(bytes);
    contentFingerprint = await cloudSyncSnapshotContentFingerprint(canonicalSnapshot);
    revision = currentRevision + 1;
    objectKey = `private/organizers/${session.organizer_id}` +
      `/tournaments/${row.id}` +
      `/revisions/${String(revision).padStart(6, "0")}-${checksum.slice(0, 16)}.json`;
    await b2UploadJson(env, objectKey, bytes);

    const statements = [
      env.DB.prepare(`
        INSERT INTO cloud_revisions (
          cloud_tournament_id, revision, object_key, checksum, size_bytes, created_at,
          client_version, device_id, device_label, reason, source_revision
        )
        SELECT ?, ?, ?, ?, ?, ?, 'web-arbiter', ?, ?, 'arbiter-result', ?
        WHERE EXISTS (
          SELECT 1 FROM cloud_tournaments
          WHERE id = ? AND organizer_id = ? AND current_revision = ?
        )
      `).bind(
        row.id, revision, objectKey, checksum, bytes.byteLength, now,
        arbiterText(session.device_id) || null, arbiterText(session.name) || null,
        currentRevision, row.id, session.organizer_id, currentRevision
      ),
      env.DB.prepare(`
        UPDATE cloud_tournaments
        SET current_revision = ?, current_checksum = ?, current_object_key = ?, updated_at = ?
        WHERE id = ? AND organizer_id = ? AND current_revision = ?
      `).bind(revision, checksum, objectKey, now, row.id, session.organizer_id, currentRevision),
      ...resultStatements,
      env.DB.prepare(`
        UPDATE cloud_arbiter_sessions SET last_seen_at = ?, last_submit_at = ? WHERE id = ?
      `).bind(now, now, session.id)
    ];
    const dbResult = await env.DB.batch(statements);
    if (Number(dbResult?.[0]?.meta?.changes || 0) !== 1 || Number(dbResult?.[1]?.meta?.changes || 0) !== 1) {
      throw new ApiError(409, "cloud_revision_conflict", "The tournament changed while this result was being stored. No current revision was overwritten.");
    }
  } else {
    await env.DB.batch([
      ...resultStatements,
      env.DB.prepare(`UPDATE cloud_arbiter_sessions SET last_seen_at = ?, last_submit_at = ? WHERE id = ?`).bind(now, now, session.id)
    ]);
  }

  const submission = submissionId
    ? await env.DB.prepare(`SELECT * FROM cloud_arbiter_results WHERE id = ?`).bind(submissionId).first()
    : existing;
  return json(request, {
    ok: true,
    unchanged: !changed,
    tournamentId: row.id,
    cloudTournamentId: row.id,
    internalId: String(row.local_key || ""),
    revision,
    previousRevision: changed ? currentRevision : null,
    checksum,
    contentFingerprint,
    snapshot: canonicalSnapshot,
    submission: submission ? arbiterSubmissionRecord(submission) : null
  }, 200, { "Cache-Control": "no-store" });
}'''
source = replace_function(source, 'submitArbiterResult', arbiter_result)

path.write_text(source, encoding='utf-8')
print('Applied canonical private Cloud sync lineage and revisioned Arbiter results.')
