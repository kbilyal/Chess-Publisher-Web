export function registerChessPublisherPwa() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(error => {
      console.warn('Chess-Publisher PWA service worker could not be registered.', error);
    });
  }, { once: true });
}

registerChessPublisherPwa();
