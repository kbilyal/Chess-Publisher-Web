import { runAllRoundFinalizationTests } from './roundFinalizationTests';

async function main() {
  console.log('================================================================');
  console.log('CHESS-PUBLISHER: ROUND FINALIZATION & BYE INTEGRITY TEST SUITE');
  console.log('================================================================\n');

  try {
    const results = await runAllRoundFinalizationTests();
    let allPassed = true;

    results.forEach((r) => {
      const mark = r.passed ? '✅ [PASS]' : '❌ [FAIL]';
      console.log(`${mark} ${r.name} (${r.durationMs.toFixed(1)}ms)`);
      if (!r.passed) {
        console.log(`   Error: ${r.message}`);
        allPassed = false;
      }
    });

    const passedCount = results.filter(r => r.passed).length;
    console.log('\n================================================================');
    console.log(`Summary: ${passedCount}/${results.length} Round Finalization & Invariant tests passed.`);
    console.log('================================================================');

    if (!allPassed) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Fatal test harness execution error:', err);
    process.exit(1);
  }
}

main();
