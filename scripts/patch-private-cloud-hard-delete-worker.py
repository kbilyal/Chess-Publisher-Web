from pathlib import Path
import sys


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return source.replace(old, new, 1)


path = Path(sys.argv[1] if len(sys.argv) > 1 else "worker.js")
source = path.read_text(encoding="utf-8")
marker = "private_cloud_hard_delete_v1"
if marker in source:
    print("Private Cloud permanent-delete route already present.")
    raise SystemExit(0)

if "private_cloud_archive_v1" not in source:
    raise SystemExit("Private Cloud archive baseline is required before applying permanent delete.")

router_old = '''  if (request.method === "DELETE" && cloudMatch) {
    return archiveCloudTournament(
      request,
      env,
      decodeURIComponent(cloudMatch[1])
    );
  }
'''
router_new = '''  // private_cloud_hard_delete_v1 — main-list delete permanently removes the private Cloud tournament.
  if (request.method === "DELETE" && cloudMatch) {
    return deleteCloudTournamentPermanently(
      request,
      env,
      decodeURIComponent(cloudMatch[1])
    );
  }
'''
source = replace_once(source, router_old, router_new, "permanent-delete route")

function_anchor = '''async function restoreArchivedCloudTournament(request, env, tournamentId) {
'''
function_code = r'''async function deleteCloudTournamentPermanently(request, env, tournamentId) {
  const organizer = await organizerFromBearer(request, env);
  await ensureCloudSchema(env);
  const row = await cloudTournamentForOrganizer(
    env,
    organizer.organizer_id,
    tournamentId
  );

  const rawExpected = request.headers.get("X-Expected-Revision");
  if (rawExpected === null || String(rawExpected).trim() === "") {
    throw new ApiError(
      428,
      "cloud_expected_revision_required",
      "X-Expected-Revision is required to permanently delete a Cloud tournament."
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
        message: "Cloud tournament changed before it could be permanently deleted.",
        currentRevision
      },
      409,
      { "Cache-Control": "no-store" }
    );
  }

  // First take the same revision-protected archive lock used by the reversible
  // Trash path. This closes the stale-main-list race before destructive cleanup.
  if (!row.archived_at) {
    const now = new Date().toISOString();
    const lock = await env.DB.prepare(`
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

    if (Number(lock?.meta?.changes || 0) !== 1) {
      const latest = await cloudTournamentForOrganizer(env, organizer.organizer_id, row.id);
      return json(
        request,
        {
          ok: false,
          error: "cloud_revision_conflict",
          message: "Cloud tournament changed before it could be permanently deleted.",
          currentRevision: Math.max(0, Number(latest.current_revision || 0))
        },
        409,
        { "Cache-Control": "no-store" }
      );
    }
  }

  const objectKeys = new Set();
  if (row.current_object_key) objectKeys.add(String(row.current_object_key));

  const tableRows = await env.DB.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'cloud_%'
  `).all();

  const dependentDeletes = [];
  for (const tableRow of tableRows?.results || []) {
    const tableName = String(tableRow?.name || "");
    if (!/^cloud_[A-Za-z0-9_]+$/.test(tableName) || tableName === "cloud_tournaments") {
      continue;
    }

    const tableInfo = await env.DB.prepare(`PRAGMA table_info("${tableName}")`).all();
    const columns = (tableInfo?.results || []).map(column => String(column?.name || ""));
    if (!columns.length) continue;

    let referenceColumn = "";
    try {
      const foreignKeys = await env.DB.prepare(`PRAGMA foreign_key_list("${tableName}")`).all();
      const relation = (foreignKeys?.results || []).find(entry =>
        String(entry?.table || "") === "cloud_tournaments" && String(entry?.to || "") === "id"
      );
      referenceColumn = String(relation?.from || "");
    } catch {
      // D1 schema introspection fallback below covers legacy tables without FK metadata.
    }

    if (!referenceColumn) {
      referenceColumn = columns.find(name => name === "tournament_id" || name === "cloud_tournament_id") || "";
    }
    if (!referenceColumn || !columns.includes(referenceColumn)) continue;

    const objectColumns = columns.filter(name => /object_key$/i.test(name));
    if (objectColumns.length) {
      const projection = objectColumns.map(name => `"${name}"`).join(", ");
      const rows = await env.DB.prepare(
        `SELECT ${projection} FROM "${tableName}" WHERE "${referenceColumn}" = ?`
      ).bind(row.id).all();
      for (const item of rows?.results || []) {
        for (const name of objectColumns) {
          const value = item?.[name];
          if (value) objectKeys.add(String(value));
        }
      }
    }

    dependentDeletes.push(
      env.DB.prepare(`DELETE FROM "${tableName}" WHERE "${referenceColumn}" = ?`).bind(row.id)
    );
  }

  const statements = [
    ...dependentDeletes,
    env.DB.prepare(`
      DELETE FROM cloud_tournaments
      WHERE id = ? AND organizer_id = ? AND current_revision = ?
    `).bind(row.id, organizer.organizer_id, currentRevision)
  ];
  const results = await env.DB.batch(statements);
  const parentResult = results[results.length - 1];
  if (Number(parentResult?.meta?.changes || 0) !== 1) {
    throw new ApiError(
      409,
      "cloud_revision_conflict",
      "Cloud tournament changed before permanent deletion completed. Refresh the tournament list and try again."
    );
  }

  let deletedObjectCount = 0;
  let objectCleanupWarnings = 0;
  const buckets = Object.values(env).filter(binding =>
    binding &&
    typeof binding.get === "function" &&
    typeof binding.put === "function" &&
    typeof binding.delete === "function" &&
    typeof binding.list === "function" &&
    typeof binding.head === "function"
  );

  for (const key of objectKeys) {
    let removed = false;
    for (const bucket of buckets) {
      try {
        await bucket.delete(key);
        removed = true;
      } catch {
        // Best effort across the Worker R2 bindings. Database deletion is authoritative.
      }
    }
    if (removed) deletedObjectCount += 1;
    else objectCleanupWarnings += 1;
  }

  return json(
    request,
    {
      ok: true,
      private: true,
      deleted: true,
      permanent: true,
      tournamentId: row.id,
      deletedRevision: currentRevision,
      deletedObjectCount,
      objectCleanupWarnings
    },
    200,
    { "Cache-Control": "no-store" }
  );
}

'''
source = replace_once(source, function_anchor, function_code + function_anchor, "permanent-delete function")
path.write_text(source, encoding="utf-8")
print("Applied permanent private Cloud tournament deletion route.")
