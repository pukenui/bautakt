import { datumAusTeilen, datumVonTag, tagVonDatum } from './datum.js';

export interface Feiertag {
  datum: string; // JJJJ-MM-TT
  name: string;
}

/** Ostersonntag nach dem anonymen gregorianischen Algorithmus (Gauß, in der Fassung von Meeus). */
export function ostersonntag(jahr: number): string {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return datumAusTeilen(jahr, monat, tag);
}

/** Gesetzliche Feiertage in Nordrhein-Westfalen (Architektur 5.5). */
export function feiertageNW(jahr: number): Feiertag[] {
  const ostern = tagVonDatum(ostersonntag(jahr));
  const relativ = (tage: number) => datumVonTag(ostern + tage);
  const fest = (monat: number, tag: number) => datumAusTeilen(jahr, monat, tag);
  return [
    { datum: fest(1, 1), name: 'Neujahr' },
    { datum: relativ(-2), name: 'Karfreitag' },
    { datum: relativ(1), name: 'Ostermontag' },
    { datum: fest(5, 1), name: 'Tag der Arbeit' },
    { datum: relativ(39), name: 'Christi Himmelfahrt' },
    { datum: relativ(50), name: 'Pfingstmontag' },
    { datum: relativ(60), name: 'Fronleichnam' },
    { datum: fest(10, 3), name: 'Tag der Deutschen Einheit' },
    { datum: fest(11, 1), name: 'Allerheiligen' },
    { datum: fest(12, 25), name: '1. Weihnachtstag' },
    { datum: fest(12, 26), name: '2. Weihnachtstag' },
  ].sort((x, y) => x.datum.localeCompare(y.datum));
}

export type Bundesland = 'NW';

export function feiertage(bundesland: Bundesland, jahr: number): Feiertag[] {
  switch (bundesland) {
    case 'NW':
      return feiertageNW(jahr);
  }
}
