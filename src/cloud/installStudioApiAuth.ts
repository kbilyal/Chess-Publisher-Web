const TOKEN_SESSION_KEY = 'cpstudio.organizerToken.session';
const TOKEN_LOCAL_KEY = 'cpstudio.organizerToken.remembered';

const nativeFetch = window.fetch.bind(window);

function organizerToken() {
  return (sessionStorage.getItem(TOKEN_SESSION_KEY) || localStorage.getItem(TOKEN_LOCAL_KEY) || '').trim();
}

function isStudioApi(input: RequestInfo | URL) {
  try {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  if (!isStudioApi(input)) return nativeFetch(input, init);

  const token = organizerToken();
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  if (token) headers.set('Authorization', `Bearer ${token}`);

  if (input instanceof Request) {
    const request = new Request(input, { ...init, headers });
    return nativeFetch(request);
  }
  return nativeFetch(input, { ...init, headers });
};

export {};
