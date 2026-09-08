import assert from 'node:assert/strict';
import fs from 'node:fs';

const provider = fs.readFileSync('src/cloud/OnlineCloudProviderV2.tsx', 'utf8');
const screens = fs.readFileSync('src/companion/CompanionCloudScreens.tsx', 'utf8');
const css = fs.readFileSync('src/companion-cloud.css', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');

const has = (source, marker, message) => assert.ok(source.includes(marker), message || `Missing ${marker}`);
const lacks = (source, marker, message) => assert.ok(!source.includes(marker), message || `Forbidden ${marker}`);

has(provider, "from '../companion/CompanionCloudScreens'", 'Cloud provider must use the focused Companion entry screens.');
has(provider, '<CompanionLoginScreen', 'Organizer login is not wired to the Companion login screen.');
has(provider, '<CompanionTournamentSelectScreen', 'My Tournaments is not wired to the Companion tournament screen.');
has(provider, 'function readLocalTournament()', 'Browser-local tournament persistence must remain available for continuation/sync.');
has(provider, 'async function continueWithLocal()', 'Underlying local-to-Cloud continuation logic must remain available.');
has(provider, 'findOwnedContinuationTournament', 'Organizer Cloud continuation discovery must remain wired.');
has(provider, 'onOpen={meta => void openCloud(meta)}', 'Cloud tournament cards must open the authoritative private snapshot.');
lacks(screens, 'onContinueLocal', 'The obsolete visible local-continuation action must stay removed.');
lacks(screens, 'THIS BROWSER', 'The obsolete This Browser section must stay removed.');
lacks(screens, 'companion-local-continuation', 'The obsolete local continuation card must stay removed.');
has(provider, 'onConnect={() => void loginWithToken(tokenInput, rememberToken)}', 'Organizer login must reuse the existing authenticated token workflow.');
has(provider, 'onRememberToken={setRememberToken}', 'Remember-token choice must remain explicit.');
has(screens, 'My tournaments', 'My Tournaments heading is missing.');
has(screens, 'Cloud tournaments', 'Cloud tournament list is missing.');
has(screens, 'No tournaments match your search.', 'My Tournaments must use the specified zero-result search copy.');

has(screens, 'New tournament', 'My Tournaments must expose Web tournament creation.');
has(screens, 'Import tournament', 'My Tournaments must expose one tournament import action.');
has(screens, '.trf,.trf16,.trf26,.txt,.tunx,.TUNX', 'One file picker must accept TRF16/TRF26/TUNX.');
has(provider, 'createPrivateTournamentAndOpen', 'Web-created/imported tournaments must create an authoritative private Cloud record.');
has(provider, 'cloudApi.createTournament', 'Web create/import must allocate a Cloud tournament identity.');
has(provider, 'cloudApi.putSnapshot', 'Web create/import must write initial Cloud revision r1 for Desktop continuation.');
has(provider, 'onCreateNew={name => void createNewTournamentFromStart(name)}', 'New tournament start action is not wired.');
has(provider, 'onImportFile={file => void importTournamentFromStart(file)}', 'TRF/TUNX import start action is not wired.');
has(screens, 'Continue your desktop tournaments anywhere.', 'Desktop-to-Web continuation message is missing.');
has(css, '@media (max-width: 560px)', 'Entry screens need a phone-specific layout.');
has(css, '.companion-tournament-grid { grid-template-columns:1fr;', 'Tournament cards must collapse to one column on phones.');
has(main, "import './companion-cloud.css';", 'Companion entry screen styles are not loaded.');

console.log('PASS Companion entry screens: polished Organizer login + My Tournaments wired to existing Cloud auth/open/continuation logic without the obsolete This Browser UI.');
