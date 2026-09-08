from pathlib import Path

# One-time production repair:
# 1) make same-field Desktop/Cloud vs Web conflicts explicitly resolvable;
# 2) expand federation list to the full FIDE member set;
# 3) render a real flag image in the Web Companion federation selector.

FEDERATIONS = r'''AFG|Afghanistan|AF
ALB|Albania|AL
ALG|Algeria|DZ
AND|Andorra|AD
ANG|Angola|AO
ANT|Antigua and Barbuda|AG
ARG|Argentina|AR
ARM|Armenia|AM
ARU|Aruba|AW
AUS|Australia|AU
AUT|Austria|AT
AZE|Azerbaijan|AZ
BAH|Bahamas|BS
BRN|Bahrain|BH
BAN|Bangladesh|BD
BAR|Barbados|BB
BLR|Belarus|BY
BEL|Belgium|BE
BIZ|Belize|BZ
BER|Bermuda|BM
BHU|Bhutan|BT
BOL|Bolivia|BO
BIH|Bosnia and Herzegovina|BA
BOT|Botswana|BW
BRA|Brazil|BR
IVB|British Virgin Islands|VG
BRU|Brunei Darussalam|BN
BUL|Bulgaria|BG
BUR|Burkina Faso|BF
BDI|Burundi|BI
CAM|Cambodia|KH
CMR|Cameroon|CM
CAN|Canada|CA
CPV|Cape Verde|CV
CAY|Cayman Islands|KY
CAF|Central African Republic|CF
CHA|Chad|TD
CHI|Chile|CL
CHN|China|CN
TPE|Chinese Taipei|TW
COL|Colombia|CO
COM|Comoros Islands|KM
CRC|Costa Rica|CR
CIV|Côte d’Ivoire|CI
CRO|Croatia|HR
CUB|Cuba|CU
CYP|Cyprus|CY
CZE|Czech Republic|CZ
COD|Democratic Republic of the Congo|CD
DEN|Denmark|DK
DJI|Djibouti|DJ
DMA|Dominica|DM
DOM|Dominican Republic|DO
ECU|Ecuador|EC
EGY|Egypt|EG
ESA|El Salvador|SV
ENG|England|gb-eng
GEQ|Equatorial Guinea|GQ
ERI|Eritrea|ER
EST|Estonia|EE
SWZ|Eswatini|SZ
ETH|Ethiopia|ET
FAI|Faroe Islands|FO
FIJ|Fiji|FJ
FIN|Finland|FI
FRA|France|FR
GAB|Gabon|GA
GAM|Gambia|GM
GEO|Georgia|GE
GER|Germany|DE
GHA|Ghana|GH
GRE|Greece|GR
GRN|Grenada|GD
GUM|Guam|GU
GUA|Guatemala|GT
GCI|Guernsey|GG
GUY|Guyana|GY
HAI|Haiti|HT
HON|Honduras|HN
HKG|Hong Kong, China|HK
HUN|Hungary|HU
ISL|Iceland|IS
IND|India|IN
INA|Indonesia|ID
IRI|Iran|IR
IRQ|Iraq|IQ
IRL|Ireland|IE
ISR|Israel|IL
ITA|Italy|IT
JAM|Jamaica|JM
JPN|Japan|JP
JCI|Jersey|JE
JOR|Jordan|JO
KAZ|Kazakhstan|KZ
KEN|Kenya|KE
KOS|Kosovo|XK
KUW|Kuwait|KW
KGZ|Kyrgyzstan|KG
LAO|Laos|LA
LAT|Latvia|LV
LBN|Lebanon|LB
LES|Lesotho|LS
LBR|Liberia|LR
LBA|Libya|LY
LIE|Liechtenstein|LI
LTU|Lithuania|LT
LUX|Luxembourg|LU
MAC|Macau, China|MO
MAD|Madagascar|MG
MAW|Malawi|MW
MAS|Malaysia|MY
MDV|Maldives|MV
MLI|Mali|ML
MLT|Malta|MT
MTN|Mauritania|MR
MRI|Mauritius|MU
MEX|Mexico|MX
MDA|Moldova|MD
MNC|Monaco|MC
MGL|Mongolia|MN
MNE|Montenegro|ME
MAR|Morocco|MA
MOZ|Mozambique|MZ
MYA|Myanmar|MM
NAM|Namibia|NA
NRU|Nauru|NR
NEP|Nepal|NP
NED|Netherlands|NL
AHO|Netherlands Antilles|CW
NZL|New Zealand|NZ
NCA|Nicaragua|NI
NIG|Niger|NE
NGR|Nigeria|NG
MKD|North Macedonia|MK
NOR|Norway|NO
OMA|Oman|OM
PAK|Pakistan|PK
PLW|Palau|PW
PLE|Palestine|PS
PAN|Panama|PA
PNG|Papua New Guinea|PG
PAR|Paraguay|PY
PER|Peru|PE
PHI|Philippines|PH
POL|Poland|PL
POR|Portugal|PT
PUR|Puerto Rico|PR
QAT|Qatar|QA
ROU|Romania|RO
RUS|Russia|RU
RWA|Rwanda|RW
SKN|Saint Kitts and Nevis|KN
LCA|Saint Lucia|LC
VIN|Saint Vincent and the Grenadines|VC
SMR|San Marino|SM
STP|Sao Tome and Principe|ST
KSA|Saudi Arabia|SA
SCO|Scotland|gb-sct
SEN|Senegal|SN
SRB|Serbia|RS
SEY|Seychelles|SC
SLE|Sierra Leone|SL
SGP|Singapore|SG
SVK|Slovakia|SK
SLO|Slovenia|SI
SOL|Solomon Islands|SB
SOM|Somalia|SO
RSA|South Africa|ZA
KOR|South Korea|KR
SSD|South Sudan|SS
ESP|Spain|ES
SRI|Sri Lanka|LK
SUD|Sudan|SD
SUR|Suriname|SR
SWE|Sweden|SE
SUI|Switzerland|CH
SYR|Syria|SY
TJK|Tajikistan|TJ
TAN|Tanzania|TZ
THA|Thailand|TH
TLS|Timor-Leste|TL
TOG|Togo|TG
TGA|Tonga|TO
TTO|Trinidad and Tobago|TT
TUN|Tunisia|TN
TUR|Türkiye|TR
TKM|Turkmenistan|TM
UGA|Uganda|UG
UKR|Ukraine|UA
UAE|United Arab Emirates|AE
USA|United States of America|US
URU|Uruguay|UY
ISV|US Virgin Islands|VI
UZB|Uzbekistan|UZ
VAN|Vanuatu|VU
VEN|Venezuela|VE
VIE|Vietnam|VN
WLS|Wales|gb-wls
YEM|Yemen|YE
ZAM|Zambia|ZM
ZIM|Zimbabwe|ZW
FID|FIDE|'''.splitlines()


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f'Anchor not found: {label}')
    return source.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Federation data + guaranteed real-image flag URL for Web Companion.
