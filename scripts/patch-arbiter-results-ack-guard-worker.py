from pathlib import Path
import sys


path = Path(sys.argv[1] if len(sys.argv) > 1 else "worker.js")
source = path.read_text(encoding="utf-8")
marker = "arbiter_results_ack_guard_v1"
if marker in source:
    print("Arbiter result acknowledgement guard already present.")
    raise SystemExit(0)

if "arbiter_access_v1" not in source or "async function acknowledgeOrganizerArbiterResults" not in source:
    raise SystemExit("Restricted Arbiter Access baseline is required before applying the acknowledgement guard.")

old = r'''  const body = await arbiterJsonBody(request);
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
'''

new = r'''  const body = await arbiterJsonBody(request);
  // arbiter_results_ack_guard_v1 — a pending result may be edited by the same
  // arbiter while an organizer is downloading it. Guard acknowledgement by the
  // exact updated_at version that was actually persisted and verified. A stale
  // downloader can therefore never acknowledge a newer correction.
  const guarded = Array.isArray(body.submissions)
    ? body.submissions
        .map(item => ({ id: arbiterText(item?.id), updatedAt: arbiterText(item?.updatedAt) }))
        .filter(item => item.id && item.updatedAt)
        .slice(0, 500)
    : [];
  const legacyIds = guarded.length
    ? []
    : (Array.isArray(body.submissionIds)
        ? [...new Set(body.submissionIds.map(arbiterText).filter(Boolean))].slice(0, 500)
        : []);
  if (!guarded.length && !legacyIds.length) {
    return json(request, { ok: true, acknowledged: 0, guarded: false }, 200, { "Cache-Control": "no-store" });
  }

  const now = arbiterIsoNow();
  const statements = guarded.length
    ? guarded.map(item => env.DB.prepare(`
        UPDATE cloud_arbiter_results
        SET acknowledged_at = ?
        WHERE id = ? AND tournament_id = ? AND organizer_id = ?
          AND acknowledged_at IS NULL AND updated_at = ?
      `).bind(now, item.id, row.id, organizer.organizer_id, item.updatedAt))
    : legacyIds.map(id => env.DB.prepare(`
        UPDATE cloud_arbiter_results
        SET acknowledged_at = ?
        WHERE id = ? AND tournament_id = ? AND organizer_id = ? AND acknowledged_at IS NULL
      `).bind(now, id, row.id, organizer.organizer_id));
  const results = await env.DB.batch(statements);
  const acknowledged = results.reduce((sum, item) => sum + Number(item?.meta?.changes || 0), 0);
  return json(request, {
    ok: true,
    acknowledged,
    guarded: guarded.length > 0,
    requested: guarded.length || legacyIds.length
  }, 200, { "Cache-Control": "no-store" });
'''

count = source.count(old)
if count != 1:
    raise SystemExit(f"Arbiter acknowledgement function anchor mismatch: expected 1, found {count}.")

source = source.replace(old, new, 1)
path.write_text(source, encoding="utf-8")
print("Applied version-guarded Arbiter result acknowledgement.")
