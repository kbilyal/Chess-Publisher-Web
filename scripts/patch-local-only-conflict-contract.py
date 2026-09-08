from pathlib import Path

p = Path('tests/ui/hub-companion-v1.test.mjs')
s = p.read_text()
s = s.replace(
    "has(cloudActions, 'cloudApi.putSnapshot', 'A proven conflict-free merge must still use the optimistic revision gate.');",
    "lacks(cloudActions, 'cloudApi.putSnapshot', 'Resolve Conflict must never auto-Push a merged tournament; Push remains an explicit user action.');"
)
s = s.replace(
    "has(cloudActions, 'return cloud.pullChanges(updated)', 'Existing provider must remain authoritative for clearing conflict state after a smart merge.');",
    "has(cloudActions, 'return cloud.pullChanges(hydrated)', 'Existing provider must refresh conflict state after a local-only safe merge without uploading it.');"
)
p.write_text(s)
