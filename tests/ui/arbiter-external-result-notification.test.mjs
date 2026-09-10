import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portal = readFileSync('src/arbiter/ArbiterPortal.tsx', 'utf8');
const css = readFileSync('src/arbiter/arbiter-confirmation.css', 'utf8');
const count = (source, pattern) => (source.match(pattern) || []).length;

assert.match(portal, /type ExternalResultNotice = \{/, 'External result corrections must have explicit typed state.');
assert.match(portal, /const observedResultsRef = useRef<Record<string, ResultObservation> \| null>\(null\)/, 'Arbiter must remember the last observed result state without writing it back.');
assert.match(portal, /const ownResultWritesRef = useRef<Record<string, string>>\(\{\}\)/, 'Own Arbiter writes must be distinguishable from external result changes.');
assert.match(portal, /function snapshotResults\(view: ArbiterTournamentView\)/, 'Result comparison must use a deterministic board snapshot.');
assert.match(portal, /resultObservationKey\(round, boardNumber, whiteKey, blackKey\)/, 'External result detection must remain bound to round, board, white and black identity.');

assert.match(portal, /if \(!previous \|\| previous\.result === current\.result\) continue;/, 'Unchanged results must never create notifications.');
assert.match(portal, /if \(ownExpectedResult === current\.result\) \{[\s\S]*?continue;/, 'A result written by this Arbiter page must not be reported as an external correction.');
assert.match(portal, /delete overwriteApprovalsRef\.current\[current\.key\]/, 'Any external result change must invalidate prior overwrite approval for that board.');
assert.match(portal, /if \(previous\.result === CLEAR_RESULT\) continue;/, 'First-time Desktop\/Cloud result entry may synchronize silently; correction of an existing result is the warning boundary.');
assert.match(portal, /pendingDraft = rawDraft[\s\S]*?rawDraft !== current\.result/, 'A conflicting unsent Web draft must be preserved and surfaced.');
assert.match(portal, /setExternalResultNotices\(current => \[\.\.\.current, \.\.\.notices\]\)/, 'External corrections must be queued instead of being lost when several boards change.');

assert.match(portal, /DESKTOP \/ CLOUD UPDATE/, 'The warning must clearly identify an external Cloud-side update.');
assert.match(portal, />Previous</, 'Warning must show the result previously seen by the Arbiter page.');
assert.match(portal, />Cloud now</, 'Warning must show the current Cloud result.');
assert.match(portal, /This notification does not write or overwrite tournament data/, 'Notification itself must be strictly read-only.');
assert.match(portal, />Use Cloud result</, 'A pending Web draft must be safely discardable in favor of current Cloud state.');
assert.match(portal, />Keep my pending change</, 'A pending Web draft may be retained without writing immediately.');
assert.match(portal, /↕ SYNC will require confirmation before changing the current Cloud result/, 'Keeping a draft must still require the protected overwrite flow later.');
assert.match(portal, />Acknowledge</, 'An external correction without a conflicting draft must require explicit acknowledgement.');

assert.match(portal, /const sendAtRevision = async \(baseRevision: number\) => \{[\s\S]*?ownResultWritesRef\.current\[resultKey\] = result;[\s\S]*?arbiterApi\.submitResult/, 'Own result submissions must be marked before the protected transport call.');
assert.match(portal, /if \(ownResultWritesRef\.current\[resultKey\] === result\) delete ownResultWritesRef\.current\[resultKey\]/, 'Failed own writes must clear their suppression marker.');
assert.equal(count(portal, /arbiterApi\.submitResult/g), 1, 'External notifications must not add a second result write path.');
assert.equal(count(portal, /data-unified-arbiter-sync="true"/g), 1, 'Arbiter must still expose exactly one unified SYNC action.');
assert.doesNotMatch(portal, /window\.confirm|confirm\(/, 'External result safety must not use browser-native confirmation.');

assert.match(css, /\.arbiter-external-result-backdrop \{[\s\S]*?position: fixed;/, 'External result warning must block accidental background interaction.');
assert.match(css, /\.arbiter-external-result-actions \.use-cloud/, 'Cloud-preserving action must have an explicit style.');
assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.arbiter-external-result-actions button \{[\s\S]*?min-height: 56px;/, 'External result actions must remain large phone touch targets.');

console.log('ARBITER_EXTERNAL_RESULT_NOTIFICATION=PASS');
