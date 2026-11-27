import { BautaktFehler } from '@bautakt/kern';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ClaudeApi } from './api.js';

/*
 * Anbindung an die App (E-100): Datenordner und die Verschlüsselung des Betriebssystems
 * (Electron safeStorage) stellt der Desktop-Main bereit. Der API-Schlüssel liegt verschlüsselt
 * in `claude.json` im App-Datenordner, nie in der Projektdatei.
 */
export interface ClaudeHost {
  ordner: string;
  verschluesselungVerfuegbar: boolean;
  verschluesseln(text: string): string;
  entschluesseln(geheim: string): string;
  /** API-Anbindung aus dem Schlüssel (Tests: simulierte Sitzung) */
  api(apiKey: string): ClaudeApi;
  /** simulierte Sitzung statt Anthropic (nur Tests und Entwicklung) */
  simuliert?: boolean;
}

let host: ClaudeHost | null = null;

/** Vom Desktop-Main beim Start aufrufen (bzw. in Tests). */
export function claudeHostEinrichten(h: ClaudeHost | null): void {
  host = h;
}

export function holeHost(): ClaudeHost {
  if (!host) throw new BautaktFehler('PLUGIN', 'Claude ist in dieser Umgebung nicht eingerichtet.');
  return host;
}

export function hostVorhanden(): boolean {
  return host !== null;
}

/** Gespeicherter Zustand (`claude.json`). */
export interface ClaudeSpeicher {
  /** verschlüsselter API-Schlüssel */
  schluessel?: string;
  /** Agent und Umgebung bei Anthropic, je Schlüssel (Fingerabdruck) */
  agent?: {
    fingerabdruck: string;
    agentId: string;
    version: number;
    konfigHash: string;
    umgebungId: string;
  };
  /** je Projekt: Zustimmung (E-100) und Sitzung (E-99) */
  projekte: Record<string, { zustimmung: boolean; sitzungId?: string }>;
}

const datei = () => path.join(holeHost().ordner, 'claude.json');

export function speicherLesen(): ClaudeSpeicher {
  try {
    const s = JSON.parse(fs.readFileSync(datei(), 'utf8')) as ClaudeSpeicher;
    return { ...s, projekte: s.projekte ?? {} };
  } catch {
    return { projekte: {} };
  }
}

export function speicherAendern(fn: (s: ClaudeSpeicher) => void): ClaudeSpeicher {
  const s = speicherLesen();
  fn(s);
  fs.mkdirSync(path.dirname(datei()), { recursive: true });
  fs.writeFileSync(datei(), JSON.stringify(s, null, 2));
  return s;
}

export const fingerabdruck = (schluessel: string) =>
  createHash('sha256').update(schluessel).digest('hex').slice(0, 16);

/** Entschlüsselter API-Schlüssel oder null. */
export function apiSchluessel(): string | null {
  const s = speicherLesen().schluessel;
  if (!s) return null;
  try {
    return holeHost().entschluesseln(s);
  } catch {
    return null;
  }
}
