#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROVIDER = ROOT / 'src/cloud/OnlineCloudProviderV2.tsx'
SYNC = ROOT / 'src/cloud/onlineCloudSync.ts'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one anchor, found {count}')
    return text.replace(old, new, 1)


provider = PROVIDER.read_text(encoding='utf-8')
provider = replace_once(
    provider,
    "import { createCleanTournament, importTournamentFile } from '../importers/tournamentFileImport';\n",
    "import { createCleanTournament, importTournamentFile } from '../importers/tournamentFileImport';\n"
    "import {\n"
    "  bindOwnedCloudIdentity,\n"
    "  existingStableInternalId,\n"
    "  resolveOwnedCloudTournament\n"
    "} from './cloudTournamentIdentity';\n",
    'identity import'
)

provider = replace_once(
    provider,
    """  function chooseExistingRemote(tournament: Tournament | any, list = cloudTournaments) {\n    const cloudId = text(tournament?.cloud?.cloudTournamentId);\n    if (cloudId) {\n      const byId = list.find(item => item.id === cloudId);\n      if (byId) return byId;\n    }\n    const internalId = chooseInternalTournamentId(tournament);\n    return list.find(item => text(item.localKey) === internalId) || null;\n  }\n""",
    """  function chooseExistingRemote(tournament: Tournament | any, list = cloudTournaments) {\n    // beta79_unified_identity_v1 — only the authenticated organizer-owned list\n    // may resolve a private tournament. Name/revision/active UI state are never identity.\n    return resolveOwnedCloudTournament(tournament, list);\n  }\n""",
    'chooseExistingRemote'
)

provider = replace_once(
    provider,
    """  async function ensureCloudLink(tournament: Tournament) {\n    let list = cloudTournaments;\n    let remote = chooseExistingRemote(tournament, list) || activeRef.current;\n    if (remote) return remote;\n\n    list = await refreshWorkspace();\n    remote = chooseExistingRemote(tournament, list);\n    if (remote) {\n      setActiveCloud(remote);\n      activeRef.current = remote;\n      return remote;\n    }\n\n    const internalId = chooseInternalTournamentId(tournament);\n    const created = await cloudApi.createTournament(tokenRef.current, {\n      localKey: internalId,\n      name: tournamentName(tournament),\n      deviceId: browserDevice().id,\n      deviceLabel: browserDevice().label\n    });\n    remote = created?.tournament;\n    if (!remote?.id) throw new Error('Cloud Workspace did not return a tournament ID.');\n    setCloudTournaments(current => [remote!, ...current.filter(item => item.id !== remote!.id)]);\n    setActiveCloud(remote);\n    activeRef.current = remote;\n    log(`Created private Cloud Workspace link ${remote.id}.`);\n    return remote;\n  }\n""",
    """  async function ensureCloudLink(tournament: Tournament) {\n    // beta79_unified_identity_v1 — activeRef is presentation state, never tournament identity.\n    // Before CREATE, resolve against the authoritative organizer-owned list, refresh it once,\n    // then rely on the server UNIQUE(organizer_id, local_key) gate for concurrent creates.\n    let list = cloudTournaments;\n    let remote = chooseExistingRemote(tournament, list);\n    if (remote) return remote;\n\n    list = await refreshWorkspace();\n    remote = chooseExistingRemote(tournament, list);\n    if (remote) {\n      setActiveCloud(remote);\n      activeRef.current = remote;\n      return remote;\n    }\n\n    const internalId = existingStableInternalId(tournament) || chooseInternalTournamentId(tournament);\n    const device = browserDevice();\n    const created = await cloudApi.createTournament(tokenRef.current, {\n      localKey: internalId,\n      name: tournamentName(tournament),\n      deviceId: device.id,\n      deviceLabel: device.label\n    });\n    remote = created?.tournament;\n    if (!remote?.id) throw new Error('Cloud Workspace did not return a tournament ID.');\n    setCloudTournaments(current => [remote!, ...current.filter(item => item.id !== remote!.id)]);\n    setActiveCloud(remote);\n    activeRef.current = remote;\n    log(`${created?.created === false ? 'Reused' : 'Created'} private Cloud Workspace link ${remote.id}.`);\n    return remote;\n  }\n""",
    'ensureCloudLink'
)

