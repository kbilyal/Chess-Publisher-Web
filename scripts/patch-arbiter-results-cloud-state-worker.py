from pathlib import Path
import re
import sys

MARKER = "arbiter_results_cloud_state_v1"


def function_span(source: str, name: str):
    match = re.search(rf"(?:async\s+)?function\s+{re.escape(name)}\s*\([^)]*\)\s*\{{", source)
    if not match:
        raise SystemExit(f"Missing protected Worker function: {name}")
    depth = 0
    for index in range(match.end() - 1, len(source)):
        char = source[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return match.start(), index + 1
    raise SystemExit(f"Could not find end of Worker function: {name}")


path = Path(sys.argv[1] if len(sys.argv) > 1 else "worker.js")
source = path.read_text(encoding="utf-8")

if MARKER in source:
    print("beta.79 Arbiter Cloud-state result upgrade already present.")
    raise SystemExit(0)

required = [
    "private_cloud_hard_delete_v1",
    "arbiter_access_v1",
    "arbiter_snapshot_b2_v1",
    "arbiter_special_results_v1",
    "arbiter_results_ack_guard_v1",
    "b2UploadJson",
    "validateCloudSnapshot",
    "MAX_CLOUD_SNAPSHOT_BYTES",
    "cloud_revisions",
    "cloudTournamentForOrganizer",
    "submitArbiterResult",
]
missing = [item for item in required if item not in source]
if missing:
    raise SystemExit(f"Protected live Worker baseline is required; missing: {missing}")

start, end = function_span(source, "submitArbiterResult")
old_handler = source[start:end]
for required_fragment in [
    "arbiterSessionFromBearer(request, env)",
    "baseRevision !== currentRevision",
    "board.whiteKey",
    "board.blackKey",
    "cloud_arbiter_results",
    "arbiter_result_conflict",
]:
    if required_fragment not in old_handler:
        raise SystemExit(f"Unexpected Arbiter result handler; missing protected fragment: {required_fragment}")

new_handler = r'''// arbiter_results_cloud_state_v1 — beta.79 unified SYNC compatibility.
// Arbiter results are committed to the same private tournament snapshot/revision
// used by Desktop/Web SYNC. cloud_arbiter_results remains an unacknowledged
// compatibility/audit queue until Desktop validates and acknowledges it.
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

  if (existing && existing.session_id !== session.id && arbiterText(existing.result) !== result) {
    throw new ApiError(
      409,
      "arbiter_result_conflict",
      `Board ${boardNumber} already has a different pending result from ${arbiterText(existing.arbiter_name) || "another arbiter"}. Ask the organizer to review it.`
    );
  }

  const now = arbiterIsoNow();
  let committedRevision = currentRevision;
  const previousResult = arbiterText(board.result);

  if (previousResult !== result) {
    // Result-only mutation. Pairing, player identity, round structure and all other
    // tournament fields remain byte-for-byte represented by the same snapshot object.
    board.result = result;
    validateCloudSnapshot(snapshot);
    const serialized = JSON.stringify(snapshot);
    const bytes = encodeUtf8(serialized);
    if (!bytes.byteLength || bytes.byteLength > MAX_CLOUD_SNAPSHOT_BYTES) {
      throw new ApiError(413, "cloud_snapshot_too_large", "Cloud snapshot exceeds the 8 MiB beta limit.");
    }
    const checksum = await sha256Hex(bytes);

    if (!row.current_checksum || !timingSafeEqual(String(row.current_checksum), checksum)) {
      const revision = currentRevision + 1;
      const objectKey =
        `private/organizers/${session.organizer_id}` +
        `/tournaments/${row.id}` +
        `/revisions/${String(revision).padStart(6, "0")}-${checksum.slice(0, 16)}.json`;

      await b2UploadJson(env, objectKey, bytes);
      const stored = await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO cloud_revisions (
            cloud_tournament_id, revision, object_key, checksum, size_bytes,
            created_at, client_version, device_id, device_label, reason, source_revision
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'arbiter-result', ?
          WHERE EXISTS (
            SELECT 1 FROM cloud_tournaments
            WHERE id = ? AND organizer_id = ? AND current_revision = ?
          )
        `).bind(
          row.id,
          revision,
          objectKey,
          checksum,
          bytes.byteLength,
          now,
          "arbiter-access-beta79",
          arbiterText(session.device_id) || null,
          arbiterText(session.name) || null,
          currentRevision,
          row.id,
          session.organizer_id,
          currentRevision
        ),
        env.DB.prepare(`
          UPDATE cloud_tournaments
          SET current_revision = ?, current_checksum = ?, current_object_key = ?, updated_at = ?
          WHERE id = ? AND organizer_id = ? AND current_revision = ?
        `).bind(
          revision,
          checksum,
          objectKey,
          now,
          row.id,
          session.organizer_id,
          currentRevision
        )
      ]);

      if (
        Number(stored?.[0]?.meta?.changes || 0) !== 1 ||
        Number(stored?.[1]?.meta?.changes || 0) !== 1
      ) {
        throw new ApiError(
          409,
          "cloud_revision_conflict",
          "The cloud copy changed while this Arbiter result was being stored. No current revision was overwritten."
        );
      }
      committedRevision = revision;
    }
  }

  // The snapshot is authoritative for beta.79. This queue is deliberately kept
  // pending so Desktop Pairings ↕ SYNC can perform its own board/player/result
  // safety validation and version-guarded acknowledgement.
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

  return json(request, {
    ok: true,
    revision: committedRevision,
    cloudStateUpdated: committedRevision !== currentRevision,
    submission: arbiterSubmissionRecord(submission)
  }, 200, { "Cache-Control": "no-store" });
}'''

source = source[:start] + new_handler + source[end:]

checks = [
    MARKER,
    "board.result = result",
    "validateCloudSnapshot(snapshot)",
    "b2UploadJson(env, objectKey, bytes)",
    "INSERT INTO cloud_revisions",
    "'arbiter-result'",
    "UPDATE cloud_tournaments",
    "current_revision = ?",
    "cloud_arbiter_results",
    "arbiter_result_conflict",
    "arbiter_results_ack_guard_v1",
]
missing_after = [item for item in checks if item not in source]
if missing_after:
    raise SystemExit(f"beta.79 result patch verification failed; missing: {missing_after}")

path.write_text(source, encoding="utf-8")
print("ARBITER_RESULTS_CLOUD_STATE_V1=PASS")
