/**
 * Soll-Ist der Kosten (E-33, E-60, E-61): Stufen nach DIN 276 je KG, Aufträge und Rechnungen,
 * Prognose und Abweichung gegen eine wählbare Bezugsstufe.
 */
import { kgEltern, kgUnter } from './katalog.js';
import { kostenBaum, rundeCent } from './index.js';

export const STUFEN = ['rahmen', 'schaetzung', 'berechnung', 'anschlag', 'feststellung'] as const;
export type Stufe = (typeof STUFEN)[number];
/** Stufen, die aus der Planung festgeschrieben werden (E-60). */
export const FEST_STUFEN = ['rahmen', 'schaetzung', 'berechnung'] as const;
export type FestStufe = (typeof FEST_STUFEN)[number];

export const STUFE_TEXT: Record<Stufe, string> = {
  rahmen: 'Kostenrahmen',
  schaetzung: 'Kostenschätzung',
  berechnung: 'Kostenberechnung',
  anschlag: 'Kostenanschlag',
  feststellung: 'Kostenfeststellung',
};

export interface Betrag {
  kg: number;
  betrag: number;
}

/** Additive Summen über den KG-Baum (Ist: jeder Betrag zählt, auch auf übergeordneten KG). */
export function summenAdditiv(eintraege: readonly Betrag[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of eintraege)
    for (let k: number | null = e.kg; k !== null; k = kgEltern(k))
      m.set(k, rundeCent((m.get(k) ?? 0) + e.betrag));
  return m;
}

export interface SollIstKnoten {
  kg: number;
  stufen: Record<Stufe, number | null>;
  prognose: number | null;
  /** Prognose − Bezug */
  abweichung: number | null;
  /** Abweichung ÷ Bezug × 100 */
  abweichungProzent: number | null;
}

/**
 * Soll-Ist-Baum (E-61). Stufen 1–3 summieren wie die Planung (Untergruppen maßgebend),
 * Anschlag = Σ Aufträge, Feststellung = Σ Rechnungen (additiv). Prognose: auf den maßgebenden
 * KG der Bezugsstufe der höhere Wert aus Aufträgen und Rechnungen, wo vergeben, sonst Bezug.
 */
export function sollIstBaum(e: {
  fest: Record<FestStufe, readonly Betrag[]>;
  auftraege: readonly Betrag[];
  rechnungen: readonly Betrag[];
  bezug: Stufe;
}): Map<number, SollIstKnoten> {
  const stufenSummen: Record<Stufe, Map<number, number | null>> = {
    rahmen: new Map(),
    schaetzung: new Map(),
    berechnung: new Map(),
    anschlag: summenAdditiv(e.auftraege),
    feststellung: summenAdditiv(e.rechnungen),
  };
  for (const s of FEST_STUFEN) {
    for (const [kg, k] of kostenBaum(e.fest[s].map((b) => ({ kg: b.kg, kosten: b.betrag }))))
      stufenSummen[s].set(kg, k.summe);
  }

  // Maßgebende Einträge der Bezugsstufe (Blätter); bei Anschlag/Feststellung die Ist-Einträge selbst
  let blaetter: Betrag[];
  if (e.bezug === 'anschlag' || e.bezug === 'feststellung') {
    blaetter = [...(e.bezug === 'anschlag' ? e.auftraege : e.rechnungen)];
  } else {
    const baum = kostenBaum(e.fest[e.bezug].map((b) => ({ kg: b.kg, kosten: b.betrag })));
    blaetter = [...baum.values()]
      .filter((k) => !k.ausUnterzeilen && k.summe !== null)
      .map((k) => ({ kg: k.kg, betrag: k.summe as number }));
  }

  // Ist (Aufträge, Rechnungen) dem nächsten Blatt zuordnen (gleich oder darunter), sonst eigener Posten
  const posten = new Map<number, { bezug: number; auftraege: number; rechnungen: number }>();
  for (const b of blaetter) posten.set(b.kg, { bezug: b.betrag, auftraege: 0, rechnungen: 0 });
  const zuordnen = (x: Betrag, feld: 'auftraege' | 'rechnungen') => {
    const blatt = blaetter.find((b) => b.kg === x.kg || kgUnter(x.kg, b.kg));
    const kg = blatt?.kg ?? x.kg;
    const p = posten.get(kg) ?? { bezug: 0, auftraege: 0, rechnungen: 0 };
    p[feld] = rundeCent(p[feld] + x.betrag);
    posten.set(kg, p);
  };
  for (const a of e.auftraege) zuordnen(a, 'auftraege');
  for (const r of e.rechnungen) zuordnen(r, 'rechnungen');
  const prognose = summenAdditiv(
    [...posten].map(([kg, p]) => {
      const ist = Math.max(p.auftraege, p.rechnungen);
      return { kg, betrag: ist > 0 ? ist : p.bezug };
    }),
  );

  const alle = new Set<number>([...prognose.keys()]);
  for (const s of STUFEN) for (const kg of stufenSummen[s].keys()) alle.add(kg);
  const ergebnis = new Map<number, SollIstKnoten>();
  for (const kg of [...alle].sort((a, b) => a - b)) {
    const stufen = Object.fromEntries(
      STUFEN.map((s) => [s, stufenSummen[s].get(kg) ?? null]),
    ) as Record<Stufe, number | null>;
    const p = prognose.get(kg) ?? null;
    const bezug = stufen[e.bezug];
    const abweichung = p !== null && bezug !== null ? rundeCent(p - bezug) : null;
    ergebnis.set(kg, {
      kg,
      stufen,
      prognose: p,
      abweichung,
      abweichungProzent:
        abweichung !== null && bezug ? Math.round((abweichung / bezug) * 1000) / 10 : null,
    });
  }
  return ergebnis;
}

/** Ursachen für Kostenabweichungen (E-63). */
export const KOSTEN_URSACHEN = {
  planungsaenderung: 'Planungsänderung',
  nutzerwunsch: 'Nutzerwunsch/Nachtrag',
  menge: 'Mengenänderung',
  markt: 'Marktpreise/Ausschreibung',
  baugrund: 'Baugrund/Bestand',
  behoerde: 'Behördenauflage',
  sonstiges: 'Sonstiges',
} as const;
export type KostenUrsache = keyof typeof KOSTEN_URSACHEN;
