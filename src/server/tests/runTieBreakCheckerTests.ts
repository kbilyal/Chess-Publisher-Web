import { Tournament } from '../../types';
import { runTieBreakIntegrityCheck } from '../../engine/tiebreakChecker';
import { ChessPublisherTieBreakCheckerAdapter } from '../../engine/adapters/TieBreakCheckerAdapter';
import { INITIAL_TOURNAMENT_DATA } from '../../data/initialData';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${message}`);
    process.exitCode = 1;
  }
}

console.log('=== TIE-BREAK INTEGRITY CHECKER AUDIT SUITE ===');

// Test 1: Initial tournament data check
console.log('--- Test 1: Clean Initial Tournament Check ---');
const cleanReport = runTieBreakIntegrityCheck(INITIAL_TOURNAMENT_DATA);
assert(cleanReport.status === 'PASS', 'Clean tournament status is PASS');
assert(cleanReport.issues.length === 0, 'Clean tournament has 0 issues');
assert(cleanReport.summary.rulesProfile === 'FIDE 2026', 'Profile is FIDE 2026');
assert(cleanReport.summary.criteriaCount === INITIAL_TOURNAMENT_DATA.regulations.tieBreaks.length, 'Criteria count matches');

// Test 2: Empty tie-breaks list
console.log('--- Test 2: Empty Tie-Breaks Configuration ---');
const emptyTbTournament: Tournament = {
  ...INITIAL_TOURNAMENT_DATA,
  regulations: {
    ...INITIAL_TOURNAMENT_DATA.regulations,
    tieBreaks: []
  }
};
const emptyReport = runTieBreakIntegrityCheck(emptyTbTournament);
assert(emptyReport.status === 'WARNING', 'Empty tie-breaks list produces WARNING status');
assert(emptyReport.issues.some(i => i.code === 'NO_TIE_BREAKS_CONFIGURED'), 'Detects NO_TIE_BREAKS_CONFIGURED code');

// Test 3: Duplicate tie-break criteria
console.log('--- Test 3: Duplicate Criteria Detection ---');
const dupTournament: Tournament = {
  ...INITIAL_TOURNAMENT_DATA,
  regulations: {
    ...INITIAL_TOURNAMENT_DATA.regulations,
    tieBreaks: [
      'Buchholz Cut-1 (BH-C1) [84]',
      'Direct Encounter (DE) [81]',
      'Buchholz Cut-1 (BH-C1) [84]'
    ]
  }
};
const dupReport = runTieBreakIntegrityCheck(dupTournament);
assert(dupReport.status === 'ERROR', 'Duplicate tie-breaks trigger ERROR status');
assert(dupReport.issues.some(i => i.code === 'DUPLICATE_TIE_BREAK'), 'Detects DUPLICATE_TIE_BREAK code');

// Test 4: Deprecated criteria in FIDE 2026 profile
console.log('--- Test 4: Deprecated Criteria Warning ---');
const depTournament: Tournament = {
  ...INITIAL_TOURNAMENT_DATA,
  regulations: {
    ...INITIAL_TOURNAMENT_DATA.regulations,
    tieBreaks: [
      'Progressive Score (PS) [82]',
      'Buchholz Cut-1 (BH-C1) [84]'
    ]
  }
};
const depReport = runTieBreakIntegrityCheck(depTournament);
assert(depReport.issues.some(i => i.code === 'OBSOLETE_CRITERION'), 'Detects OBSOLETE_CRITERION for Progressive Score in FIDE 2026');

// Test 5: Forfeit counting configuration warning
console.log('--- Test 5: Non-standard Forfeits Warning ---');
const forfeitTournament: Tournament = {
  ...INITIAL_TOURNAMENT_DATA,
  regulations: {
    ...INITIAL_TOURNAMENT_DATA.regulations,
    tieBreakOptions: {
      'Buchholz Cut-1 (BH-C1) [84]': { countForfeits: true }
    }
  }
};
const forfeitReport = runTieBreakIntegrityCheck(forfeitTournament);
assert(forfeitReport.issues.some(i => i.code === 'NON_STANDARD_FORFEIT_RULE'), 'Detects NON_STANDARD_FORFEIT_RULE when countForfeits is enabled');

// Test 6: Adapter integration check
console.log('--- Test 6: ChessPublisherTieBreakCheckerAdapter Verification ---');
const adapter = new ChessPublisherTieBreakCheckerAdapter();
adapter.isAvailable().then(available => {
  assert(available === true, 'Adapter is available');
  return adapter.verifyStandings(INITIAL_TOURNAMENT_DATA);
}).then(result => {
  assert(result.passed === true, 'Adapter reports passed === true for initial tournament');
  assert(result.status === 'PASS', 'Adapter reports PASS status');
  console.log(`=== CHECKER AUDIT COMPLETE: ${passedTests}/${totalTests} PASSED ===`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}).catch(err => {
  console.error('Adapter test error:', err);
  process.exit(1);
});
