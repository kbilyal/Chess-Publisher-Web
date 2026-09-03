import express from 'express';
import path from 'path';

async function main() {
  // Import the existing application without allowing server.ts to bind its fixed dev port.
  const requestedNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const { app } = await import('./server');
  process.env.NODE_ENV = requestedNodeEnv || 'production';

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
