import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const version = (
  JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }
).version;

// Extern bleiben nur die `dependencies` dieses Pakets (better-sqlite3, natives Modul).
// Workspace-Pakete sind devDependencies, liegen als TypeScript vor und werden mitgebündelt.
export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(version) },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
    },
  },
});
