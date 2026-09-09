import { Tournament } from '../types';

export type OwnedCloudTournamentMeta = {
  id: string;
  localKey?: string;
  name?: string;
  revision?: number;
  [key: string]: any;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const text = (value: unknown) => value == null ? '' : String(value).trim();

export class CloudIdentityAmbiguityError extends Error {
  code = 'cloud_identity_ambiguous';
  constructor(message = 'More than one Organizer Cloud tournament matches this tournament identity. No tournament was selected or overwritten.') {
    super(message);
    this.name = 'CloudIdentityAmbiguityError';
  }
}

/**
 * Existing stable identity only. This function never creates a new identity and
 * never uses the tournament name or revision as identity.
 *
 * The Hub fallback is kept only for legacy tournaments that predate cloud.internalId.
 * New/current tournaments must persist cloud.internalId and Hub publishing must not
 * rewrite it.
 */
export function existingStableInternalId(tournament: Tournament | any): string {
  return text(
    tournament?.cloud?.internalId ||
    tournament?.online?.hubTournamentId ||
    tournament?.hub?.tournamentId ||
    tournament?.publication?.hubTournamentId
  );
}

/**
 * Resolve only against the authenticated Organizer's authoritative tournament
 * list. Exact cloudTournamentId wins when it is still present in that owned
 * list. If the provider id is stale/missing, relink by stable internalId.
 * Name and revision are deliberately ignored.
 */
export function resolveOwnedCloudTournament(
  tournament: Tournament | any,
  list: OwnedCloudTournamentMeta[]
): OwnedCloudTournamentMeta | null {
  const owned = Array.isArray(list) ? list : [];
  const cloudTournamentId = text(tournament?.cloud?.cloudTournamentId);

  if (cloudTournamentId) {
    const byId = owned.filter(item => text(item?.id) === cloudTournamentId);
    if (byId.length > 1) throw new CloudIdentityAmbiguityError();
    if (byId.length === 1) return byId[0];
  }

  const internalId = existingStableInternalId(tournament);
  if (!internalId) return null;
  const byInternalId = owned.filter(item => text(item?.localKey) === internalId);
  if (byInternalId.length > 1) throw new CloudIdentityAmbiguityError();
  return byInternalId[0] || null;
}

/**
 * Bind local metadata to the exact organizer-owned row without touching the
 * installation-local cloud.localKey. This also repairs legacy cases where Hub
 * publishing changed cloud.internalId: the server localKey is canonical once
 * the owned cloudTournamentId mapping has been proven.
 */
export function bindOwnedCloudIdentity(
  tournament: Tournament | any,
  remote: OwnedCloudTournamentMeta
): Tournament {
  const next: any = clone(tournament || {});
  const currentCloud = next.cloud && typeof next.cloud === 'object' ? next.cloud : {};
  const canonicalInternalId = text(remote?.localKey) || existingStableInternalId(next);
  if (!text(remote?.id) || !canonicalInternalId) {
    throw new Error('Organizer Cloud tournament identity is incomplete.');
  }
  next.cloud = {
    ...currentCloud,
    schemaVersion: 4,
    internalId: canonicalInternalId,
    cloudTournamentId: text(remote.id)
  };
  return next as Tournament;
}
