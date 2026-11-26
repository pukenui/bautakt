/**
 * Aufwandswert-Rechner (E-24, E-53): Dauer [AT] = Menge × AW [h/ME] × (1 + Σ Zu-/Abschläge)
 * ÷ (AK × h/AT), aufgerundet auf ganze AT. Ergebnis enthält den Rechenweg als Formelzeile –
 * nie Fließtext.
 */

/** Benannter Zu- (+) oder Abschlag (−) in Prozent, z. B. { name: 'Winterbau', prozent: 15 }. */
export interface Zuschlag {
  name: string;
  prozent: number;
}

export interface AufwandEingabe {
  /** Menge in Mengeneinheiten (ME), z. B. 650 */
  menge: number;
  /** Mengeneinheit, z. B. „m²“ oder „Stk“ */
  einheit: string;
  /** Aufwandswert in h/ME */
  aw: number;
  /** Arbeitskräfte der Kolonne */
  ak: number;
  /** Arbeitsstunden je Arbeitstag und Arbeitskraft */
  hJeAt: number;
  zuschlaege: readonly Zuschlag[];
}

export interface AufwandErgebnis {
  /** Menge × AW */
  lohnstunden: number;
  /** 1 + Σ Prozent / 100 */
  faktor: number;
  /** Lohnstunden × Faktor */
  stunden: number;
  /** AK × h/AT */
  stundenJeAt: number;
  /** Stunden ÷ (AK × h/AT), ungerundet */
  dauerExakt: number;
  /** Aufgerundet auf ganze AT */
  dauer: number;
  /** Rechenweg, z. B. `650 m² × 0,50 h/m² = 325 h ÷ (4 × 8 h) = 10,2 → 11 AT` */
  formel: string;
}

/** Ungültige Eingabe; die Meldung ist für die Oberfläche bestimmt. */
export class AufwandFehler extends Error {}

/** Toleranz gegen Gleitkomma-Reste (z. B. 10,000000001 soll nicht auf 11 aufrunden). */
const EPSILON = 1e-9;

/** Deutsches Zahlformat mit Tausenderpunkt; `min`–`max` Nachkommastellen, Nullen am Ende entfallen bis `min`. */
export function zahlDeutsch(n: number, min = 0, max = 2): string {
  const negativ = n < 0;
  let text = Math.abs(n).toFixed(max);
  if (max > min) {
    // überzählige Nullen bis auf `min` Stellen entfernen
    const [ganz = '0', bruch = ''] = text.split('.');
    let b = bruch;
    while (b.length > min && b.endsWith('0')) b = b.slice(0, -1);
    text = b ? `${ganz}.${b}` : ganz;
  }
  const [ganz = '0', bruch] = text.split('.');
  const gruppiert = ganz.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const ergebnis = bruch ? `${gruppiert},${bruch}` : gruppiert;
  return negativ && Number(text) !== 0 ? `−${ergebnis}` : ergebnis;
}

/**
 * Zahl aus einer Eingabe lesen: „1.250,5“ und „0,5“ (deutsch) sowie „0.5“; NaN, wenn ungültig.
 * Mit Komma gelten Punkte als Tausendertrenner, ohne Komma ist der Punkt das Dezimalzeichen.
 */
export function zahlLesen(text: string): number {
  const t = text.trim().replace(/\s/g, '');
  if (!t) return Number.NaN;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return /^-?\d*\.?\d+$/.test(normal) ? Number(normal) : Number.NaN;
}

/** Exakte Dauer mit einer Nachkommastelle – zwei, wenn eine Stelle eine ganze Zahl vortäuscht. */
function exaktText(x: number): string {
  const eine = zahlDeutsch(x, 1, 1);
  const ganzzahlig = Math.abs(x - Math.round(x)) < EPSILON;
  if (!ganzzahlig && Math.abs(Number(x.toFixed(1)) - Math.round(x)) < EPSILON)
    return zahlDeutsch(x, 2, 2);
  return eine;
}

function pruefen(e: AufwandEingabe): void {
  const positiv = (wert: number, name: string) => {
    if (!Number.isFinite(wert) || wert <= 0)
      throw new AufwandFehler(`${name} muss größer als 0 sein.`);
  };
  positiv(e.menge, 'Die Menge');
  positiv(e.aw, 'Der Aufwandswert');
  positiv(e.ak, 'Die Zahl der Arbeitskräfte');
  positiv(e.hJeAt, 'Die Arbeitszeit je Tag');
  if (e.hJeAt > 24) throw new AufwandFehler('Die Arbeitszeit je Tag kann höchstens 24 h betragen.');
  if (!e.einheit.trim()) throw new AufwandFehler('Die Mengeneinheit fehlt.');
  for (const z of e.zuschlaege) {
    if (!z.name.trim()) throw new AufwandFehler('Jeder Zu-/Abschlag braucht einen Namen.');
    if (!Number.isFinite(z.prozent) || z.prozent === 0)
      throw new AufwandFehler(`Zu-/Abschlag „${z.name}“: Prozentwert fehlt.`);
  }
}

/** Rechnet die Dauer und erzeugt die Formelzeile (Referenztest R-09). */
export function aufwandRechnen(e: AufwandEingabe): AufwandErgebnis {
  pruefen(e);
  const einheit = e.einheit.trim();
  const lohnstunden = e.menge * e.aw;
  const summe = e.zuschlaege.reduce((s, z) => s + z.prozent, 0);
  const faktor = 1 + summe / 100;
  if (faktor <= 0) throw new AufwandFehler('Die Abschläge sind zusammen 100 % oder mehr.');
  const stunden = lohnstunden * faktor;
  const stundenJeAt = e.ak * e.hJeAt;
  const dauerExakt = stunden / stundenJeAt;
  const dauer = Math.max(1, Math.ceil(dauerExakt - EPSILON));

  let formel =
    `${zahlDeutsch(e.menge)} ${einheit} × ${zahlDeutsch(e.aw, 2, 3)} h/${einheit}` +
    ` = ${zahlDeutsch(lohnstunden)} h`;
  if (e.zuschlaege.length) {
    const teile = e.zuschlaege
      .map(
        (z) =>
          `${z.prozent < 0 ? '−' : '+'} ${zahlDeutsch(Math.abs(z.prozent))} % ${z.name.trim()}`,
      )
      .join(' ');
    formel += ` × (1 ${teile}) = ${zahlDeutsch(stunden)} h`;
  }
  formel += ` ÷ (${zahlDeutsch(e.ak)} × ${zahlDeutsch(e.hJeAt)} h) = ${exaktText(dauerExakt)} → ${dauer} AT`;

  return { lohnstunden, faktor, stunden, stundenJeAt, dauerExakt, dauer, formel };
}

/** Standard-Zu-/Abschläge zur Auswahl im Rechner (Werte trägt der Nutzer selbst ein). */
export const ZUSCHLAG_VORSCHLAEGE = ['Einarbeitung', 'Wiederholeffekt', 'Witterung', 'Winterbau'];
