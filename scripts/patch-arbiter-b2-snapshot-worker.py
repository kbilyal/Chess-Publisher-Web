from pathlib import Path
import sys


path = Path(sys.argv[1] if len(sys.argv) > 1 else "worker.js")
source = path.read_text(encoding="utf-8")
marker = "arbiter_snapshot_b2_v1"

if marker in source:
    print("Arbiter B2 snapshot fix already present.")
    raise SystemExit(0)

if "arbiter_access_v1" not in source:
    raise SystemExit("Restricted Arbiter Access baseline is required before applying the B2 snapshot fix.")
if "async function b2DownloadJson(" not in source:
    raise SystemExit("Live private Cloud B2 download helper is required before applying the Arbiter snapshot fix.")

old = '''async function arbiterSnapshotObject(env, objectKey) {
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
'''

new = '''async function arbiterSnapshotObject(env, objectKey) {
  // arbiter_snapshot_b2_v1 — use the same Backblaze B2 snapshot reader as the
  // private Organizer Cloud route. Arbiter Access never receives B2 credentials.
  if (!objectKey) {
    throw new ApiError(
      409,
      "arbiter_snapshot_missing",
      "The organizer has not synchronized this tournament to Cloud yet."
    );
  }

  const snapshot = await b2DownloadJson(env, objectKey);
  if (!snapshot) {
    throw new ApiError(
      502,
      "arbiter_snapshot_missing",
      "The synchronized tournament snapshot is missing from Cloud storage."
    );
  }

  validateCloudSnapshot(snapshot);
  return snapshot;
}
'''

count = source.count(old)
if count != 1:
    raise SystemExit(f"Arbiter snapshot loader anchor mismatch: expected 1, found {count}.")

path.write_text(source.replace(old, new, 1), encoding="utf-8")
print("Applied Arbiter Backblaze B2 snapshot reader fix.")
