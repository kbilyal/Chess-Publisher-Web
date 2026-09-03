const TOKEN_SESSION_KEYS = [
  'cpweb.organizerToken.session',
  'cpstudio.organizerToken.session'
];
const TOKEN_LOCAL_KEYS = [
  'cpweb.organizerToken.remembered',
  'cpstudio.organizerToken.remembered'
];

const nativeFetch = typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : undefined;

function readFirst(storage: Storage, keys: string[]) {
  for (const key of keys) {
    const value = (storage.getItem(key) || '').trim();
    if (value) return value;
  }
  return '';
}

function organizerToken() {
  try {
    return readFirst(sessionStorage, TOKEN_SESSION_KEYS) || readFirst(localStorage, TOKEN_LOCAL_KEYS);
  } catch {
    return '';
  }
}

function isLocalProductApi(input: RequestInfo | URL) {
  try {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

const authenticatedFetch: typeof window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  if (!nativeFetch) throw new Error('Native fetch is unavailable');
  if (!isLocalProductApi(input)) return nativeFetch(input, init);

  const token = organizerToken();
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  if (input instanceof Request) {
    return nativeFetch(new Request(input, { ...init, headers }));
  }
  return nativeFetch(input, { ...init, headers });
};

if (typeof window !== 'undefined' && nativeFetch) {
  try {
    Object.defineProperty(window, 'fetch', {
      value: authenticatedFetch,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    (window as any).fetch = authenticatedFetch;
  }
}

export {};
