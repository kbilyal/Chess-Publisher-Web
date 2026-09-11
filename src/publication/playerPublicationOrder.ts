import { Tournament } from '../types';

export type PlayerPublicationOrder = 'starting' | 'rating' | 'name';

export function getPlayerPublicationOrder(tournament: Tournament | any): PlayerPublicationOrder {
  const raw = String(tournament?.settings?.playerPublicationOrder || '').trim().toLowerCase();
  if (raw === 'starting' || raw === 'name' || raw === 'rating') return raw;
  return 'rating';
}

export function orderPlayersForPublication(tournament: Tournament | any) {
  const order = getPlayerPublicationOrder(tournament);
  const players = [...(tournament?.players || [])];

  return players.sort((a: any, b: any) => {
    if (order === 'rating') {
      const ratingDifference = Number(b?.rating || 0) - Number(a?.rating || 0);
      if (ratingDifference) return ratingDifference;
      const byName = String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
      return byName || Number(a?.pairingNumber || 0) - Number(b?.pairingNumber || 0);
    }

    if (order === 'name') {
      const byName = String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
      if (byName) return byName;
      const ratingDifference = Number(b?.rating || 0) - Number(a?.rating || 0);
      return ratingDifference || Number(a?.pairingNumber || 0) - Number(b?.pairingNumber || 0);
    }

    return Number(a?.pairingNumber || 0) - Number(b?.pairingNumber || 0);
  });
}

export function buildPublicationNumberMap(tournament: Tournament | any) {
  return new Map<string, number>(
    orderPlayersForPublication(tournament).map((player: any, index: number) => [String(player?.localKey || ''), index + 1])
  );
}