# ---------------------------------------------------------------------------
initial = Path('src/data/initialData.ts')
s = initial.read_text()
start = s.index('export const FEDERATIONS: [string, string, string][] = [')
end = s.index('\n\nexport function getFederationFlag', start)
rows = []
for line in FEDERATIONS:
    code, name, asset = line.split('|', 2)
    rows.append(f'  ["{code}", {name!r}, "{asset}"],')
block = 'export const FEDERATIONS: [string, string, string][] = [\n' + '\n'.join(rows).replace("'", '"') + '\n];'
s = s[:start] + block + s[end:]
old_flag = '''export function getFederationFlag(fed: string): string {
  const f = FEDERATIONS.find(x => x[0] === String(fed || '').toUpperCase());
  if (!f || !f[2]) return '🏁';
  try {
    return [...f[2]].map(c => String.fromCodePoint(127397 + c.charCodeAt(0))).join('');
  } catch {
    return '🏁';
  }
}'''
new_flag = '''export function getFederationFlag(fed: string): string {
  const f = FEDERATIONS.find(x => x[0] === String(fed || '').toUpperCase());
  const iso2 = String(f?.[2] || '');
  if (!/^[A-Z]{2}$/.test(iso2)) return '🏁';
  try {
    return [...iso2].map(c => String.fromCodePoint(127397 + c.charCodeAt(0))).join('');
  } catch {
    return '🏁';
  }
}

export function getFederationFlagUrl(fed: string): string {
  const f = FEDERATIONS.find(x => x[0] === String(fed || '').toUpperCase());
  const asset = String(f?.[2] || '').trim().toLowerCase();
  return asset ? `https://flagcdn.com/${asset}.svg` : '';
}'''
s = replace_once(s, old_flag, new_flag, 'federation flag helpers')
initial.write_text(s)


