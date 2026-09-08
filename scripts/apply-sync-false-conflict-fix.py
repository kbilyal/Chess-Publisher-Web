from pathlib import Path

# Fix false Desktop/Cloud <-> Web conflicts caused by stale fingerprint-schema metadata
# and by ignoring the authoritative Cloud revision when it still equals the local base revision.

provider = Path('src/cloud/OnlineCloudProviderV2.tsx')
s = provider.read_text()

old_import = """  preserveInstallationLocalFields,\n  withUpdatedBase\n} from './onlineCloudSync';"""
new_import = """  preserveInstallationLocalFields,\n  withUpdatedBase,\n  PORTABLE_FINGERPRINT_SCHEMA\n} from './onlineCloudSync';"""
if old_import not in s and 'PORTABLE_FINGERPRINT_SCHEMA' not in s.split("from './onlineCloudSync';", 1)[0]:
    raise SystemExit('Provider import anchor not found')
if old_import in s:
    s = s.replace(old_import, new_import, 1)

if 'const FINGERPRINT_SCHEMA = 5;' in s:
    s = s.replace('const FINGERPRINT_SCHEMA = 5;', 'const FINGERPRINT_SCHEMA = PORTABLE_FINGERPRINT_SCHEMA;', 1)
elif 'const FINGERPRINT_SCHEMA = PORTABLE_FINGERPRINT_SCHEMA;' not in s:
    raise SystemExit('Provider fingerprint schema constant anchor not found')

old_schema = """    const stored = text(cloud.baseFingerprint);\n    const schema = Number(cloud.fingerprintSchema || 0);\n    if (stored && schema === FINGERPRINT_SCHEMA) return stored;"""
new_schema = """    const stored = text(cloud.baseFingerprint);\n    const schema = Number(cloud.fingerprintContentSchema || cloud.fingerprintSchema || 0);\n    if (stored && schema === PORTABLE_FINGERPRINT_SCHEMA) return stored;"""
if old_schema not in s and 'cloud.fingerprintContentSchema || cloud.fingerprintSchema' not in s:
    raise SystemExit('Provider base-fingerprint schema anchor not found')
if old_schema in s:
    s = s.replace(old_schema, new_schema, 1)

# Automatic-sync block uses braces around the equality fallback.
auto_old = """      let baseFingerprint = await resolveBaseFingerprint(seeded, remote.id);\n      if (!baseFingerprint) {\n        if (localFingerprint === cloud.fingerprint) {"""
auto_new = """      const baseRevision = Number((seeded as any)?.cloud?.baseRevision || 0);\n      let baseFingerprint = await resolveBaseFingerprint(seeded, remote.id);\n      // If Cloud is still on exactly the revision this client last synchronized,\n      // Cloud cannot have changed independently. Its current fingerprint is the\n      // authoritative common base even when an older client stored a fingerprint\n      // using a previous portable-content schema. This prevents a simple local\n      // title/venue/etc. edit from becoming a false two-sided conflict.\n      if (!baseFingerprint && baseRevision > 0 && cloud.revision === baseRevision) {\n        baseFingerprint = cloud.fingerprint;\n      }\n      if (!baseFingerprint) {\n        if (localFingerprint === cloud.fingerprint) {"""
if auto_old in s:
    s = s.replace(auto_old, auto_new, 1)
elif 'title/venue/etc. edit from becoming a false two-sided conflict' not in s:
    raise SystemExit('Provider automatic-sync base anchor not found')

# Pull block uses a one-line equality fallback.
pull_old = """        let baseFingerprint = await resolveBaseFingerprint(seeded, remote.id);\n        if (!baseFingerprint) {\n          if (localFingerprint === cloud.fingerprint) baseFingerprint = cloud.fingerprint;"""
pull_new = """        const baseRevision = Number((seeded as any)?.cloud?.baseRevision || 0);\n        let baseFingerprint = await resolveBaseFingerprint(seeded, remote.id);\n        if (!baseFingerprint && baseRevision > 0 && cloud.revision === baseRevision) {\n          baseFingerprint = cloud.fingerprint;\n        }\n        if (!baseFingerprint) {\n          if (localFingerprint === cloud.fingerprint) baseFingerprint = cloud.fingerprint;"""
if pull_old in s:
    s = s.replace(pull_old, pull_new, 1)
elif s.count('cloud.revision === baseRevision') < 2:
    raise SystemExit('Provider pull base anchor not found')

provider.write_text(s)

actions = Path('src/companion/companionCloudActions.ts')
a = actions.read_text()
old_action_import = """  preserveInstallationLocalFields,\n  stableStringify,\n  withUpdatedBase\n} from '../cloud/onlineCloudSync';"""
new_action_import = """  preserveInstallationLocalFields,\n  stableStringify,\n  withUpdatedBase,\n  PORTABLE_FINGERPRINT_SCHEMA\n} from '../cloud/onlineCloudSync';"""
if old_action_import in a:
    a = a.replace(old_action_import, new_action_import, 1)
