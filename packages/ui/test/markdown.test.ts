import { describe, expect, it } from 'vitest';
import { zerlegen } from '../src/markdown.js';

describe('Markdown der Hilfetexte (E-29)', () => {
  it('erkennt Überschriften, Absätze, Listen, Tabellen und Code', () => {
    const b = zerlegen(
      [
        '# Terminplan',
        'Erster Satz',
        'geht weiter.',
        '',
        '1. eins',
        '2. zwei',
        '   Fortsetzung',
        '- Punkt',
        '',
        '| Kürzel | Wirkung |',
        '|---|---|',
        '| F1 | Hilfe |',
        '',
        '```',
        '1EA+10',
        '```',
      ].join('\n'),
    );
    expect(b).toEqual([
      { art: 'ueberschrift', ebene: 1, text: 'Terminplan' },
      { art: 'absatz', text: 'Erster Satz geht weiter.' },
      { art: 'liste', geordnet: true, punkte: ['eins', 'zwei Fortsetzung'] },
      { art: 'liste', geordnet: false, punkte: ['Punkt'] },
      { art: 'tabelle', kopf: ['Kürzel', 'Wirkung'], zeilen: [['F1', 'Hilfe']] },
      { art: 'code', text: '1EA+10' },
    ]);
  });
});