# ---------------------------------------------------------------------------
# Companion federation selector: native option text + real SVG flag image.
# ---------------------------------------------------------------------------
setup = Path('src/companion/CompanionSetup.tsx')
s = setup.read_text()
s = replace_once(
    s,
    "import { FEDERATIONS, TIME_CONTROLS, getFederationFlag } from '../data/initialData';",
    "import { FEDERATIONS, TIME_CONTROLS, getFederationFlagUrl } from '../data/initialData';",
    'CompanionSetup federation import'
)
s = replace_once(
    s,
    "  const isRoundRobin = settings.tournamentFormat === 'Individual Round Robin';",
    "  const isRoundRobin = settings.tournamentFormat === 'Individual Round Robin';\n  const federationFlagUrl = getFederationFlagUrl(settings.country);",
    'CompanionSetup selected federation flag'
)
old_select = '''          <label><span>Federation *</span><select value={settings.country || 'BUL'} onChange={event => updateSetting('country', event.target.value)}>{FEDERATIONS.map(([code, name]) => <option key={code} value={code}>{getFederationFlag(code)} {code} — {name}</option>)}</select></label>'''
new_select = '''          <label><span>Federation *</span><div style={{ position: 'relative', width: '100%' }}>
            {federationFlagUrl && <img src={federationFlagUrl} alt="" aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 24, height: 18, objectFit: 'cover', borderRadius: 2, zIndex: 1, pointerEvents: 'none', boxShadow: '0 0 0 1px rgba(15,23,42,.12)' }} onError={event => { event.currentTarget.style.display = 'none'; }} />}
            <select style={{ width: '100%', ...(federationFlagUrl ? { paddingLeft: 46 } : {}) }} value={settings.country || 'BUL'} onChange={event => updateSetting('country', event.target.value)}>
              {FEDERATIONS.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
            </select>
          </div></label>'''
s = replace_once(s, old_select, new_select, 'CompanionSetup federation select')
setup.write_text(s)


