const webOrigins = ['https://chess-publisher.org', 'https://www.chess-publisher.org'];
let handoff: Promise<string> | undefined;

// Keep the handshake shared across React's development effect replay.
export function receiveWebOrganizerToken(): Promise<string> {
  if (handoff) return handoff;
  const url = new URL(window.location.href);
  if (url.searchParams.get('webHandoff') !== '1') return Promise.resolve('');
  url.searchParams.delete('webHandoff');
  window.history.replaceState(window.history.state, '', url);
  const portal = window.opener;
  if (!portal) return Promise.resolve('');

  handoff = new Promise(resolve => {
    function finish(token: string) {
      window.clearTimeout(timeout);
      window.removeEventListener('message', receive);
      window.opener = null;
      resolve(token);
    }

    function receive(event: MessageEvent) {
      if (event.source !== portal || !webOrigins.includes(event.origin)) return;
      if (event.data?.type !== 'cp:web-organizer-token' || typeof event.data.token !== 'string') return;
      if (!/^[!-~]{1,2048}$/.test(event.data.token)) return;
      finish(event.data.token);
    }

    const timeout = window.setTimeout(() => finish(''), 10000);
    window.addEventListener('message', receive);
    for (const origin of webOrigins) portal.postMessage({ type: 'cp:companion-ready' }, origin);
  });

  return handoff;
}
