import type { PluginDb } from '@bautakt/kern';
import {
  kgEbene,
  kostengruppe,
  rundeCent,
  sollIstBaum,
  STUFEN,
  type FestStufe,
  type Stufe,
} from '@bautakt/rechnen-kosten';
import fs from 'node:fs';
import type {
  AbweichungZeile,
  AuftragZeile,
  RechnungZeile,
  SollIstDaten,
  StufeZeile,
} from '../gemeinsam/typen.js';

const anhangFehlt = (p: string | null) => !!p && !fs.existsSync(p);

/** Soll-Ist der Kosten (E-33, E-60–E-63), bei jeder Abfrage neu gerechnet. */
export function sollIstLaden(db: PluginDb, bezug: Stufe): SollIstDaten {
  const stufen = db.lesen<StufeZeile>('SELECT * FROM k_stufe ORDER BY kg');
  const auftraege = db.lesen<AuftragZeile>('SELECT * FROM k_auftrag ORDER BY kg, datum, beleg_nr');
  const rechnungen = db.lesen<RechnungZeile>(
    'SELECT * FROM k_rechnung ORDER BY kg, datum, beleg_nr',
  );
  const ursachen = new Map(
    db.lesen<AbweichungZeile>('SELECT * FROM k_abweichung').map((a) => [a.kg, a]),
  );
  const fest = (s: FestStufe) =>
    stufen.filter((x) => x.stufe === s).map((x) => ({ kg: x.kg, betrag: x.betrag_netto }));
  const baum = sollIstBaum({
    fest: {
      rahmen: fest('rahmen'),
      schaetzung: fest('schaetzung'),
      berechnung: fest('berechnung'),
    },
    auftraege: auftraege.map((a) => ({ kg: a.kg, betrag: a.betrag_netto })),
    rechnungen: rechnungen.map((r) => ({ kg: r.kg, betrag: r.betrag_netto })),
    bezug,
  });

  const zeilen = [...baum.values()].map((k) => ({
    ...k,
    ebene: kgEbene(k.kg),
    bezeichnung: kostengruppe(k.kg)?.bezeichnung ?? '',
    vonHand: stufen.filter((s) => s.kg === k.kg && s.herkunft === 'hand').map((s) => s.stufe),
    ursache: ursachen.get(k.kg)?.ursache ?? null,
    ursacheText: ursachen.get(k.kg)?.text ?? '',
  }));

  const summe = (f: (z: (typeof zeilen)[number]) => number | null) => {
    const werte = zeilen.filter((z) => z.ebene === 1).map(f);
    return werte.some((w) => w !== null)
      ? rundeCent(werte.reduce<number>((s, w) => s + (w ?? 0), 0))
      : null;
  };
  const gesamtStufen = Object.fromEntries(
    STUFEN.map((s) => [s, summe((z) => z.stufen[s])]),
  ) as SollIstDaten['gesamt']['stufen'];
  const prognose = summe((z) => z.prognose);
  const b = gesamtStufen[bezug];
  const abweichung = prognose !== null && b !== null ? rundeCent(prognose - b) : null;

  const festgeschrieben = { rahmen: null, schaetzung: null, berechnung: null } as Record<
    FestStufe,
    string | null
  >;
  for (const s of stufen)
    if (
      s.herkunft === 'planung' &&
      (!festgeschrieben[s.stufe] || s.zeit > (festgeschrieben[s.stufe] ?? ''))
    )
      festgeschrieben[s.stufe] = s.zeit;

  const abgerechnet = new Map<string, number>();
  for (const r of rechnungen)
    if (r.auftrag_id)
      abgerechnet.set(
        r.auftrag_id,
        rundeCent((abgerechnet.get(r.auftrag_id) ?? 0) + r.betrag_netto),
      );

  return {
    bezug,
    zeilen,
    festgeschrieben,
    auftraege: auftraege.map((a) => {
      const ab = abgerechnet.get(a.id) ?? 0;
      return {
        ...a,
        abgerechnet: ab,
        offen: rundeCent(a.betrag_netto - ab),
        anhangFehlt: anhangFehlt(a.anhang),
      };
    }),
    rechnungen: rechnungen.map((r) => ({ ...r, anhangFehlt: anhangFehlt(r.anhang) })),
    gesamt: {
      stufen: gesamtStufen,
      prognose,
      abweichung,
      abweichungProzent: abweichung !== null && b ? Math.round((abweichung / b) * 1000) / 10 : null,
    },
  };
}