# ---------------------------------------------------------------------------
# Conflict merge: preserve fail-closed default, but allow explicit Web/Cloud
# winner for same-field conflicts. Non-overlapping fields are always merged.
# ---------------------------------------------------------------------------
actions = Path('src/companion/companionCloudActions.ts')
a = actions.read_text()
a = replace_once(
    a,
    "type MergeResult = {\n  merged: Tournament;\n  conflicts: string[];\n};",
    "type MergeResult = {\n  merged: Tournament;\n  conflicts: string[];\n};\n\ntype ConflictPreference = 'local' | 'remote';",
    'ConflictPreference type'
)
a = replace_once(
    a,
    "  path: string,\n  conflicts: string[]\n): any | Missing {",
    "  path: string,\n  conflicts: string[],\n  preference?: ConflictPreference\n): any | Missing {",
    'mergeNode preference parameter'
)
a = replace_once(
    a,
    "        nextPath,\n        conflicts\n      );",
    "        nextPath,\n        conflicts,\n        preference\n      );",
    'mergeNode recursive preference'
)
a = replace_once(
    a,
    "  conflicts.push(path || 'tournament');\n  return copyValue(local);\n}",
    "  conflicts.push(path || 'tournament');\n  return copyValue(preference === 'remote' ? remote : local);\n}",
    'mergeNode explicit preference'
)
a = replace_once(
    a,
    "  localTournament: Tournament,\n  remoteTournament: Tournament\n): MergeResult {",
    "  localTournament: Tournament,\n  remoteTournament: Tournament,\n  preference?: ConflictPreference\n): MergeResult {",
    'mergeCompanionTournamentChanges preference parameter'
)
a = replace_once(
    a,
    "    portableForMerge(remoteTournament),\n    '',\n    conflicts\n  );",
    "    portableForMerge(remoteTournament),\n    '',\n    conflicts,\n    preference\n  );",
    'mergeCompanionTournamentChanges preference pass-through'
)
smart_start = a.index('async function smartPullChanges(')
smart_end = a.index('\n\nasync function syncNowConfirmed', smart_start)
new_smart = '''async function smartPullChanges(
  cloud: any,
  tournament: Tournament,
  strategy: 'safe' | 'web' | 'cloud' = 'safe'
) {
  if (!cloud?.conflict) {
    await cloud.pullChanges(tournament);
    return { kind: 'not-conflicted', conflicts: [], revision: Number(cloud?.activeCloud?.revision || 0) };
  }

  const local = readLocalTournament() || tournament;
  const remote = cloud.activeCloud;
  const token = text(cloud.token);
  const baseRevision = Number((local as any)?.cloud?.baseRevision || 0);
  if (!token || !remote?.id || baseRevision <= 0) {
    await cloud.pullChanges(tournament);
    return { kind: 'conflict', conflicts: [], revision: Number(remote?.revision || 0) };
  }

  try {
    const [baseResult, currentResult] = await Promise.all([
      cloudApi.getRevisionSnapshot(token, remote.id, baseRevision),
      cloudApi.getSnapshot(token, remote.id)
    ]);
    const base = extractPrivateTournament(baseResult?.snapshot, tournamentName(local)).tournament;
    const current = extractPrivateTournament(currentResult?.snapshot, remote.name || tournamentName(local)).tournament;
    const currentRevision = Number(currentResult?.tournament?.revision || remote.revision || 0);
    if (currentRevision <= 0) {
      await cloud.pullChanges(tournament);
      return { kind: 'conflict', conflicts: [], revision: 0 };
    }

    const preference: ConflictPreference | undefined = strategy === 'web'
      ? 'local'
      : strategy === 'cloud'
        ? 'remote'
        : undefined;
    const merge = mergeCompanionTournamentChanges(base, local, current, preference);

    // Default Resolve remains fail-closed: same-field conflicts require an explicit
    // user choice. This prevents a silent winner while still making the conflict solvable.
    if (merge.conflicts.length && strategy === 'safe') {
      return { kind: 'needs-choice', conflicts: merge.conflicts, revision: currentRevision };
    }

    const currentFingerprint = await fingerprintTournament(current);
    const hydrated = preserveInstallationLocalFields(merge.merged, local, {
      cloudTournamentId: remote.id,
      baseRevision: currentRevision,
      baseFingerprint: currentFingerprint
    });
    localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(hydrated));

    // Re-enter the provider only through Pull. With the freshly established base,
    // the merged copy is local-only, so this clears the conflict latch without PUT.
    // Push remains an explicit action after resolution.
    await cloud.pullChanges(hydrated);
    return {
      kind: 'resolved',
      conflicts: merge.conflicts,
      revision: currentRevision,
      preference: strategy
    };
  } catch (error) {
    if (strategy !== 'safe') throw error;
    await cloud.pullChanges(tournament);
    return { kind: 'conflict', conflicts: [], revision: Number(remote?.revision || 0) };
  }
}'''
a = a[:smart_start] + new_smart + a[smart_end:]
a = replace_once(
    a,
    "    resolveConflict: (tournament: Tournament) => smartPullChanges(cloud, tournament),",
    "    resolveConflict: (tournament: Tournament, strategy: 'safe' | 'web' | 'cloud' = 'safe') => smartPullChanges(cloud, tournament, strategy),",
    'Companion facade conflict strategy'
)
actions.write_text(a)


