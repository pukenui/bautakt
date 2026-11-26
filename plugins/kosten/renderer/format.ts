import type { ZeileBerechnet } from '../gemeinsam/typen.js';

/** 3.326.400,00 */
export function betrag(x: number | null | undefined): string {
  return x == null
    ? ''
    : x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Menge mit bis zu zwei Nachkommastellen: 1.150 / 12,5 */
export function menge(x: number | null | undefined): string {
  return x == null ? '' : x.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

export function faktor(x: number): string {
  return x.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export function prozent(teil: number | null, ganz: number): string {
  if (teil == null || !ganz) return '';
  return `${((teil / ganz) * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/** Zahl aus Eingabe („2.400,50“, „2400.5“); null bei leer, NaN bei ungültig. */
export function eingabeZahl(text: string): number | null {
  const t = text.trim().replace(/\s|€/g, '');
  if (!t) return null;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return /^-?\d*\.?\d+$/.test(normal) ? Number(normal) : Number.NaN;
}

/** Rechenweg einer Zeile als Formelzeile (keine Fließtext-Begründung). */
export function rechenweg(z: ZeileBerechnet, regionalfaktor: number): string {
  if (z.kkw_gewaehlt === null) return 'KKW gewählt fehlt';
  const teile = [`${betrag(z.kkw_gewaehlt)} €`];
  if (z.index.faktor !== 1 || z.index_modus !== 'index')
    teile.push(`× ${faktor(z.index.faktor)} (${z.index.text})`);
  if (regionalfaktor !== 1) teile.push(`× ${faktor(regionalfaktor)} (Region)`);
  let text =
    teile.length > 1
      ? `${teile.join(' ')} = ${betrag(z.kkwWirksam)} €/${einheitKurz(z.einheit)}`
      : `${betrag(z.kkwWirksam)} €/${einheitKurz(z.einheit)}`;
  if (z.mengeWirksam !== null)
    text = `${menge(z.mengeWirksam)} ${z.einheit} × ${text} = ${betrag(z.kosten)} €`;
  return text;
}

function einheitKurz(einheit: string): string {
  return einheit.trim() || 'ME';
}
