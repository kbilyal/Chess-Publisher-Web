import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const portal = readFileSync('src/arbiter/ArbiterPortal.tsx', 'utf8');
const css = readFileSync('src/arbiter/arbiter-confirmation.css', 'utf8');

const count = (source, pattern) => (source.match(pattern) || []).length;

assert.match(portal, /type OverwriteConfirmation = \{/, 'Arbiter overwrite confirmation state must be explicit.');
assert.match(portal, /const \[overwriteConfirmation, setOverwriteConfirmation\]/, 'Overwrite confirmation state is missing.');
assert.match(portal, /if \(currentResult !== CLEAR_RESULT\) \{[\s\S]*?setOverwriteConfirmation\(/, 'Changing an already recorded result must require confirmation.');
assert.match(portal, /onClick=\{\(\) => chooseResult\(result\)\}/, 'Standard and special result buttons must use the protected result-choice path.');
assert.match(portal, /onClick=\{\(\) => chooseResult\(CLEAR_RESULT\)\}/, 'Clear result must use the same overwrite-confirmation path.');
assert.doesNotMatch(portal, /window\.confirm|confirm\(/, 'Do not use a browser-native confirm dialog for result protection.');

assert.match(portal, /RESULT CHANGE PROTECTION/, 'Confirmation dialog must clearly identify the safety action.');
assert.match(portal, />Current</, 'Confirmation must show the currently recorded result.');
assert.match(portal, />New</, 'Confirmation must show the requested new result.');
assert.match(portal, /className="cancel" autoFocus/, 'Cancel must be the focused/default-safe action.');
assert.match(portal, />Change result</, 'Intentional overwrite must require an explicit Change result action.');
assert.match(portal, /A result is already recorded for this game/, 'Dialog must explain why confirmation is required.');

assert.match(portal, /const synchronized = await arbiterApi\.tournament\(sessionToken\);[\s\S]*?const prepared = requested\.map/, 'Unified SYNC must read fresh Cloud state before overwrite preflight.');
assert.match(portal, /const unconfirmedOverwrite = prepared\.find/, 'Fresh Cloud state must be checked for unconfirmed overwrites before writes.');
assert.match(portal, /approval\.from !== item\.expectedCurrentResult \|\| approval\.to !== item\.result/, 'Confirmation approval must be bound to the exact current→new result pair.');
assert.match(portal, /if \(unconfirmedOverwrite\) \{[\s\S]*?setOverwriteConfirmation\(/, 'A Desktop\/Cloud result discovered during SYNC must stop and request confirmation.');
assert.match(portal, /liveResult !== expectedCurrentResult/, 'Revision retry must not overwrite a result that changed after preflight.');
assert.match(portal, /confirm before overwriting it/, 'Concurrent result changes must fail closed with an explicit safety message.');

assert.equal(count(portal, /data-unified-arbiter-sync="true"/g), 1, 'Arbiter must keep exactly one visible unified SYNC action.');
assert.equal(count(portal, /arbiterApi\.submitResult/g), 1, 'All result writes must remain on one protected transport path.');
assert.doesNotMatch(portal, /className="arbiter-send"/, 'Per-board Send buttons must not return.');
assert.doesNotMatch(portal, />\s*Refresh\s*</, 'Manual Refresh must not return.');

assert.match(css, /\.arbiter-confirmation-backdrop \{[\s\S]*?position: fixed;/, 'Confirmation must block accidental interaction with the page behind it.');
assert.match(css, /\.arbiter-confirmation-actions \.cancel:focus-visible/, 'Cancel must have a visible keyboard focus state.');
assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.arbiter-confirmation-actions button \{[\s\S]*?min-height: 56px;/, 'Confirmation actions must remain large touch targets on phones.');

console.log('ARBITER_OVERWRITE_CONFIRMATION=PASS');