elif 'PORTABLE_FINGERPRINT_SCHEMA' not in a.split("from '../cloud/onlineCloudSync';", 1)[0]:
    raise SystemExit('Companion actions import anchor not found')

old_action_base = """  let baseFingerprint = text(local?.cloud?.baseFingerprint);\n  const baseRevision = Number(local?.cloud?.baseRevision || 0);\n  if (!baseFingerprint && baseRevision > 0) {"""
new_action_base = """  const baseRevision = Number(local?.cloud?.baseRevision || 0);\n  const baseSchema = Number(local?.cloud?.fingerprintContentSchema || local?.cloud?.fingerprintSchema || 0);\n  let baseFingerprint = baseSchema === PORTABLE_FINGERPRINT_SCHEMA ? text(local?.cloud?.baseFingerprint) : '';\n  // Same remote revision as our base means the remote side has not changed.\n  // Reconstruct the common base from the authoritative current Cloud payload\n  // instead of treating stale fingerprint-schema metadata as a conflict.\n  if (!baseFingerprint && baseRevision > 0 && revision === baseRevision) {\n    baseFingerprint = remoteFingerprint;\n  }\n  if (!baseFingerprint && baseRevision > 0) {"""
count = a.count(old_action_base)
if count not in (0, 2):
    raise SystemExit(f'Expected 2 companion base blocks, found {count}')
if count == 2:
    a = a.replace(old_action_base, new_action_base)
elif a.count('baseSchema === PORTABLE_FINGERPRINT_SCHEMA') < 2:
    raise SystemExit('Companion base blocks were not patched')

old_local_only = """  if (decision === 'local-only') {\n    // A Pull command must never upload Web changes.\n    return { kind: 'local-only', revision };\n  }"""
new_local_only = """  if (decision === 'local-only') {\n    // A Pull command must never upload Web changes. If an earlier false-positive\n    // conflict flag is still latched in the provider, re-enter its pull-only path\n    // so it can clear that UI state. The provider's local-only branch performs no PUT.\n    if (cloud?.conflict) await cloud.pullChanges(local);\n    return { kind: 'local-only', revision };\n  }"""
if old_local_only in a:
    a = a.replace(old_local_only, new_local_only, 1)
elif 'if (cloud?.conflict) await cloud.pullChanges(local);' not in a:
    raise SystemExit('Companion local-only pull anchor not found')

actions.write_text(a)

test = Path('src/cloud/tests/runCompanionSyncContractTests.ts')
t = test.read_text()
insert_anchor = """const actions = readFileSync(resolve(process.cwd(), 'src/companion/companionCloudActions.ts'), 'utf8');\n"""
insert = insert_anchor + """const provider = readFileSync(resolve(process.cwd(), 'src/cloud/OnlineCloudProviderV2.tsx'), 'utf8');\n"""
if "const provider = readFileSync(resolve(process.cwd(), 'src/cloud/OnlineCloudProviderV2.tsx')" not in t:
    if insert_anchor not in t:
        raise SystemExit('Companion sync test source anchor not found')
    t = t.replace(insert_anchor, insert, 1)

assert_anchor = """assert.match(actions, /resolveConflict: \\(tournament: Tournament\\) => smartPullChanges/);\n"""
assertions = assert_anchor + """assert.match(provider, /const FINGERPRINT_SCHEMA = PORTABLE_FINGERPRINT_SCHEMA;/, 'Provider fingerprint schema must track the portable-content fingerprint schema.');\nassert.match(provider, /cloud\\.fingerprintContentSchema \\|\\| cloud\\.fingerprintSchema/, 'Provider must reject stale base fingerprints from older content schemas.');\nassert.ok((provider.match(/cloud\\.revision === baseRevision/g) || []).length >= 2, 'Automatic sync and Pull must use revision equality to avoid false two-sided conflicts.');\nassert.match(actions, /revision === baseRevision[\\s\\S]*baseFingerprint = remoteFingerprint/, 'Directional Pull/status must use revision equality to recover the common base after a fingerprint-schema upgrade.');\nassert.match(actions, /if \\(cloud\\?\\.conflict\\) await cloud\\.pullChanges\\(local\\);/, 'A stale false-positive conflict flag must be clearable through the pull-only provider path without uploading local edits.');\n"""
if 'Provider fingerprint schema must track the portable-content fingerprint schema.' not in t:
    if assert_anchor not in t:
        raise SystemExit('Companion sync test assertion anchor not found')
    t = t.replace(assert_anchor, assertions, 1)

test.write_text(t)
