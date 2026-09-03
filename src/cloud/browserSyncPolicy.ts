import { classifyThreeWay, ThreeWayDecision } from './onlineCloudSync';

export type AutomaticSyncDecision = 'equal' | 'push-local' | 'remote-available' | 'conflict';

export function decideAutomaticSync(
  localFingerprint: string,
  baseFingerprint: string,
  cloudFingerprint: string
): AutomaticSyncDecision {
  const decision: ThreeWayDecision = classifyThreeWay(localFingerprint, baseFingerprint, cloudFingerprint);
  if (decision === 'equal') return 'equal';
  if (decision === 'local-only') return 'push-local';
  if (decision === 'cloud-only') return 'remote-available';
  return 'conflict';
}

export function parseContinuationHint(search: string) {
  const params = new URLSearchParams(search || '');
  const value = (
    params.get('cloudTournamentId') ||
    params.get('cloud') ||
    params.get('continue') ||
    ''
  ).trim();
  if (!value || value.length > 200) return '';
  if (!/^[A-Za-z0-9._:-]+$/.test(value)) return '';
  return value;
}

export function stripContinuationHint(url: string) {
  const parsed = new URL(url, 'https://chess-publisher.org');
  parsed.searchParams.delete('cloudTournamentId');
  parsed.searchParams.delete('cloud');
  parsed.searchParams.delete('continue');
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function findOwnedContinuationTournament<T extends { id?: unknown; localKey?: unknown }>(
  tournaments: T[],
  hint: string
): T | undefined {
  if (!hint) return undefined;
  return tournaments.find(item => String(item.id || '') === hint || String(item.localKey || '') === hint);
}
