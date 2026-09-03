import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const HUB_API_TARGET = 'https://chess-publisher-hub-api-beta.kyamranbilyal.workers.dev';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // AI Studio Preview runs in a randomized scf.usercontent.goog sandbox.
      // Proxy Cloud Workspace calls through the same-origin Vite server so
      // the browser does not depend on cross-origin CORS behavior in Preview.
      proxy: {
        '/hub-api': {
          target: HUB_API_TARGET,
          changeOrigin: true,
          secure: true,
          rewrite: (requestPath) => requestPath.replace(/^\/hub-api/, ''),
        },
      },
    },
  };
});
