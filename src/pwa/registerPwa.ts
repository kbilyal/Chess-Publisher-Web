export function registerChessPublisherPwa() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloadingForUpdate = false;

    if (hadController) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadingForUpdate) return;
        reloadingForUpdate = true;
        window.location.reload();
      }, { once: true });
    }

    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(error => {
        console.warn('Chess-Publisher PWA service worker could not be registered.', error);
      });
  }, { once: true });
}

registerChessPublisherPwa();
