import { runAllTransactionTests } from './transactionTests';

async function main() {
  console.log('================================================================');
  console.log('CHESS-PUBLISHER: BATCH A — TRANSACTION SAFETY VERIFICATION SUITE');
  console.log('================================================================\n');

  try {
    const results = await runAllTransactionTests();
    let allPassed = true;

    results.forEach((r) => {
      const mark = r.passed ? '✅ [PASS]' : '❌ [FAIL]';
      console.log(`${mark} ${r.name} (${r.durationMs.toFixed(1)}ms)`);
      console.log(`   ${r.message}`);
      if (!r.passed) allPassed = false;
    });

    const passedCount = results.filter(r => r.passed).length;
    console.log('\n================================================================');
    console.log(`Summary: ${passedCount}/${results.length} Transaction Safety tests passed.`);
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
