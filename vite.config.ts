import fs from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function copyBrowserFideAssets(): Plugin {
  return {
    name: 'copy-browser-fide-assets',
    closeBundle() {
      const outputRoot = path.resolve(__dirname, 'dist');
      const fideSource = path.resolve(__dirname, 'data/fide/fide_ratings.sqlite');
      const wasmSource = path.resolve(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm');
      const fideTarget = path.join(outputRoot, 'fide/fide_ratings.sqlite');
      const wasmTarget = path.join(outputRoot, 'vendor/sql-wasm.wasm');

      if (!fs.existsSync(fideSource)) throw new Error(`Missing browser FIDE database: ${fideSource}`);
      if (!fs.existsSync(wasmSource)) throw new Error(`Missing sql.js WASM runtime: ${wasmSource}`);

      fs.mkdirSync(path.dirname(fideTarget), { recursive: true });
      fs.mkdirSync(path.dirname(wasmTarget), { recursive: true });
      fs.copyFileSync(fideSource, fideTarget);
      fs.copyFileSync(wasmSource, wasmTarget);
    }
  };
}

export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), copyBrowserFideAssets()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
}));
