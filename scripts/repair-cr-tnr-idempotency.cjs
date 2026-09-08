const fs = require('node:fs');

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`${label}: marker not found`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: marker is not unique`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

const workspacePath = 'src/companion/CompanionWorkspace.tsx';
let workspace = fs.readFileSync(workspacePath, 'utf8');

workspace = replaceOnce(
  workspace,
  `  const [sourceMismatchTnr, setSourceMismatchTnr] = useState('');\n  const tournamentRef = useRef(tournament);\n`,
  `  const [sourceMismatchTnr, setSourceMismatchTnr] = useState('');\n  const tournamentRef = useRef(tournament);\n  const chessResultsPublishLockRef = useRef(false);\n`,
  'publish lock ref'
);

workspace = replaceOnce(
  workspace,
  `  const createFreshChessResultsTnr = async () => {\n    const oldKey = sourceMismatchTnr || tnr;\n    if (!isTnr(oldKey)) return;\n    setBusy('cr-publish');\n`,
  `  const createFreshChessResultsTnr = async () => {\n    const oldKey = sourceMismatchTnr || tnr;\n    if (!isTnr(oldKey) || chessResultsPublishLockRef.current) return;\n    chessResultsPublishLockRef.current = true;\n    setBusy('cr-publish');\n`,
  'recovery GETKEY lock'
);

workspace = replaceOnce(
  workspace,
  `    } finally {\n      setBusy(null);\n    }\n  };\n\n  const publishChessResults = async () => {\n`,
  `    } finally {\n      chessResultsPublishLockRef.current = false;\n      setBusy(null);\n    }\n  };\n\n  const publishChessResults = async () => {\n`,
  'recovery lock release'
);

workspace = replaceOnce(
  workspace,
  `  const publishChessResults = async () => {\n    setBusy('cr-publish');\n    setMessage('');\n    setSourceMismatchTnr('');\n    let attemptedKey = '';\n    try {\n      await cloud.syncNow(tournamentRef.current);\n      const current = adoptSynchronizedTournament();\n`,
  `  const publishChessResults = async () => {\n    if (chessResultsPublishLockRef.current) return;\n    chessResultsPublishLockRef.current = true;\n    setBusy('cr-publish');\n    setMessage('');\n    setSourceMismatchTnr('');\n    let attemptedKey = '';\n    let transitionedFromTnr = '';\n    try {\n      const localBeforeSync = tournamentRef.current;\n      const requestedModeBeforeSync = String(localBeforeSync.settings.tournamentType || '').trim().toLowerCase();\n      const linkedKeyBeforeSync = String(localBeforeSync.chessResults?.key || localBeforeSync.settings?.tnr || '').trim();\n      const linkedFederationBeforeSync = String(localBeforeSync.chessResults?.federation || '').trim().toUpperCase();\n      const explicitLinkedModeBeforeSync = String(localBeforeSync.chessResults?.mode || '').trim().toLowerCase();\n      const linkedModeBeforeSync = explicitLinkedModeBeforeSync\n        || (linkedFederationBeforeSync === 'XXX' ? 'test' : isTnr(linkedKeyBeforeSync) ? 'real' : '');\n      const modeChangedBeforeSync = isTnr(linkedKeyBeforeSync)\n        && ['real', 'test'].includes(requestedModeBeforeSync)\n        && ['real', 'test'].includes(linkedModeBeforeSync)\n        && requestedModeBeforeSync !== linkedModeBeforeSync;\n      const staleFreshIdentity = isTnr(linkedKeyBeforeSync) && localBeforeSync.chessResults?.freshTnrRequired === true;\n\n      // Never synchronize a mixed identity such as settings=test with an old Real TNR.\n      // Detach the old TNR first, synchronize that coherent transition, then obtain exactly one replacement key.\n      if (modeChangedBeforeSync || staleFreshIdentity) {\n        transitionedFromTnr = linkedKeyBeforeSync;\n        const transitionMode = ['real', 'test'].includes(requestedModeBeforeSync) ? requestedModeBeforeSync : linkedModeBeforeSync;\n        const transitionFederation = transitionMode === 'test'\n          ? 'XXX'\n          : String(localBeforeSync.settings.country || '').trim().toUpperCase();\n        const transition: Tournament = {\n          ...localBeforeSync,\n          settings: { ...localBeforeSync.settings, tnr: '' },\n          chessResults: {\n            ...localBeforeSync.chessResults,\n            key: '',\n            mode: transitionMode,\n            federation: transitionFederation,\n            freshTnrRequired: true,\n            lastError: '',\n            uploadStatus: \`Preparing one new \${transitionMode === 'test' ? 'Test' : 'Real'} Chess-Results TNR; previous TNR \${linkedKeyBeforeSync} is no longer active for this mode.\`\n          }\n        };\n        persistTournament(transition);\n      }\n\n      await cloud.syncNow(tournamentRef.current);\n      const current = adoptSynchronizedTournament();\n`,
  'atomic pre-sync rollover'
);

workspace = replaceOnce(
  workspace,
  `      const requestedMode = String(current.settings.tournamentType || '').trim().toLowerCase();\n      const linkedMode = String(current.chessResults?.mode || '').trim().toLowerCase();\n      const modeChanged = isTnr(key)\n`,
  `      const requestedMode = String(current.settings.tournamentType || '').trim().toLowerCase();\n      const linkedFederation = String(current.chessResults?.federation || '').trim().toUpperCase();\n      const explicitLinkedMode = String(current.chessResults?.mode || '').trim().toLowerCase();\n      const linkedMode = explicitLinkedMode\n        || (linkedFederation === 'XXX' ? 'test' : isTnr(key) ? 'real' : '');\n      const modeChanged = isTnr(key)\n`,
  'legacy linked mode inference'
);

workspace = replaceOnce(
  workspace,
  `      const requiresFreshTnr = Boolean(current.chessResults?.freshTnrRequired || modeChanged);\n      const replacedKey = requiresFreshTnr && isTnr(key) ? key : '';\n`,
  `      const requiresFreshTnr = Boolean(current.chessResults?.freshTnrRequired || modeChanged);\n      const replacedKey = transitionedFromTnr || (requiresFreshTnr && isTnr(key) ? key : '');\n`,
  'rollover audit key'
);

workspace = replaceOnce(
  workspace,
  `    } finally {\n      setBusy(null);\n    }\n  };\n\n  const openChessResultsAdmin = async () => {\n`,
  `    } finally {\n      chessResultsPublishLockRef.current = false;\n      setBusy(null);\n    }\n  };\n\n  const openChessResultsAdmin = async () => {\n`,
  'publish lock release'
);

fs.writeFileSync(workspacePath, workspace);

const testPath = 'src/cloud/tests/runCompanionChessResultsTransportTests.ts';
let test = fs.readFileSync(testPath, 'utf8');
const marker = `(globalThis as any).window.location.hostname = 'localhost';\n`;
const regression = `assert.match(\n  workspaceSource,\n  /const chessResultsPublishLockRef = useRef\\(false\\);/,\n  'Chess-Results Publish must be single-flight so a double click cannot issue multiple GETKEY requests.'\n);\nassert.match(\n  workspaceSource,\n  /if \\(!isTnr\\(oldKey\\) \\|\\| chessResultsPublishLockRef\\.current\\) return;/,\n  'The recovery GETKEY path must share the same single-flight lock.'\n);\nassert.match(\n  workspaceSource,\n  /const localBeforeSync = tournamentRef\\.current;[\\s\\S]*settings: \\{ \\.\\.\\.localBeforeSync\\.settings, tnr: '' \\}[\\s\\S]*key: ''[\\s\\S]*await cloud\\.syncNow\\(tournamentRef\\.current\\);/,\n  'A Real/Test rollover must detach the previous TNR before Cloud sync instead of synchronizing mixed mode/key identity.'\n);\nassert.match(\n  workspaceSource,\n  /const transitionFederation = transitionMode === 'test'[\\s\\S]*\\? 'XXX'/,\n  'The atomic Test rollover must stage federation XXX before requesting the replacement TNR.'\n);\nassert.match(\n  workspaceSource,\n  /const replacedKey = transitionedFromTnr \\|\\| \\(requiresFreshTnr/,\n  'The previous TNR must be retained only for audit while the replacement TNR becomes the active identity.'\n);\nassert.match(\n  workspaceSource,\n  /const linkedModeBeforeSync = explicitLinkedModeBeforeSync[\\s\\S]*linkedFederationBeforeSync === 'XXX' \\? 'test' : isTnr\\(linkedKeyBeforeSync\\) \\? 'real'/,\n  'Legacy synchronized TNRs without an explicit mode must still infer Test from XXX and Real from a non-XXX linked key.'\n);\nconst lockReleaseMatches = workspaceSource.match(/chessResultsPublishLockRef\\.current = false;/g) || [];\nassert.equal(lockReleaseMatches.length, 2, 'Both Chess-Results GETKEY paths must always release the single-flight lock.');\n\n`;
if (!test.includes('Chess-Results Publish must be single-flight')) {
  if (!test.includes(marker)) throw new Error('transport test insertion marker missing');
  test = test.replace(marker, regression + marker);
}
fs.writeFileSync(testPath, test);

console.log('Chess-Results TNR rollover patch applied.');
