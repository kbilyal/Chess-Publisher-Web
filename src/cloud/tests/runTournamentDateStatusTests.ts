import assert from 'node:assert/strict';
import { tournamentDateStatus } from '../tournamentDateStatus';

const at = (iso: string) => new Date(iso);
const start = '2026-11-06';
const end = '2026-11-08';
assert.equal(tournamentDateStatus(start, end, at('2026-11-05T12:00:00Z')), 'upcoming');
assert.equal(tournamentDateStatus(start, end, at('2026-11-06T12:00:00Z')), 'live');
assert.equal(tournamentDateStatus(start, end, at('2026-11-08T21:59:59Z')), 'live');
assert.equal(tournamentDateStatus(start, end, at('2026-11-08T22:00:00Z')), 'completed');
assert.equal(tournamentDateStatus(start, end, at('2026-11-09T12:00:00Z')), 'completed');
assert.equal(tournamentDateStatus('2026-11-10', '2026-11-08'), null);
assert.equal(tournamentDateStatus('', end), null);
assert.equal(tournamentDateStatus('2026-02-30', end), null);
assert.equal(tournamentDateStatus(start, end, at('2026-11-08T23:30:00Z'), 'UTC'), 'live');
console.log('Tournament lifecycle date tests: PASS');