provider = replace_once(
    provider,
    """      const seeded = ensureLocalIdentity(local, {\n        internalIdCandidates: [(local as any)?.online?.hubTournamentId]\n      });\n      commitLocal(seeded, false);\n      const localFingerprint = await fingerprintTournament(seeded);\n      const remote = await ensureCloudLink(seeded);\n      const cloud = await getCloudState(remote);\n""",
    """      let seeded = ensureLocalIdentity(local, {\n        internalIdCandidates: [(local as any)?.online?.hubTournamentId]\n      });\n      commitLocal(seeded, false);\n      const remote = await ensureCloudLink(seeded);\n      seeded = bindOwnedCloudIdentity(seeded, remote);\n      commitLocal(seeded, false);\n      const localFingerprint = await fingerprintTournament(seeded);\n      const cloud = await getCloudState(remote);\n""",
    'safeAutomaticSync binding'
)

provider = replace_once(
    provider,
    """        const seeded = ensureLocalIdentity(current, {\n          internalIdCandidates: [(current as any)?.online?.hubTournamentId]\n        });\n        commitLocal(seeded, false);\n        const localFingerprint = await fingerprintTournament(seeded);\n        const remote = await ensureCloudLink(seeded);\n        const cloud = await getCloudState(remote);\n""",
    """        let seeded = ensureLocalIdentity(current, {\n          internalIdCandidates: [(current as any)?.online?.hubTournamentId]\n        });\n        commitLocal(seeded, false);\n        const remote = await ensureCloudLink(seeded);\n        seeded = bindOwnedCloudIdentity(seeded, remote);\n        commitLocal(seeded, false);\n        const localFingerprint = await fingerprintTournament(seeded);\n        const cloud = await getCloudState(remote);\n""",
    'pull binding'
)

provider = replace_once(
    provider,
    """  async function continueWithLocal() {\n    const local = readLocalTournament();\n    if (!local) {\n      setStatus('No local tournament is available.');\n      setStatusKind('warn');\n      return;\n    }\n    const remote = chooseExistingRemote(local);\n    const identity: any = ensureLocalIdentity(local, {\n      internalIdCandidates: [remote?.localKey, remote?.id],\n      cloudTournamentId: remote?.id\n    });\n    identity.cloud = { ...(identity.cloud || {}), schemaVersion: 4, autoBackup: true };\n    setActiveCloud(remote);\n    activeRef.current = remote;\n    setConflict(false);\n    conflictRef.current = false;\n    setRemoteChangesAvailable(false);\n    setCloudDirty(true);\n    commitLocal(identity, true);\n    setPhase('app');\n    phaseRef.current = 'app';\n    setStatus(remote ? `Cloud linked · r${Number(remote.revision || 0)} · syncing…` : 'Local tournament · creating Cloud link…');\n    setStatusKind('busy');\n    coordinatorRef.current.schedule(() => safeAutomaticSync(), 50);\n  }\n""",
    """  async function continueWithLocal() {\n    const local = readLocalTournament();\n    if (!local) {\n      setStatus('No local tournament is available.');\n      setStatusKind('warn');\n      return;\n    }\n    const remote = chooseExistingRemote(local);\n    let identity: any = ensureLocalIdentity(local);\n    if (remote) identity = bindOwnedCloudIdentity(identity, remote);\n    identity.cloud = { ...(identity.cloud || {}), schemaVersion: 4, autoBackup: true };\n    setActiveCloud(remote);\n    activeRef.current = remote;\n    setConflict(false);\n    conflictRef.current = false;\n    setRemoteChangesAvailable(false);\n    setCloudDirty(true);\n    commitLocal(identity, true);\n    setPhase('app');\n    phaseRef.current = 'app';\n    setStatus(remote ? `Cloud linked · r${Number(remote.revision || 0)} · checking unified sync…` : 'Local tournament · checking Cloud identity…');\n    setStatusKind('busy');\n    coordinatorRef.current.schedule(() => safeAutomaticSync(), 50);\n  }\n""",
    'continueWithLocal'
)

