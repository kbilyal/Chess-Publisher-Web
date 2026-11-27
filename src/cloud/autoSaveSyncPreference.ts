import './autoSaveSyncStore.js';
import { organizerTournamentStorageKey } from './organizerTournamentStorage';

declare global {
  interface Window {
    cpAutoSaveSync: {
      isEnabled: (scope: string) => boolean;
      setEnabled: (scope: string, enabled: boolean) => boolean;
      subscribe: (scope: string, listener: (enabled: boolean) => void) => () => void;
    };
  }
}

const scope = () => organizerTournamentStorageKey('');

export function autoSaveSyncEnabled() {
  return typeof window === 'undefined' || window.cpAutoSaveSync?.isEnabled(scope()) !== false;
}

export function setAutoSaveSyncEnabled(enabled: boolean) {
  return window.cpAutoSaveSync.setEnabled(scope(), enabled);
}

export function watchAutoSaveSync(listener: (enabled: boolean) => void) {
  return window.cpAutoSaveSync.subscribe(scope(), listener);
}
