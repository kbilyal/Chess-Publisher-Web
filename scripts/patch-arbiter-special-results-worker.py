from pathlib import Path
import sys


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return source.replace(old, new, 1)


path = Path(sys.argv[1] if len(sys.argv) > 1 else "worker.js")
source = path.read_text(encoding="utf-8")
marker = "arbiter_special_results_v1"

if marker in source:
    print("Arbiter special results upgrade already present.")
    raise SystemExit(0)

required = ["private_cloud_hard_delete_v1", "arbiter_access_v1", "ARBITER_ALLOWED_RESULTS", "submitArbiterResult"]
missing = [item for item in required if item not in source]
if missing:
    raise SystemExit(f"Protected Arbiter Access baseline is required; missing: {missing}")

old_set = 'const ARBITER_ALLOWED_RESULTS = new Set(["1 - 0", "½ - ½", "0 - 1"]);'
extended_set = 'const ARBITER_ALLOWED_RESULTS = new Set(["1 - 0", "½ - ½", "0 - 1", "1F - 0F", "0F - 1F", "0F - 0F"]);'
marked_set = f'// {marker} — accept the same special forfeit result codes as Chess-Publisher core.\n{extended_set}'

if old_set in source:
    source = replace_once(source, old_set, marked_set, "Arbiter allowed results")
elif extended_set in source:
    source = replace_once(source, extended_set, marked_set, "Arbiter special results marker")
else:
    raise SystemExit("Unexpected ARBITER_ALLOWED_RESULTS definition; refusing to modify live Worker.")

old_message = 'Arbiter Access accepts only 1-0, 1/2-1/2 or 0-1 played results.'
new_message = 'Arbiter Access accepts 1-0, 1/2-1/2, 0-1, 1F-0F, 0F-1F or 0F-0F results.'
if old_message in source:
    source = replace_once(source, old_message, new_message, "Arbiter result validation message")
elif new_message not in source:
    raise SystemExit("Unexpected Arbiter result validation message; refusing to modify live Worker.")

path.write_text(source, encoding="utf-8")
print("Arbiter special results Worker upgrade applied.")