# ---------------------------------------------------------------------------
# Companion UI: first attempt safe merge, then explicit winner buttons only if
# the remaining conflicts are genuinely same-field.
# ---------------------------------------------------------------------------
workspace = Path('src/companion/CompanionWorkspace.tsx')
w = workspace.read_text()
w = replace_once(
    w,
    "  resolveConflict: (tournament: Tournament) => Promise<any>;",
    "  resolveConflict: (tournament: Tournament, strategy?: 'safe' | 'web' | 'cloud') => Promise<any>;",
    'CompanionCloud resolve signature'
)
w = replace_once(
    w,
    "  const [sourceMismatchTnr, setSourceMismatchTnr] = useState('');",
    "  const [sourceMismatchTnr, setSourceMismatchTnr] = useState('');\n  const [pendingConflictFields, setPendingConflictFields] = useState<string[]>([]);",
    'pending same-field conflict state'
)
w = replace_once(
    w,
    "  useEffect(() => { tournamentRef.current = tournament; }, [tournament]);",
    "  useEffect(() => { tournamentRef.current = tournament; }, [tournament]);\n  useEffect(() => { if (!cloud.conflict) setPendingConflictFields([]); }, [cloud.conflict]);",
    'clear conflict choices after provider resolves'
)
resolver_start = w.index('  const resolveSyncConflict = async () => {')
resolver_end = w.index('\n\n  const publishHub = async () => {', resolver_start)
new_resolver = '''  const resolveSyncConflict = async (strategy: 'safe' | 'web' | 'cloud' = 'safe') => {
    setBusy('pull');
    setMessage('');
    try {
      const result = await cloud.resolveConflict(tournamentRef.current, strategy);
      adoptSynchronizedTournament();
      if (result?.kind === 'needs-choice') {
        const fields = Array.isArray(result.conflicts) ? result.conflicts : [];
        setPendingConflictFields(fields);
        const preview = fields.slice(0, 4).join(', ');
        const more = fields.length > 4 ? ` +${fields.length - 4} more` : '';
        setNotice('warn', `Same-field conflict${fields.length === 1 ? '' : 's'}: ${preview}${more}. Choose Keep Web or Use Cloud for the overlapping fields.`);
        return;
      }
      if (result?.kind === 'resolved' || result?.kind === 'not-conflicted') {
        setPendingConflictFields([]);
        if (strategy === 'web') {
          setNotice('ok', 'Conflict resolved. Web values were kept for overlapping fields and Cloud-only changes were merged. Push Web → Cloud when ready.');
        } else if (strategy === 'cloud') {
          setNotice('ok', 'Conflict resolved. Cloud values were kept for overlapping fields and Web-only changes were merged. Push Web → Cloud when ready.');
        } else {
          setNotice('ok', 'Conflict resolved safely. The merged tournament is ready; Push Web → Cloud when ready.');
        }
        return;
      }
      setNotice('warn', 'Conflict is still protected because a common base could not be proven. Nothing was overwritten.');
    } catch (error: any) {
      setNotice('error', error?.message || 'Could not resolve the synchronization conflict safely.');
    } finally {
      setBusy(null);
    }
  };'''
w = w[:resolver_start] + new_resolver + w[resolver_end:]
old_banner = '''        {cloud.conflict && (
          <div className="companion-alert warn companion-conflict-alert">
            <WifiOff size={18} />
            <div className="companion-conflict-copy">
              <strong>Desktop/Cloud and Web both changed this tournament.</strong>
              <span>Pull and Push are blocked from overwriting either side. Resolve conflict merges only non-overlapping fields; same-field conflicts remain protected.</span>
            </div>
            <button type="button" className="companion-button secondary companion-conflict-action" onClick={resolveSyncConflict} disabled={busy !== null || cloud.busy}>
              <RefreshCw size={16} className={busy === 'pull' ? 'spin' : ''} /> {busy === 'pull' ? 'Resolving…' : 'Resolve conflict'}
            </button>
          </div>
        )}'''
new_banner = '''        {cloud.conflict && (
          <div className="companion-alert warn companion-conflict-alert">
            <WifiOff size={18} />
            <div className="companion-conflict-copy">
              <strong>Desktop/Cloud and Web both changed this tournament.</strong>
              <span>{pendingConflictFields.length > 0
                ? `Same-field conflicts: ${pendingConflictFields.slice(0, 4).join(', ')}${pendingConflictFields.length > 4 ? ` +${pendingConflictFields.length - 4} more` : ''}. Choose which side wins only for these overlapping fields.`
                : 'Pull and Push are blocked from overwriting either side. Resolve conflict first merges all non-overlapping fields and asks for a side only when the same field changed on both sides.'}</span>
            </div>
            {pendingConflictFields.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="companion-button secondary companion-conflict-action" onClick={() => void resolveSyncConflict('web')} disabled={busy !== null || cloud.busy} title="Keep Web values only for same-field conflicts">
                  <RefreshCw size={16} className={busy === 'pull' ? 'spin' : ''} /> Keep Web
                </button>
                <button type="button" className="companion-button secondary companion-conflict-action" onClick={() => void resolveSyncConflict('cloud')} disabled={busy !== null || cloud.busy} title="Keep Cloud values only for same-field conflicts">
                  <Cloud size={16} /> Use Cloud
                </button>
              </div>
            ) : (
              <button type="button" className="companion-button secondary companion-conflict-action" onClick={() => void resolveSyncConflict('safe')} disabled={busy !== null || cloud.busy}>
                <RefreshCw size={16} className={busy === 'pull' ? 'spin' : ''} /> {busy === 'pull' ? 'Resolving…' : 'Resolve conflict'}
              </button>
            )}
          </div>
        )}'''
w = replace_once(w, old_banner, new_banner, 'Companion conflict banner')
workspace.write_text(w)


