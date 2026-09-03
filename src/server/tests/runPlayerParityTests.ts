import { runAllPlayerParityTests } from './playerParityTests';

async function main() {
  console.log('================================================================');
  console.log('CHESS-PUBLISHER: BATCH K — PLAYER REGISTRATION & STARTING LIST');
  console.log('================================================================');

  const results = await runAllPlayerParityTests();
  let passedCount = 0;

  for (const r of results) {
    if (r.passed) {
      passedCount++;
      console.log(`✅ [PASS] ${r.name} (${r.durationMs.toFixed(1)}ms)`);
      console.log(`   ${r.message}`);
    } else {
      console.error(`❌ [FAIL] ${r.name} (${r.durationMs.toFixed(1)}ms)`);
      console.error(`   ${r.message}`);
    }
  }

  console.log('================================================================');
  console.log(`Summary: ${passedCount}/${results.length} Player Parity & Registration tests passed.`);
  console.log('================================================================');

  if (passedCount < results.length) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error running Player Parity test suite:', err);
  process.exit(1);
});
