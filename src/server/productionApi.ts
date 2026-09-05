import type express from 'express';

type AuthResult = { ok: true } | { ok: false; status: number; message: string };

// Keep the original /api prefix when dispatching to the existing Studio app.
// Mounting that app inside app.use('/api', ...) strips the prefix its routes need.
export function installProductionApi(
  app: express.Express,
  studioApi: express.Express,
  validateToken: (authorization: string | undefined) => Promise<AuthResult>,
  webOrigin = process.env.CHESS_RESULTS_WEB_ORIGIN || 'https://web.chess-publisher.org'
) {
  const allowedOrigins = new Set([webOrigin]);
  if (process.env.APP_URL) allowedOrigins.add(new URL(process.env.APP_URL).origin);
  app.use(async (req, res, next) => {
    if (!/^\/api(?:\/|$)/.test(req.path)) return next();
    if (req.path.startsWith('/api/chess-results/')) {
      res.setHeader('Cache-Control', 'no-store');
      res.vary('Origin');
      const origin = req.header('origin');
      if (origin && !allowedOrigins.has(origin)) {
        res.status(403).json({ ok: false, code: 'ORIGIN_NOT_ALLOWED', message: 'This Web origin is not allowed to publish.' });
        return;
      }
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
        res.status(204).end();
        return;
      }
    }
    try {
      const auth = await validateToken(req.header('authorization'));
      if (auth.ok === false) {
        res.status(auth.status).json({ ok: false, success: false, code: 'ORGANIZER_AUTH_REQUIRED', message: auth.message });
        return;
      }
      studioApi(req, res, next);
    } catch {
      res.status(503).json({ ok: false, code: 'ORGANIZER_AUTH_UNAVAILABLE', message: 'Organizer authentication is temporarily unavailable.' });
    }
  });
}
