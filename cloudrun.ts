import express from 'express';
import path from 'path';
import { createHash } from 'crypto';

const HUB_API_BASE = 'https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev';
const AUTH_CACHE_TTL_MS = 60_000;
const authCache = new Map<string, number>();

function tokenFingerprint(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function validateOrganizerToken(authorization: string | undefined) {
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization || '').trim());
  const token = match?.[1]?.trim() || '';
  if (!token) return { ok: false as const, status: 401, message: 'Organizer Token required.' };

  const fingerprint = tokenFingerprint(token);
  const cachedUntil = authCache.get(fingerprint) || 0;
  if (cachedUntil > Date.now()) return { ok: true as const };

  let response: Response;
  try {
    response = await fetch(`${HUB_API_BASE}/api/v1/cloud/workspace`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Client-Version': 'studio-cloudrun-auth-0.1'
      },
      signal: AbortSignal.timeout(7_000)
    });
  } catch {
    return { ok: false as const, status: 503, message: 'Organizer Cloud Workspace authentication is temporarily unavailable.' };
  }

  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status === 401 || response.status === 403 ? 401 : 503,
      message: response.status === 401 || response.status === 403 ? 'Invalid Organizer Token.' : 'Organizer Cloud Workspace authentication failed.'
    };
  }

  authCache.set(fingerprint, Date.now() + AUTH_CACHE_TTL_MS);
  if (authCache.size > 500) {
    const now = Date.now();
    for (const [key, expires] of authCache) if (expires <= now) authCache.delete(key);
  }
  return { ok: true as const };
}

async function main() {
  // Import the existing application without allowing server.ts to bind its fixed development port.
  const requestedNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const { app: studioApi } = await import('./server');
  process.env.NODE_ENV = requestedNodeEnv || 'production';

  // Use an outer production app so the existing Studio server source remains unchanged.
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // Public liveness endpoint. No tournament or organizer data is returned.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'Chess-Publisher Web' });
  });

  // All functional Studio APIs require the same Organizer Token used by Cloud Workspace.
  app.use('/api', async (req, res) => {
    const auth = await validateOrganizerToken(req.header('authorization'));
    if (!auth.ok) {
      res.status(auth.status).json({ success: false, code: 'ORGANIZER_AUTH_REQUIRED', message: auth.message });
      return;
    }
    studioApi(req, res);
  });

  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`[Chess-Publisher Web] Cloud runtime listening on 0.0.0.0:${port}`);
  });
}

main().catch(error => {
  console.error('[Chess-Publisher Web] Fatal startup error:', error);
  process.exitCode = 1;
});