# ---------------------------------------------------------------------------
# Permanent regression: same-field choice must be explicit and deterministic.
# ---------------------------------------------------------------------------
merge_test = Path('src/cloud/tests/runCompanionConflictMergeTests.ts')
t = merge_test.read_text()
anchor = '''function testPlayerRosterConflictIsNotGuessed() {'''
new_test = '''function testExplicitSameFieldChoiceIsDeterministic() {
  const base = baseTournament();
  const web = clone(base);
  const desktop = clone(base);

  web.settings.venue = 'Web venue';
  desktop.settings.venue = 'Cloud venue';
  web.settings.city = 'Web-only city';
  desktop.settings.chiefArbiter = 'Cloud-only arbiter';

  const keepWeb = mergeCompanionTournamentChanges(base, web, desktop, 'local');
  assert.ok(keepWeb.conflicts.includes('settings.venue'));
  assert.equal(keepWeb.merged.settings.venue, 'Web venue');
  assert.equal(keepWeb.merged.settings.city, 'Web-only city');
  assert.equal(keepWeb.merged.settings.chiefArbiter, 'Cloud-only arbiter');

  const useCloud = mergeCompanionTournamentChanges(base, web, desktop, 'remote');
  assert.ok(useCloud.conflicts.includes('settings.venue'));
  assert.equal(useCloud.merged.settings.venue, 'Cloud venue');
  assert.equal(useCloud.merged.settings.city, 'Web-only city');
  assert.equal(useCloud.merged.settings.chiefArbiter, 'Cloud-only arbiter');
}

'''+anchor
t = replace_once(t, anchor, new_test, 'explicit same-field choice test')
t = replace_once(
    t,
    "  testSameFieldConflictFailsClosed();\n  testPlayerRosterConflictIsNotGuessed();",
    "  testSameFieldConflictFailsClosed();\n  testExplicitSameFieldChoiceIsDeterministic();\n  testPlayerRosterConflictIsNotGuessed();",
    'run explicit choice regression'
)
merge_test.write_text(t)


sync_test = Path('src/cloud/tests/runCompanionSyncContractTests.ts')
t = sync_test.read_text()
t = replace_once(
    t,
    "import { buildPrivateSnapshot, extractPrivateTournament } from '../onlineCloudSync';",
    "import { buildPrivateSnapshot, extractPrivateTournament } from '../onlineCloudSync';\nimport { FEDERATIONS, getFederationFlagUrl } from '../../data/initialData';",
    'federation regression imports'
)
old_facade_assert = "assert.match(actions, /resolveConflict: \\(tournament: Tournament\\) => smartPullChanges/);"
new_facade_assert = "assert.match(actions, /resolveConflict: \\(tournament: Tournament, strategy: 'safe' \\| 'web' \\| 'cloud'/);"
t = replace_once(t, old_facade_assert, new_facade_assert, 'updated facade assertion')
console_anchor = "console.log('PASS Companion sync contract: full Desktop/Web tournament parity + directional Pull/Push + safe roster view sorting.');"
extra = '''assert.ok(FEDERATIONS.length >= 201, 'Web/Desktop federation catalogue must include the full FIDE member set, not a short curated subset.');
assert.equal(FEDERATIONS.find(item => item[0] === 'GRE')?.[2], 'GR', 'GRE must map to the Greece flag asset.');
assert.equal(getFederationFlagUrl('GRE'), 'https://flagcdn.com/gr.svg', 'Web Companion must use a real image flag for Greece instead of Windows regional-letter glyphs.');
assert.match(setup, /getFederationFlagUrl\\(settings\\.country\\)/, 'Companion federation selector must render a real selected flag image.');
assert.doesNotMatch(setup, /getFederationFlag\\(code\\)/, 'Companion native select text must not render Windows GR-style regional-letter glyphs.');
assert.match(workspace, /Keep Web/, 'Same-field conflict UI must expose an explicit Web winner.');
assert.match(workspace, /Use Cloud/, 'Same-field conflict UI must expose an explicit Cloud winner.');
assert.match(actions, /kind: 'needs-choice'/, 'Safe conflict resolution must stop for explicit same-field choice.');
'''+console_anchor
t = replace_once(t, console_anchor, extra, 'federation and conflict UI regressions')
sync_test.write_text(t)

print('Applied explicit conflict resolution + full FIDE federation/flag repair.')
