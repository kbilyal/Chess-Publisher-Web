from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one marker, found {count}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


# Player Registration: the visible sort preference becomes the persisted publication preference.
path = 'src/companion/CompanionRegistration.tsx'
replace_once(
    path,
    "import { getFideBrowserDatabaseInfo, searchFideBrowserDatabase } from './fideBrowserDatabase';",
    "import { getFideBrowserDatabaseInfo, searchFideBrowserDatabase } from './fideBrowserDatabase';\nimport { getPlayerPublicationOrder } from '../publication/playerPublicationOrder';"
)
replace_once(
    path,
    "type Notice = { kind: 'ok' | 'warn' | 'error'; text: string } | null;",
    "type Notice = { kind: 'ok' | 'warn' | 'error'; text: string } | null;\ntype RosterSortMode = 'starting' | 'rating' | 'name';"
)
replace_once(
    path,
    "  const [sortMode, setSortMode] = useState<'starting' | 'rating' | 'name'>('starting');",
    "  const sortMode: RosterSortMode = getPlayerPublicationOrder(tournament);"
)
replace_once(
    path,
    "  const commitTournament = (next: Tournament) => onUpdateTournament(() => next);",
    "  const commitTournament = (next: Tournament) => onUpdateTournament(() => next);\n\n  const handleSortModeChange = (mode: RosterSortMode) => {\n    onUpdateTournament(previous => ({\n      ...previous,\n      settings: { ...(previous.settings as any), playerPublicationOrder: mode } as any\n    }));\n  };"
)
replace_once(
    path,
    "            <span>Sort view</span>\n            <select value={sortMode} onChange={event => setSortMode(event.target.value as 'starting' | 'rating' | 'name')}>",
    "            <span>Sort & publish</span>\n            <select value={sortMode} onChange={event => handleSortModeChange(event.target.value as RosterSortMode)}>"
)
replace_once(
    path,
    "        <div className=\"companion-sort-note\">View only — sorting never changes official starting numbers or pairing numbers.</div>",
    "        <div className=\"companion-sort-note\">This order is also used for Chess-Results and Online Hub publication; sorting never changes official starting numbers or pairing numbers.</div>"
)

# Chess-Results: use a publication-only numbering map so XML player order and pairing references agree,
# without mutating the tournament's official pairingNumber fields.
path = 'src/chessResults/publication.ts'
replace_once(
    path,
    "import { BoardPairing, Tournament } from '../types';",
    "import { BoardPairing, Tournament } from '../types';\nimport { buildPublicationNumberMap, orderPlayersForPublication } from '../publication/playerPublicationOrder';"
)
replace_once(
    path,
    "  const playerByKey = new Map(tournament.players.map(player => [player.localKey, player]));\n  const pointsByKey = new Map(tournament.players.map(player => [player.localKey, 0]));",
    "  const playerByKey = new Map(tournament.players.map(player => [player.localKey, player]));\n  const pointsByKey = new Map(tournament.players.map(player => [player.localKey, 0]));\n  const orderedPlayers = orderPlayersForPublication(tournament);\n  const publicationNumberByKey = buildPublicationNumberMap(tournament);"
)
replace_once(
    path,
    "  const orderedPlayers = [...tournament.players].sort((a, b) => a.pairingNumber - b.pairingNumber);\n  orderedPlayers.forEach(player => {\n    const names = playerNameParts(player.name);\n    const internalId = /^\\d{1,12}$/.test(String(player.id || '')) ? player.id : player.pairingNumber;",
    "  orderedPlayers.forEach(player => {\n    const names = playerNameParts(player.name);\n    const publicationNumber = publicationNumberByKey.get(player.localKey) || player.pairingNumber;\n    const internalId = /^\\d{1,12}$/.test(String(player.id || '')) ? player.id : publicationNumber;"
)
replace_once(path, "      attr('no', player.pairingNumber),", "      attr('no', publicationNumber),")
replace_once(path, "      attr('rank', player.pairingNumber),", "      attr('rank', publicationNumber),")
replace_once(
    path,
    "        attr('round', round), attr('pairing', pairingNumber), attr('board', 1), attr('whiteno', white.pairingNumber),\n        attr('blackno', black?.pairingNumber || result.blackNo || -2), attr('reswhite', result.white), attr('resblack', result.black), attr('forfeit', result.forfeit)",
    "        attr('round', round), attr('pairing', pairingNumber), attr('board', 1), attr('whiteno', publicationNumberByKey.get(white.localKey) || white.pairingNumber),\n        attr('blackno', black ? (publicationNumberByKey.get(black.localKey) || black.pairingNumber) : (result.blackNo || -2)), attr('reswhite', result.white), attr('resblack', result.black), attr('forfeit', result.forfeit)"
)
replace_once(
    path,
    "        attr('round', round), attr('pairing', pairingNumber), attr('board', 1), attr('whiteno', player.pairingNumber),",
    "        attr('round', round), attr('pairing', pairingNumber), attr('board', 1), attr('whiteno', publicationNumberByKey.get(player.localKey) || player.pairingNumber),"
)

# Online Hub: preserve the same selected player order in the public snapshot.
path = 'src/cloud/publicHubSnapshot.ts'
replace_once(
    path,
    "import { chooseInternalTournamentId } from './onlineCloudSync';",
    "import { chooseInternalTournamentId } from './onlineCloudSync';\nimport { orderPlayersForPublication } from '../publication/playerPublicationOrder';"
)
replace_once(
    path,
    "  return (tournament?.players || []).map((player: any, index: number) => ({",
    "  return orderPlayersForPublication(tournament).map((player: any, index: number) => ({"
)

print('PUBLICATION_PLAYER_ORDER_PATCH=PASS')
