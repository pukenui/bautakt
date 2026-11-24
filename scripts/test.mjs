// Startet Vitest mit der Node-Laufzeit von Electron (ELECTRON_RUN_AS_NODE).
// Grund: better-sqlite3 ist ein natives Modul und liegt nur einmal – für Electron gebaut – vor.
// So testen wir mit genau der Laufzeit, die auch die App verwendet.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(wurzel, 'apps/desktop/package.json'));
const electron = require('electron'); // liefert den Pfad zur electron.exe
const vitest = path.join(wurzel, 'node_modules', 'vitest', 'vitest.mjs');

const args = process.argv.slice(2);
const modus = args.includes('--watch') ? [] : ['run'];
const ergebnis = spawnSync(electron, [vitest, ...modus, ...args.filter((a) => a !== '--watch')], {
  cwd: wurzel,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
process.exit(ergebnis.status ?? 1);
