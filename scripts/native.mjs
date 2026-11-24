// Lädt das vorkompilierte better-sqlite3-Binary passend zur Electron-Version (postinstall).
// Ohne Visual-Studio-Buildtools ist das der einzige Weg; deshalb ist Electron auf eine
// Version festgelegt, für die better-sqlite3 Prebuilds veröffentlicht (siehe docs/architektur.md).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(wurzel, 'apps/desktop/package.json'));
const electronVersion = require('electron/package.json').version;
const sqliteDir = path.dirname(require.resolve('better-sqlite3/package.json'));
const prebuild = createRequire(path.join(sqliteDir, 'package.json')).resolve(
  'prebuild-install/bin.js',
);

// Electron-Binary sicherstellen (falls das Install-Skript von electron nicht lief)
const electronDir = path.dirname(require.resolve('electron/package.json'));
if (!fs.existsSync(path.join(electronDir, 'path.txt'))) {
  console.log(`electron: lade Electron ${electronVersion} …`);
  spawnSync(process.execPath, ['install.js'], { cwd: electronDir, stdio: 'inherit' });
}

console.log(`better-sqlite3: lade Binary für Electron ${electronVersion} …`);
const r = spawnSync(
  process.execPath,
  [prebuild, '--runtime=electron', `--target=${electronVersion}`, '--arch=x64', '--force'],
  { cwd: sqliteDir, stdio: 'inherit' },
);
const binary = path.join(sqliteDir, 'build', 'Release', 'better_sqlite3.node');
if (r.status !== 0 || !fs.existsSync(binary)) {
  console.error('better-sqlite3: kein Prebuild gefunden. Electron-Version prüfen.');
  process.exit(1);
}
console.log('better-sqlite3: fertig.');
