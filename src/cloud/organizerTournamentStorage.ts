const LEGACY_TOURNAMENT_KEY = 'fide_tournament_manager_v2';
const LAST_ORGANIZER_KEY = 'cpstudio.lastOrganizerId';
let scope = '';

export function setOrganizerTournamentScope(organizerId: string) {
  if (!organizerId || scope === organizerId) return;
  if (scope) throw new Error('A new browser session is required to switch organizers.');
  scope = organizerId;
  if (localStorage.getItem(LAST_ORGANIZER_KEY) !== organizerId) return;

  // Migrate the old global slot only when its recorded organizer matches.
  const key = organizerTournamentStorageKey(LEGACY_TOURNAMENT_KEY);
  const previous = localStorage.getItem(LEGACY_TOURNAMENT_KEY);
  if (previous && localStorage.getItem(key) === null) localStorage.setItem(key, previous);
  localStorage.removeItem(LEGACY_TOURNAMENT_KEY);
  localStorage.removeItem(LAST_ORGANIZER_KEY);
}

export function organizerTournamentStorageKey(key: string) {
  return scope ? `cpstudio.organizer:${encodeURIComponent(scope)}:${key}` : key;
}
