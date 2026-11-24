import fs from 'node:fs';
import os from 'node:os';
import { jetztUtc } from './id.js';

/** Inhalt der Lock-Datei `<name>.bautakt.lock` (E-41). */
export interface SperrInfo {
  pid: number;
  rechner: string;
  zeit: string; // UTC, wird beim Autosave aufgefrischt
}

export type SperrErgebnis =
  { status: 'erworben'; sperre: Sperre } | { status: 'belegt'; info: SperrInfo };

export interface Sperre {
  readonly pfad: string;
  auffrischen(): void;
  freigeben(): void;
}

/** Eine Sperre eines anderen Rechners gilt nach dieser Zeit ohne Auffrischung als verwaist. */
export const SPERRE_VERWAIST_NACH_MS = 10 * 60 * 1000;

export function sperrPfad(dateipfad: string): string {
  return `${dateipfad}.lock`;
}

function prozessLebt(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: Prozess existiert, gehört aber einem anderen Benutzer
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function lesen(pfad: string): SperrInfo | undefined {
  try {
    const info = JSON.parse(fs.readFileSync(pfad, 'utf8')) as Partial<SperrInfo>;
    if (typeof info.pid !== 'number' || typeof info.rechner !== 'string') return undefined;
    return { pid: info.pid, rechner: info.rechner, zeit: String(info.zeit ?? '') };
  } catch {
    return undefined;
  }
}

/** Ist die vorhandene Sperre noch aktiv? Unlesbare oder verwaiste Sperren gelten als frei. */
export function sperreAktiv(info: SperrInfo | undefined, jetzt = Date.now()): boolean {
  if (!info) return false;
  if (info.rechner === os.hostname()) {
    return info.pid !== process.pid && prozessLebt(info.pid);
  }
  const zeit = Date.parse(info.zeit);
  return Number.isFinite(zeit) && jetzt - zeit < SPERRE_VERWAIST_NACH_MS;
}

/** Versucht, die Projektdatei exklusiv zu sperren. */
export function sperreErwerben(dateipfad: string): SperrErgebnis {
  const pfad = sperrPfad(dateipfad);
  const eigene = (): SperrInfo => ({ pid: process.pid, rechner: os.hostname(), zeit: jetztUtc() });

  for (let versuch = 0; versuch < 2; versuch++) {
    try {
      // 'wx' = nur anlegen, wenn nicht vorhanden (atomar)
      fs.writeFileSync(pfad, JSON.stringify(eigene()), { flag: 'wx' });
      return { status: 'erworben', sperre: erzeugeSperre(pfad, eigene) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const info = lesen(pfad);
      if (info && sperreAktiv(info)) return { status: 'belegt', info };
      fs.rmSync(pfad, { force: true }); // verwaist → übernehmen
    }
  }
  // Zweimal verloren (gleichzeitiges Öffnen) → als belegt behandeln
  return { status: 'belegt', info: lesen(pfad) ?? { pid: 0, rechner: 'unbekannt', zeit: '' } };
}

function erzeugeSperre(pfad: string, eigene: () => SperrInfo): Sperre {
  let frei = false;
  return {
    pfad,
    auffrischen() {
      if (!frei) fs.writeFileSync(pfad, JSON.stringify(eigene()));
    },
    freigeben() {
      if (frei) return;
      frei = true;
      const info = lesen(pfad);
      if (info && info.pid === process.pid && info.rechner === os.hostname()) {
        fs.rmSync(pfad, { force: true });
      }
    },
  };
}