provider = replace_once(
    provider,
    """  async function createPrivateTournamentAndOpen(seed: Tournament, sourceLabel: string) {\n    await runQueued(sourceLabel, async () => {\n      setStatus(`${sourceLabel} · creating private Cloud record…`);\n      setStatusKind('busy');\n      setConflict(false);\n      conflictRef.current = false;\n      setRemoteChangesAvailable(false);\n      setCloudDirty(false);\n\n      // Create/Import is intentionally a NEW identity. Never adopt the currently\n      // open browser tournament, an existing Hub id, or a same-name Cloud record.\n      const clean: any = clone(seed);\n      delete clean.cloud;\n      delete clean.online;\n      delete clean.hub;\n      const seeded: any = ensureLocalIdentity(clean);\n      const internalId = chooseInternalTournamentId(seeded);\n      const device = browserDevice();\n      const created = await cloudApi.createTournament(tokenRef.current, {\n        localKey: internalId,\n        name: tournamentName(seeded),\n        deviceId: device.id,\n        deviceLabel: device.label\n      });\n      const remote = created?.tournament as CloudTournamentMeta | undefined;\n      if (!remote?.id) throw new Error('Cloud Workspace did not return a tournament ID for the new tournament.');\n\n      const fingerprint = await fingerprintTournament(seeded);\n      const saved = await cloudApi.putSnapshot(\n        tokenRef.current,\n        remote.id,\n        0,\n        buildPrivateSnapshot(tournamentName(seeded), seeded),\n        device\n      );\n      const revision = Number(saved?.revision || 1);\n      const updated = withBrowserBase(seeded, remote.id, revision, fingerprint);\n      commitLocal(updated, true);\n      setActiveCloud({ ...remote, revision });\n      activeRef.current = { ...remote, revision };\n      setCloudTournaments(current => [{ ...remote, revision }, ...current.filter(item => item.id !== remote.id)]);\n      setLastSyncAt(updated.cloud?.lastSyncAt || '');\n      setPublicState(null);\n      setPhase('app');\n      phaseRef.current = 'app';\n      setStatus(`${sourceLabel} · private Cloud r${revision} · ready in Desktop`);\n      setStatusKind('ok');\n      log(`${sourceLabel}: created ${remote.id} at private Cloud revision ${revision}.`);\n    }, true);\n  }\n""",
    """  async function createPrivateTournamentAndOpen(\n    seed: Tournament,\n    sourceLabel: string,\n    options: { preserveStableIdentity?: boolean } = {}\n  ) {\n    await runQueued(sourceLabel, async () => {\n      setStatus(`${sourceLabel} · checking private Cloud identity…`);\n      setStatusKind('busy');\n      setConflict(false);\n      conflictRef.current = false;\n      setRemoteChangesAvailable(false);\n      setCloudDirty(true);\n\n      const clean: any = clone(seed);\n      if (options.preserveStableIdentity) {\n        // Imported TUNX/TRF continuation may already carry a stable private identity.\n        // Keep sync-base metadata, but never keep installation-local localKey or Public Hub linkage.\n        const importedCloud = clean.cloud && typeof clean.cloud === 'object' ? { ...clean.cloud } : {};\n        delete importedCloud.localKey;\n        delete importedCloud.autoBackup;\n        clean.cloud = importedCloud;\n        delete clean.online;\n        delete clean.hub;\n        delete clean.publication;\n      } else {\n        // A user-requested New tournament is a genuinely new identity.\n        delete clean.cloud;\n        delete clean.online;\n        delete clean.hub;\n        delete clean.publication;\n      }\n\n      let seeded: any = ensureLocalIdentity(clean);\n      const list = await refreshWorkspace();\n      let remote = chooseExistingRemote(seeded, list);\n      if (!remote) {\n        const internalId = existingStableInternalId(seeded) || chooseInternalTournamentId(seeded);\n        const device = browserDevice();\n        const created = await cloudApi.createTournament(tokenRef.current, {\n          localKey: internalId,\n          name: tournamentName(seeded),\n          deviceId: device.id,\n          deviceLabel: device.label\n        });\n        remote = created?.tournament as CloudTournamentMeta | undefined;\n        if (!remote?.id) throw new Error('Cloud Workspace did not return a tournament ID for the tournament.');\n        setCloudTournaments(current => [remote!, ...current.filter(item => item.id !== remote!.id)]);\n        log(`${sourceLabel}: ${created?.created === false ? 'reused' : 'created'} ${remote.id}.`);\n      } else {\n        log(`${sourceLabel}: linked to existing Organizer Cloud tournament ${remote.id}.`);\n      }\n\n      seeded = bindOwnedCloudIdentity(seeded, remote);\n      seeded.cloud = { ...(seeded.cloud || {}), schemaVersion: 4, autoBackup: true };\n      commitLocal(seeded, true);\n      setActiveCloud(remote);\n      activeRef.current = remote;\n      setPublicState(null);\n      setPhase('app');\n      phaseRef.current = 'app';\n      setStatus(`${sourceLabel} · Cloud identity linked · running unified sync…`);\n      setStatusKind('busy');\n\n      // Do not invent a special create/upload workflow. The same automatic sync\n      // path handles r0 creation, remote-only/local-only changes and conflicts.\n      coordinatorRef.current.schedule(() => safeAutomaticSync(), 50);\n    }, true);\n  }\n""",
    'createPrivateTournamentAndOpen'
)

