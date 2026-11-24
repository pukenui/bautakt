/**
 * Reine Kalenderdaten ohne Uhrzeit und Zeitzone. Ein Datum ist ein ISO-String „JJJJ-MM-TT“;
 * intern wird mit Tagesnummern gerechnet (Tage seit 01.01.1970), damit Sommerzeit keine Rolle spielt.
 */

const MS_JE_TAG = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export class DatumFehler extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatumFehler';
  }
}

/** „JJJJ-MM-TT“ → Tagesnummer. Ungültige Daten (z. B. 2027-02-30) werden abgelehnt. */
export function tagVonDatum(datum: string): number {
  const m = ISO.exec(datum);
  if (!m) throw new DatumFehler(`Ungültiges Datum „${datum}“ (erwartet JJJJ-MM-TT).`);
  const [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(j, mo - 1, t);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== j || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== t) {
    throw new DatumFehler(`Ungültiges Datum „${datum}“.`);
  }
  return Math.round(ms / MS_JE_TAG);
}

/** Tagesnummer → „JJJJ-MM-TT“. */
export function datumVonTag(tag: number): string {
  return new Date(tag * MS_JE_TAG).toISOString().slice(0, 10);
}

export function datumAusTeilen(jahr: number, monat: number, tag: number): string {
  return datumVonTag(Math.round(Date.UTC(jahr, monat - 1, tag) / MS_JE_TAG));
}

/** Wochentag nach ISO: 1 = Montag … 7 = Sonntag. */
export function wochentag(tag: number): number {
  // 01.01.1970 (Tag 0) war ein Donnerstag
  return ((((tag + 3) % 7) + 7) % 7) + 1;
}

export const WOCHENTAG_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

/** „JJJJ-MM-TT“ → „TT.MM.JJJJ“. */
export function datumDeutsch(datum: string): string {
  tagVonDatum(datum);
  return `${datum.slice(8, 10)}.${datum.slice(5, 7)}.${datum.slice(0, 4)}`;
}

/** „TT.MM.JJJJ“ (auch T.M.JJJJ) → „JJJJ-MM-TT“. */
export function datumAusDeutsch(text: string): string {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/.exec(text);
  if (!m) throw new DatumFehler(`Ungültiges Datum „${text}“ (erwartet TT.MM.JJJJ).`);
  const iso = `${m[3]}-${(m[2] ?? '').padStart(2, '0')}-${(m[1] ?? '').padStart(2, '0')}`;
  tagVonDatum(iso);
  return iso;
}

/** Kalenderwoche nach ISO 8601. */
export function isoKalenderwoche(datum: string): { jahr: number; woche: number } {
  const tag = tagVonDatum(datum);
  // Donnerstag derselben Woche bestimmt das Jahr
  const donnerstag = tag - wochentag(tag) + 4;
  const jahr = Number(datumVonTag(donnerstag).slice(0, 4));
  const ersterJanuar = tagVonDatum(`${jahr}-01-01`);
  return { jahr, woche: Math.floor((donnerstag - ersterJanuar) / 7) + 1 };
}
