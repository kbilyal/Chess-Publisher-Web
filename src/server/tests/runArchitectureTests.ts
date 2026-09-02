import { runAllArchitectureTests } from './architectureTests';
import { runAllPhase4ParityTests } from './phase4ParityTests';
import { runAllTransactionTests } from './transactionTests';

async function main() {
  console.log('================================================================');
  console.log('CHESS-PUBLISHER: PHASE 4 & BATCH A AUTHORITATIVE VERIFICATION SUITE');
  console.log('================================================================\n');

  try {
    console.log('--- SUITE 1: PROCESS-SAFETY & ARCHITECTURE CONTRACTS ---');
    const archResults = await runAllArchitectureTests('http://localhost:3000');
    let allPassed = true;

    archResults.forEach((r) => {
      const mark = r.passed ? '✅ [PASS]' : '❌ [FAIL]';
      console.log(`${mark} ${r.name} (${r.durationMs.toFixed(1)}ms)`);
      console.log(`   ${r.message}`);
      if (!r.passed) allPassed = false;
    });

    console.log('\n--- SUITE 2: UPSTREAM GACRUX 1.9.57 & BBP 6.0.0 DESKTOP PARITY ---');
    const parityResults = await runAllPhase4ParityTests();

    parityResults.forEach((r) => {
      const mark = r.passed ? '✅ [PASS]' : '❌ [FAIL]';
      console.log(`${mark} ${r.name} (${r.durationMs.toFixed(1)}ms)`);
      console.log(`   ${r.message}`);
      if (!r.passed) allPassed = false;
    });

    console.log('\n--- SUITE 3: BATCH A TRANSACTION SAFETY & ROLLBACK INVARIANTS ---');
    const transactionResults = await runAllTransactionTests();

    transactionResults.forEach((r) => {
      const mark = r.passed ? '✅ [PASS]' : '❌ [FAIL]';
      console.log(`${mark} ${r.name} (${r.durationMs.toFixed(1)}ms)`);
      console.log(`   ${r.message}`);
      if (!r.passed) allPassed = false;
    });

    const totalTests = archResults.length + parityResults.length + transactionResults.length;
    const passedCount =
      archResults.filter((r) => r.passed).length +
      parityResults.filter((r) => r.passed).length +
      transactionResults.filter((r) => r.passed).length;

    console.log('\n================================================================');
    console.log(`Comprehensive Summary: ${passedCount}/${totalTests} tests passed.`);
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
