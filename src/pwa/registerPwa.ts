export function registerChessPublisherPwa() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloadingForUpdate = false;
    let registrationRef: ServiceWorkerRegistration | null = null;
    let lastCheckAt = Date.now();

    if (hadController) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadingForUpdate) return;
        reloadingForUpdate = true;
        window.location.reload();
      }, { once: true });
    }

    const checkForUpdate = () => {
      const now = Date.now();
      if (!registrationRef || now - lastCheckAt < 30_000) return;
      lastCheckAt = now;
      void registrationRef.update().catch(() => {});
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    });
    window.addEventListener('pageshow', event => {
      if (event.persisted) checkForUpdate();
    });

    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(registration => {
        registrationRef = registration;
        return registration.update();
      })
      .catch(error => {
        console.warn('Chess-Publisher PWA service worker could not be registered.', error);
      });
  }, { once: true });
}

registerChessPublisherPwa();
