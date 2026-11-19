const api = 'https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev/api/v1/cloud/workspace';
const form = document.querySelector('form');
const input = document.querySelector('#organizer-token');
const button = form.querySelector('button');
const status = document.querySelector('#login-status');

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled) return;
  const token = input.value.trim();
  if (!/^[!-~]{1,2048}$/.test(token)) {
    status.textContent = 'Въведете валиден Organizer Token.';
    return;
  }

  button.disabled = true;
  status.textContent = 'Проверка на достъпа…';
  try {
    const response = await fetch(api, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000)
    });
    if ([401, 403].includes(response.status)) {
      status.textContent = 'Organizer Token е невалиден или достъпът е отнет.';
      return;
    }
    const data = response.ok ? await response.json() : null;
    if (!data?.organizer) throw new Error('Workspace unavailable');
    const identity = data.organizer.id || data.organizer.organizerId || token;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(identity)));
    const scope = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem('cp.desktop-web.session', JSON.stringify({ token, scope }));
    input.value = '';
    location.assign('./workspace.html');
  } catch {
    status.textContent = 'Входът е временно недостъпен. Опитайте отново.';
  } finally {
    button.disabled = false;
  }
});
