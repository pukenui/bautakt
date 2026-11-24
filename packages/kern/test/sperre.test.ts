import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPERRE_VERWAIST_NACH_MS, sperreAktiv, sperreErwerben, sperrPfad } from '../src/index.js';
import { tempOrdner } from './hilfen.js';

describe('Sperre (Lock-Datei, E-41)', () => {
  it('legt die Lock-Datei an und entfernt sie beim Freigeben', () => {
    const datei = path.join(tempOrdner(), 'a.bautakt');
    const r = sperreErwerben(datei);
    expect(r.status).toBe('erworben');
    const info = JSON.parse(fs.readFileSync(sperrPfad(datei), 'utf8'));
    expect(info).toMatchObject({ pid: process.pid, rechner: os.hostname() });
    if (r.status === 'erworben') r.sperre.freigeben();
    expect(fs.existsSync(sperrPfad(datei))).toBe(false);
  });

  it('meldet „belegt“, wenn ein anderer lebender Prozess sperrt', () => {
    const datei = path.join(tempOrdner(), 'a.bautakt');
    const fremd = { pid: process.ppid, rechner: os.hostname(), zeit: new Date().toISOString() };
    fs.writeFileSync(sperrPfad(datei), JSON.stringify(fremd));
    const r = sperreErwerben(datei);
    expect(r.status).toBe('belegt');
    if (r.status === 'belegt') expect(r.info.pid).toBe(process.ppid);
  });

  it('übernimmt verwaiste Sperren (Prozess beendet, unlesbar, anderer Rechner zu alt)', () => {
    const o = tempOrdner();
    const faelle = [
      { pid: 999_999_9, rechner: os.hostname(), zeit: new Date().toISOString() },
      'kein json',
      {
        pid: 1,
        rechner: 'ANDERER-PC',
        zeit: new Date(Date.now() - SPERRE_VERWAIST_NACH_MS - 1000).toISOString(),
      },
    ];
    faelle.forEach((inhalt, i) => {
      const datei = path.join(o, `${i}.bautakt`);
      fs.writeFileSync(
        sperrPfad(datei),
        typeof inhalt === 'string' ? inhalt : JSON.stringify(inhalt),
      );
      const r = sperreErwerben(datei);
      expect(r.status).toBe('erworben');
      if (r.status === 'erworben') r.sperre.freigeben();
    });
  });

  it('behandelt frische Sperren anderer Rechner als aktiv', () => {
    expect(sperreAktiv({ pid: 1, rechner: 'ANDERER-PC', zeit: new Date().toISOString() })).toBe(
      true,
    );
  });

  it('gibt eine fremde Sperre beim Freigeben nicht frei', () => {
    const datei = path.join(tempOrdner(), 'a.bautakt');
    const r = sperreErwerben(datei);
    if (r.status !== 'erworben') throw new Error('erwartet: erworben');
    fs.writeFileSync(
      sperrPfad(datei),
      JSON.stringify({ pid: process.ppid, rechner: os.hostname(), zeit: '' }),
    );
    r.sperre.freigeben();
    expect(fs.existsSync(sperrPfad(datei))).toBe(true);
  });
});
