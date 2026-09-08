from pathlib import Path
import sys


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return source.replace(old, new, 1)


path = Path(sys.argv[1] if len(sys.argv) > 1 else "worker.js")
source = path.read_text(encoding="utf-8")
marker = "private_cloud_archive_v1"
if marker in source:
    print("Private Cloud archive routes already present.")
    raise SystemExit(0)

router_create = '''  if (
    request.method === "POST" &&
    path === "/api/v1/cloud/tournaments"
  ) {
    return createCloudTournament(request, env);
  }

  let cloudMatch = path.match(
'''
router_create_new = '''  if (
    request.method === "POST" &&
    path === "/api/v1/cloud/tournaments"
  ) {
    return createCloudTournament(request, env);
  }

  // private_cloud_archive_v1 — reversible Organizer-owned Trash.
  if (
    request.method === "GET" &&
    path === "/api/v1/cloud/tournaments/archived"
  ) {
    return listArchivedCloudTournaments(request, env);
  }

  let cloudMatch = path.match(
'''
source = replace_once(source, router_create, router_create_new, "archived-list route")

router_generic = '''  cloudMatch = path.match(
    /^\\/api\\/v1\\/cloud\\/tournaments\\/([^/]+)$/
  );

  if (request.method === "GET" && cloudMatch) {
    return getCloudTournament(
      request,
      env,
      decodeURIComponent(cloudMatch[1])
    );
  }

  if (
    request.method === "GET" &&
    path === "/api/v1/public/tournaments"
'''
router_generic_new = '''  cloudMatch = path.match(
    /^\\/api\\/v1\\/cloud\\/tournaments\\/([^/]+)\\/restore$/
  );

  if (request.method === "POST" && cloudMatch) {
    return restoreArchivedCloudTournament(
      request,
      env,
      decodeURIComponent(cloudMatch[1])
    );
  }

  cloudMatch = path.match(
    /^\\/api\\/v1\\/cloud\\/tournaments\\/([^/]+)$/
  );

  if (request.method === "GET" && cloudMatch) {
    return getCloudTournament(
      request,
      env,
      decodeURIComponent(cloudMatch[1])
    );
  }

  if (request.method === "DELETE" && cloudMatch) {
    return archiveCloudTournament(
      request,
      env,
      decodeURIComponent(cloudMatch[1])
    );
  }

  if (
    request.method === "GET" &&
    path === "/api/v1/public/tournaments"
'''
source = replace_once(source, router_generic, router_generic_new, "archive/restore routes")

function_anchor = '''async function createCloudTournament(request, env) {
'''
archive_functions = r'''async function listArchivedCloudTournaments(request, env) {
  const organizer = await organizerFromBearer(request, env);
  await ensureCloudSchema(env);

  const result = await env.DB.prepare(`
    SELECT
      id,
      organizer_id,
      local_key,
      name,
      current_revision,
      current_checksum,
      current_object_key,
      created_at,
      updated_at,
      archived_at
    FROM cloud_tournaments
    WHERE
      organizer_id = ?
      AND archived_at IS NOT NULL
    ORDER BY archived_at DESC
    LIMIT ?
  `)
    .bind(organizer.organizer_id, MAX_CLOUD_LIST)
    .all();

  return json(
    request,
    {
      ok: true,
      private: true,
      archived: true,
      organizer: {
        id: organizer.organizer_id,
        displayName: organizer.display_name
      },
      tournaments: (result?.results || []).map(cloudTournamentRecord)
    },
    200,
    { "Cache-Control": "no-store" }
  );
}

async function archiveCloudTournament(request, env, tournamentId) {
  const organizer = await organizerFromBearer(request, env);
  const row = await cloudTournamentForOrganizer(
    env,
    organizer.organizer_id,
    tournamentId
  );

  if (row.archived_at) {
    return json(
      request,
      { ok: true, private: true, archived: true, unchanged: true, tournament: cloudTournamentRecord(row) },
      200,
      { "Cache-Control": "no-store" }
    );
  }

  const rawExpected = request.headers.get("X-Expected-Revision");
  if (rawExpected === null || String(rawExpected).trim() === "") {
    throw new ApiError(
      428,
      "cloud_expected_revision_required",
      "X-Expected-Revision is required to move a Cloud tournament to Trash."
    );
  }

  const expectedRevision = integerInRange(rawExpected, 0, 2147483647, 0);
  const currentRevision = Math.max(0, Number(row.current_revision || 0));
  if (expectedRevision !== currentRevision) {
    return json(
      request,
      {
        ok: false,
        error: "cloud_revision_conflict",
        message: "Cloud tournament changed before it could be moved to Trash.",
        currentRevision
      },
      409,
      { "Cache-Control": "no-store" }
    );
  }

  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE cloud_tournaments
    SET archived_at = ?, updated_at = ?
    WHERE
      id = ?
      AND organizer_id = ?
      AND current_revision = ?
      AND archived_at IS NULL
  `)
    .bind(now, now, row.id, organizer.organizer_id, currentRevision)
    .run();

  if (Number(result?.meta?.changes || 0) !== 1) {
    const latest = await cloudTournamentForOrganizer(env, organizer.organizer_id, row.id);
    return json(
      request,
      {
        ok: false,
        error: "cloud_revision_conflict",
        message: "Cloud tournament changed before it could be moved to Trash.",
        currentRevision: Math.max(0, Number(latest.current_revision || 0))
      },
      409,
      { "Cache-Control": "no-store" }
    );
  }

  const archived = await cloudTournamentForOrganizer(env, organizer.organizer_id, row.id);
  return json(
    request,
    { ok: true, private: true, archived: true, unchanged: false, tournament: cloudTournamentRecord(archived) },
    200,
    { "Cache-Control": "no-store" }
  );
}

async function restoreArchivedCloudTournament(request, env, tournamentId) {
  const organizer = await organizerFromBearer(request, env);
  const row = await cloudTournamentForOrganizer(
    env,
    organizer.organizer_id,
    tournamentId
  );

  if (!row.archived_at) {
    return json(
      request,
      { ok: true, private: true, restored: true, unchanged: true, tournament: cloudTournamentRecord(row) },
      200,
      { "Cache-Control": "no-store" }
    );
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE cloud_tournaments
    SET archived_at = NULL, updated_at = ?
    WHERE id = ? AND organizer_id = ?
  `)
    .bind(now, row.id, organizer.organizer_id)
    .run();

  const restored = await cloudTournamentForOrganizer(env, organizer.organizer_id, row.id);
  return json(
    request,
    { ok: true, private: true, restored: true, unchanged: false, tournament: cloudTournamentRecord(restored) },
    200,
    { "Cache-Control": "no-store" }
  );
}

'''
source = replace_once(source, function_anchor, archive_functions + function_anchor, "archive functions")
path.write_text(source, encoding="utf-8")
print("Applied reversible private Cloud archive/restore routes.")
