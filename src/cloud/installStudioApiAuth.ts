const TOKEN_SESSION_KEY = 'cpstudio.organizerToken.session';
const TOKEN_LOCAL_KEY = 'cpstudio.organizerToken.remembered';

const nativeFetch = typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : undefined;

function organizerToken() {
  try {
    return (sessionStorage.getItem(TOKEN_SESSION_KEY) || localStorage.getItem(TOKEN_LOCAL_KEY) || '').trim();
  } catch {
    return '';
  }
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

const customFetch: typeof window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  if (!nativeFetch) {
    throw new Error('Native fetch is unavailable');
  }
  if (!isStudioApi(input)) return nativeFetch(input, init);

  const token = organizerToken();
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  if (input instanceof Request) {
    const request = new Request(input, { ...init, headers });
    return nativeFetch(request);
  }
  return nativeFetch(input, { ...init, headers });
};

if (typeof window !== 'undefined' && nativeFetch) {
  let applied = false;
  try {
    Object.defineProperty(window, 'fetch', {
      value: customFetch,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    applied = true;
  } catch {
    // Attempt next strategy
  }

  if (!applied) {
    try {
      const proto = Object.getPrototypeOf(window);
      if (proto && Object.getOwnPropertyDescriptor(proto, 'fetch')) {
        Object.defineProperty(proto, 'fetch', {
          value: customFetch,
          writable: true,
          configurable: true,
          enumerable: true,
        });
        applied = true;
      }
    } catch {
      // Attempt next strategy
    }
  }

  if (!applied) {
    try {
      (window as any).fetch = customFetch;
      applied = true;
    } catch (err) {
      console.warn('Could not intercept window.fetch for Organizer Token:', err);
    }
  }
}

export {};

