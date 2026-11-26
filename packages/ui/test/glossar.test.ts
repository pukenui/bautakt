import { describe, expect, it } from 'vitest';
import { GLOSSAR, begriffeFinden, glossarEintrag } from '../src/glossar.js';

describe('Glossar (E-29, E-83)', () => {
  it('enthält die Normbegriffe aus CLAUDE.md', () => {
    for (const k of [
      'FAZ',
      'FEZ',
      'SAZ',
      'SEZ',
      'GP',
      'FP',
      'EA',
      'AA',
      'EE',
      'AE',
      'AT',
      'KT',
      'KG',
      'BGF',
      'NUF',
      'NRF',
      'TF',
      'VF',
      'KGF',
      'AF',
      'GF',
      'KKW',
    ])
      expect(glossarEintrag(k), k).toBeDefined();
  });

  it('hat eindeutige Begriffe und Nebenformen', () => {
    const formen = GLOSSAR.flatMap((e) =>
      [e.begriff, ...(e.auch ?? [])].map((f) => f.toLowerCase()),
    );
    expect(new Set(formen).size).toBe(formen.length);
  });

  it('findet Nebenformen ohne Rücksicht auf Groß-/Kleinschreibung', () => {
    expect(glossarEintrag('gesamtpuffer')?.begriff).toBe('GP');
    expect(glossarEintrag('Kostengruppen')?.begriff).toBe('KG');
  });

  it('erkennt Begriffe nur als ganze Wörter, längere zuerst', () => {
    const t = begriffeFinden(
      'Der Regionalfaktor und der Faktor; Vorgänger sind keine Vorgänge, GP > 0.',
    );
    expect(t.map((x) => x.eintrag.begriff)).toEqual(['Regionalfaktor', 'Faktor', 'Vorgang', 'GP']);
  });

  it('erkennt Abkürzungen nur in Großbuchstaben', () => {
    expect(begriffeFinden('Am Ende (ae) steht AE.').map((x) => x.eintrag.begriff)).toEqual(['AE']);
  });

  it('bevorzugt den längeren Begriff bei Überlappung', () => {
    const t = begriffeFinden('Den kritischen Weg zeigt der Plan rot.');
    expect(t).toHaveLength(1);
    expect(t[0]?.eintrag.begriff).toBe('Kritischer Weg');
  });
});
