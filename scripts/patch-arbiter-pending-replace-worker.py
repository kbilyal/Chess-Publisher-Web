from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else "worker.js")
source = path.read_text(encoding="utf-8")
marker = "arbiter_pending_delivery_replace_v1"

if marker in source:
    print("Arbiter pending delivery replace fix already present.")
    raise SystemExit(0)

required = [
    "private_cloud_hard_delete_v1",
    "arbiter_access_v1",
    "arbiter_snapshot_b2_v1",
    "private_cloud_sync_lineage_v1",
    "arbiter_clear_result_v1",
    "arbiter_canonical_snapshot_read_v1",
    "async function submitArbiterResult(",
]
for item in required:
    if item not in source:
        raise SystemExit(f"Required protected Worker baseline is missing: {item}")


def function_span(text: str, name: str):
    needle = f"async function {name}("
    start = text.find(needle)
    if start < 0:
        raise SystemExit(f"Function not found: {name}")
    brace = text.find("{", start)
    if brace < 0:
        raise SystemExit(f"Opening brace not found: {name}")
    depth = 0
    mode = "code"
    quote = ""
    escaped = False
    i = brace
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if mode == "line":
            if ch == "\n":
                mode = "code"
            i += 1
            continue
        if mode == "block":
            if ch == "*" and nxt == "/":
                mode = "code"
                i += 2
                continue
            i += 1
            continue
        if mode == "string":
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                mode = "code"
                quote = ""
            i += 1
            continue
        if ch == "/" and nxt == "/":
            mode = "line"
            i += 2
            continue
        if ch == "/" and nxt == "*":
            mode = "block"
            i += 2
            continue
        if ch in ('"', "'", "`"):
            mode = "string"
            quote = ch
            i += 1
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return start, i + 1
        i += 1
    raise SystemExit(f"Closing brace not found: {name}")


start, end = function_span(source, "submitArbiterResult")
body = source[start:end]

conflict_block = '''  if (existing && existing.session_id !== session.id && arbiterText(existing.result) !== resultValue) {
    throw new ApiError(
      409,
      "arbiter_result_conflict",
      `Board ${boardNumber} already has a different pending result from ${arbiterText(existing.arbiter_name) || "another arbiter"}. Ask the organizer to review it.`
    );
  }
'''
if body.count(conflict_block) != 1:
    raise SystemExit("Pending-result conflict anchor was not found exactly once in submitArbiterResult.")
body = body.replace(
    conflict_block,
    '''  // arbiter_pending_delivery_replace_v1
  // The authoritative B2 snapshot + baseRevision gate owns concurrency now.
  // D1 pending rows are delivery/ACK state only and must never block a later
  // correction (including Clear result) from a refreshed/rejoined Arbiter session.
''',
    1,
)

same_session = "  if (existing && existing.session_id === session.id) {"
if body.count(same_session) != 1:
    raise SystemExit("Same-session pending update anchor was not found exactly once.")
body = body.replace(same_session, "  if (existing) {", 1)

old_update = '''      UPDATE cloud_arbiter_results
      SET result = ?, base_revision = ?, arbiter_name = ?, white_key = ?, black_key = ?, updated_at = ?
      WHERE id = ? AND acknowledged_at IS NULL
    `).bind(resultValue, changed ? currentRevision + 1 : currentRevision, session.name, whiteKey, blackKey, now, existing.id));'''
new_update = '''      UPDATE cloud_arbiter_results
      SET session_id = ?, result = ?, base_revision = ?, arbiter_name = ?, white_key = ?, black_key = ?, updated_at = ?
      WHERE id = ? AND acknowledged_at IS NULL
    `).bind(session.id, resultValue, changed ? currentRevision + 1 : currentRevision, session.name, whiteKey, blackKey, now, existing.id));'''
if body.count(old_update) != 1:
    raise SystemExit("Pending delivery UPDATE anchor was not found exactly once.")
body = body.replace(old_update, new_update, 1)

# Keep the revision guard as the authoritative concurrency protection.
revision_guard = "if (!Number.isInteger(baseRevision) || baseRevision !== currentRevision)"
if revision_guard not in body:
    raise SystemExit("Protected baseRevision/currentRevision guard is missing.")
if "arbiter_result_conflict" in body:
    raise SystemExit("Obsolete pending-result lock still exists after patch.")
if "if (existing) {" not in body or "SET session_id = ?, result = ?" not in body:
    raise SystemExit("Latest pending delivery replacement semantics are incomplete.")

source = source[:start] + body + source[end:]
path.write_text(source, encoding="utf-8")
print("Applied Arbiter pending delivery replacement point-fix.")
