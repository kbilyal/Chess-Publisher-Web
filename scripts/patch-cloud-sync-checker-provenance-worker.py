from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else 'worker.js')
source = path.read_text(encoding='utf-8')
marker = 'private_cloud_sync_checker_provenance_v1'

if marker in source:
    print('Private Cloud checker-provenance sync fix already present.')
    raise SystemExit(0)

required = [
    'private_cloud_sync_lineage_v1',
    'cloudSyncSnapshotContentFingerprint',
    'function cloudSyncStripLocal(',
    'const CLOUD_SYNC_LOCAL_KEYS = new Set([',
]
for item in required:
    if item not in source:
        raise SystemExit(f'Required live Worker sync baseline is missing: {item}')

runtime_keys = [
    'lastcheckeruisource',
    'lastcheckeruibuildversion',
    'lastcheckeruicheckedat',
]
for key in runtime_keys:
    if f'"{key}"' in source or f"'{key}'" in source:
        raise SystemExit(f'Refusing partially/already modified live Worker without marker: {key}')

old = '  "workingdirectory", "serialport", "usbpath", "dgtport", "connectedorganizer", "organizeraccount",\n'
new = (
    '  "workingdirectory", "serialport", "usbpath", "dgtport",\n'
    '  // private_cloud_sync_checker_provenance_v1\n'
    '  "lastcheckeruisource", "lastcheckeruibuildversion", "lastcheckeruicheckedat",\n'
    '  "connectedorganizer", "organizeraccount",\n'
)

count = source.count(old)
if count != 1:
    raise SystemExit(f'Expected exactly one checker-provenance insertion anchor, found {count}.')

patched = source.replace(old, new, 1)
for key in runtime_keys:
    if f'"{key}"' not in patched:
        raise SystemExit(f'Checker-provenance key was not inserted: {key}')
if patched.count(marker) != 1:
    raise SystemExit('Checker-provenance marker count is not exactly one.')

path.write_text(patched, encoding='utf-8')
print('Private Cloud checker-provenance sync fix applied.')
