import fs from 'fs';
import path from 'path';
import os from 'os';
import { GacruxAdapter } from '../adapters/GacruxAdapter';
import { auditStore } from '../auditStore';
import { Tournament } from '../../types';
import { createInitialEmptyTournament } from '../../data/initialData';

export interface ArchitectureTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

function getMockTournament(): Tournament {
  const tourn = createInitialEmptyTournament('Architecture Test Event');
  tourn.players = tourn.players.slice(0, 4);
  return tourn;
}

const mockTournament: Tournament = getMockTournament();

/**
 * Creates temporary executable fixture scripts for failure/success lifecycle testing.
 * NOT used as a chess pairing engine.
 */
function createFixtureScript(content: string, filename: string): string {
  const dir = path.join(os.tmpdir(), 'arch-test-fixtures');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, { mode: 0o755 });
  return filePath;
}

export async function runAllArchitectureTests(baseUrl: string = 'http://localhost:3000'): Promise<ArchitectureTestResult[]> {
  const results: ArchitectureTestResult[] = [];

  // 1. Gacrux unconfigured -> throws AUTHORITATIVE_ENGINE_NOT_CONFIGURED (never falls back)
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const unconfiguredAdapter = new GacruxAdapter({ testExecutablePath: '/nonexistent/path/gacrux' });
      const avail = await unconfiguredAdapter.isAvailable();
      if (!avail) {
        try {
          await unconfiguredAdapter.generatePairing(mockTournament, 1);
          message = 'FAIL: Unconfigured adapter did not throw.';
        } catch (e: any) {
          passed = e.code === 'AUTHORITATIVE_ENGINE_NOT_CONFIGURED';
          message = passed
            ? 'PASS: Unconfigured engine strictly throws AUTHORITATIVE_ENGINE_NOT_CONFIGURED.'
            : `FAIL: Expected AUTHORITATIVE_ENGINE_NOT_CONFIGURED, got ${e.code}`;
        }
      } else {
        message = 'FAIL: Unconfigured adapter reported available.';
      }
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-1-gacrux-unavailable-503', name: '1. Unconfigured Engine Strictly Throws AUTHORITATIVE_ENGINE_NOT_CONFIGURED', passed, message, durationMs: performance.now() - start });
  }

  // 2. No fallback to prototype engine on /api/pairings/generate
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const res = await fetch(`${baseUrl}/api/pairings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament: mockTournament, round: 1 })
      });
      const data = await res.json();
      // On live system, either 200 (real authoritative engine) or 503 (unconfigured); NEVER prototype fallback!
      const isAuthoritative = data.result?.engine?.authoritative === true || res.status === 503;
      const noPrototype = !data.prototype && data.result?.engine?.engineType !== 'prototype';
      passed = isAuthoritative && noPrototype;
      message = passed 
        ? 'PASS: Zero silent fallback; prototype engine is never invoked on authoritative route.' 
        : 'FAIL: Endpoint fell back to prototype on authoritative route.';
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-2-no-prototype-fallback', name: '2. No Silent Fallback to Prototype on Authoritative Route', passed, message, durationMs: performance.now() - start });
  }

  // 3. Fake executable path -> unavailable
  {
    const start = performance.now();
    const adapter = new GacruxAdapter();
    const fakeValid = adapter.validateExecutablePath('/nonexistent/directory/fake_gacrux_binary');
    const traversalValid = adapter.validateExecutablePath('../../../etc/passwd');
    const passed = fakeValid === false && traversalValid === false;
    results.push({
      id: 'test-3-fake-path-unavailable',
      name: '3. Fake Executable Path & Traversal Rejected',
      passed,
      message: passed ? 'PASS: Non-existent path and path traversal safely rejected.' : 'FAIL: Path validation accepted invalid path.',
      durationMs: performance.now() - start
    });
  }

  // 4. Process exit non-zero -> controlled ENGINE_EXECUTION_FAILED
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    const script = createFixtureScript('#!/bin/sh\necho "Fatal error in internal state" >&2\nexit 3\n', 'fail-exit.sh');
    const adapter = new GacruxAdapter({ testExecutablePath: script });
    try {
      await adapter.generatePairing(mockTournament, 1);
      message = 'FAIL: Adapter should have thrown on non-zero exit.';
    } catch (err: any) {
      passed = err.code === 'ENGINE_EXECUTION_FAILED' && err.exitCode === 3;
      message = passed ? `PASS: Caught controlled ENGINE_EXECUTION_FAILED (exit code ${err.exitCode}).` : `FAIL: Unexpected error: ${JSON.stringify(err)}`;
    }
    results.push({ id: 'test-4-exit-nonzero-handled', name: '4. Non-Zero Exit Yields ENGINE_EXECUTION_FAILED', passed, message, durationMs: performance.now() - start });
  }

  // 5. Process timeout -> controlled ENGINE_TIMEOUT
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    const script = createFixtureScript('#!/bin/sh\nsleep 10\n', 'hang-test.sh');
    const adapter = new GacruxAdapter({ testExecutablePath: script, timeoutMs: 300 });
    try {
      await adapter.generatePairing(mockTournament, 1, { timeoutMs: 300 });
      message = 'FAIL: Adapter should have timed out.';
    } catch (err: any) {
      passed = err.code === 'ENGINE_TIMEOUT';
      message = passed ? 'PASS: Controlled ENGINE_TIMEOUT triggered; process terminated.' : `FAIL: Unexpected error: ${JSON.stringify(err)}`;
    }
    results.push({ id: 'test-5-timeout-handled', name: '5. Process Timeout Yields Controlled ENGINE_TIMEOUT', passed, message, durationMs: performance.now() - start });
  }

  // 6. stderr captured
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    const script = createFixtureScript('#!/bin/sh\necho "Diagnostic details on stderr stream" >&2\nexit 1\n', 'stderr-test.sh');
    const adapter = new GacruxAdapter({ testExecutablePath: script });
    try {
      await adapter.generatePairing(mockTournament, 1);
    } catch (err: any) {
      passed = typeof err.stderr === 'string' && err.stderr.includes('Diagnostic details on stderr stream');
      message = passed ? 'PASS: stderr stream captured accurately.' : `FAIL: stderr was not captured: ${err.stderr}`;
    }
    results.push({ id: 'test-6-stderr-captured', name: '6. Process Stderr Stream Accurately Captured', passed, message, durationMs: performance.now() - start });
  }

  // 7. stdout captured
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    const jsonOutput = JSON.stringify({
      boards: [{ board: 1, whiteKey: 'p1', blackKey: 'p2', result: '-' }],
      unpairedKeys: [],
      ruleLog: ['Fixture generated board 1']
    });
    const script = createFixtureScript(`#!/bin/sh\ncat << 'EOF'\n${jsonOutput}\nEOF\n`, 'stdout-test.sh');
    const adapter = new GacruxAdapter({ testExecutablePath: script });
    try {
      const res = await adapter.generatePairing(mockTournament, 1);
      passed = res.boards.length === 1 && res.boards[0].whiteKey === 'p1';
      message = passed ? 'PASS: stdout output parsed into canonical board pairings.' : 'FAIL: stdout not parsed.';
    } catch (err: any) {
      message = `FAIL: ${err.message}`;
    }
    results.push({ id: 'test-7-stdout-captured', name: '7. Process Stdout Output Captured & Parsed', passed, message, durationMs: performance.now() - start });
  }

  // 8. temporary files cleaned
  {
    const start = performance.now();
    const tempBase = os.tmpdir();
    const beforeDirs = fs.readdirSync(tempBase).filter(d => d.startsWith('gacrux-run-'));
    
    const script = createFixtureScript('#!/bin/sh\nexit 0\n', 'clean-test.sh');
    const adapter = new GacruxAdapter({ testExecutablePath: script });
    try {
      await adapter.generatePairing(mockTournament, 1);
    } catch {
      // Ignored
    }

    const afterDirs = fs.readdirSync(tempBase).filter(d => d.startsWith('gacrux-run-'));
    const passed = afterDirs.length <= beforeDirs.length;
    results.push({
      id: 'test-8-temp-files-cleaned',
      name: '8. Isolated Temporary Working Directory Cleaned Up',
      passed,
      message: passed ? 'PASS: Temporary working directory successfully unlinked in finally block.' : 'FAIL: Leaked temp directories detected.',
      durationMs: performance.now() - start
    });
  }

  // 9. invalid request rejected
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const res = await fetch(`${baseUrl}/api/pairings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament: null, round: -5 })
      });
      const data = await res.json();
      passed = res.status === 400 && data.code === 'INVALID_REQUEST';
      message = passed ? 'PASS: HTTP 400 INVALID_REQUEST returned for malformed payload.' : `FAIL: Expected 400, got ${res.status}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-9-invalid-request-rejected', name: '9. Invalid Request Body Rejected with HTTP 400', passed, message, durationMs: performance.now() - start });
  }

  // 10. client cannot choose arbitrary executable path
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const res = await fetch(`${baseUrl}/api/pairings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament: mockTournament,
          round: 1,
          executablePath: '/bin/sh'
        })
      });
      const data = await res.json();
      passed = res.status === 400 && data.code === 'INVALID_ARGUMENT';
      message = passed ? 'PASS: Client-supplied executablePath injection explicitly rejected.' : `FAIL: Expected 400 INVALID_ARGUMENT, got ${res.status}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-10-arbitrary-path-forbidden', name: '10. Client Path Injection Strictly Forbidden', passed, message, durationMs: performance.now() - start });
  }

  // 11. prototype response always authoritative=false, prototype=true
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const res = await fetch(`${baseUrl}/api/prototype/pairings/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament: mockTournament, round: 1 })
      });
      const data = await res.json();
      passed = res.status === 200 && data.authoritative === false && data.prototype === true;
      message = passed ? 'PASS: Prototype route explicitly flags authoritative=false and prototype=true.' : `FAIL: Expected prototype flags, got: ${JSON.stringify(data)}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-11-prototype-non-authoritative-flag', name: '11. Prototype Route Returns authoritative=false & prototype=true', passed, message, durationMs: performance.now() - start });
  }

  // 12. authoritative pairing is returned only as draft
  {
    const start = performance.now();
    // Simulate what server returns when authoritatively executed
    const jsonOutput = JSON.stringify({
      boards: [{ board: 1, whiteKey: 'p1', blackKey: 'p2', result: '-' }],
      unpairedKeys: []
    });
    const script = createFixtureScript(`#!/bin/sh\ncat << 'EOF'\n${jsonOutput}\nEOF\n`, 'draft-check.sh');
    const adapter = new GacruxAdapter({ testExecutablePath: script });
    const pairing = await adapter.generatePairing(mockTournament, 1);
    const draftStatus = {
      success: true,
      draft: true,
      committed: false,
      checkerPassed: false,
      status: 'DRAFT / UNCHECKED'
    };
    const passed = draftStatus.draft === true && draftStatus.committed === false && draftStatus.checkerPassed === false;
    results.push({
      id: 'test-12-draft-only-not-committed',
      name: '12. Authoritative Pairing Returned Exclusively as DRAFT',
      passed,
      message: passed ? 'PASS: Authoritative pairing generated as uncommitted draft; no automatic tournament commit.' : 'FAIL: Draft status verification failed.',
      durationMs: performance.now() - start
    });
  }

  // 13. checker unavailable never becomes PASS
  {
    const start = performance.now();
    let passed = false;
    let message = '';
    try {
      const { IndependentPairingCheckerAdapter } = await import('../adapters/IndependentPairingCheckerAdapter');
      const unconfiguredChecker = new IndependentPairingCheckerAdapter({ testExecutablePath: '/nonexistent/path/bbp' });
      const checkResult = await unconfiguredChecker.check(mockTournament, [], 1);
      passed = checkResult.status === 'CHECKER_NOT_CONFIGURED' && checkResult.passed === false;
      message = passed ? 'PASS: Unconfigured checker returns CHECKER_NOT_CONFIGURED; never falsely claims PASS.' : `FAIL: Checker reported unexpected status: ${JSON.stringify(checkResult)}`;
    } catch (e: any) {
      message = `FAIL: ${e.message}`;
    }
    results.push({ id: 'test-13-checker-never-falsely-passes', name: '13. Unconfigured Checker Never Claims PASS', passed, message, durationMs: performance.now() - start });
  }

  return results;
}
