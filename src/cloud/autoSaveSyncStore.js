(() => {
  if (typeof window === 'undefined') return;

  const eventName = 'cp:auto-save-sync';
  const sharedDomain = window.location.protocol === 'https:' &&
    ['chess-publisher.org', 'web.chess-publisher.org'].includes(window.location.hostname);

  function preferenceKey(organizerScope) {
    return `cpAutoSaveSync.${encodeURIComponent(organizerScope)}`;
  }

  function isEnabled(organizerScope) {
    if (!organizerScope) return true;
    const key = preferenceKey(organizerScope);
    try {
      if (!sharedDomain) return window.localStorage.getItem(key) !== '0';
      return !document.cookie.split(';').some(cookie => cookie.trim() === `${key}=0`);
    } catch {
      return true;
    }
  }

  function setEnabled(organizerScope, enabled) {
    if (!organizerScope) return isEnabled(organizerScope);
    const key = preferenceKey(organizerScope);
    try {
      if (sharedDomain) {
        document.cookie = `${key}=0; Path=/; Domain=chess-publisher.org; Secure; SameSite=Strict; Max-Age=${enabled ? 0 : 31536000}`;
      } else if (enabled) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, '0');
      }
    } catch { /* A blocked preference store leaves the previous choice active. */ }
    window.dispatchEvent(new Event(eventName));
    return isEnabled(organizerScope);
  }

  function subscribe(organizerScope, listener) {
    let previous = isEnabled(organizerScope);
    const refresh = () => {
      const enabled = isEnabled(organizerScope);
      if (enabled === previous) return;
      previous = enabled;
      listener(enabled);
    };
    window.addEventListener(eventName, refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    // Shared cookies do not fire the cross-tab storage event on sibling hosts.
    const timer = window.setInterval(refresh, 500);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(eventName, refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }

  window.cpAutoSaveSync = { isEnabled, setEnabled, subscribe };
})();