provider = replace_once(
    provider,
    "await createPrivateTournamentAndOpen(imported.tournament, `Imported ${imported.kind.toUpperCase()} · ${imported.playerCount} players`);",
    "await createPrivateTournamentAndOpen(imported.tournament, `Imported ${imported.kind.toUpperCase()} · ${imported.playerCount} players`, { preserveStableIdentity: true });",
    'import preserve identity'
)

provider = replace_once(
    provider,
    """        if (!text(tournament.cloud?.internalId) || String(tournament.cloud.internalId).startsWith('tournament:')) {\n          tournament.cloud = { ...(tournament.cloud || {}), internalId: hub.id };\n        }\n""",
    """        // Public Hub identity is publication metadata only. Never rewrite the\n        // stable private Cloud internalId when a tournament is published.\n""",
    'Hub/private identity separation'
)

if '|| activeRef.current' in provider:
    raise SystemExit('provider still uses activeRef as identity fallback')
if 'internalId: hub.id' in provider:
    raise SystemExit('provider still rewrites private internalId from Hub')
if 'preserveStableIdentity: true' not in provider:
    raise SystemExit('import path does not preserve stable identity')
if 'resolveOwnedCloudTournament' not in provider or 'bindOwnedCloudIdentity' not in provider:
    raise SystemExit('authoritative identity helpers are not wired')

PROVIDER.write_text(provider, encoding='utf-8')

sync = SYNC.read_text(encoding='utf-8')
sync = replace_once(
    sync,
    "clientVersion: 'chess-publisher-web-online-cloud-directional-v1'",
    "clientVersion: 'chess-publisher-web-beta79-unified-sync-compat-v1'",
    'private snapshot clientVersion'
)
SYNC.write_text(sync, encoding='utf-8')
print('BETA79_WEB_PROVIDER_PATCH=PASS')
