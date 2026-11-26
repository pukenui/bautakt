import type { PluginDb } from '@bautakt/kern';
import {
  flaechenAbleiten,
  euro,
  indexfaktor,
  kgEbene,
  kkwWirksam,
  kostenBaum,
  kostengruppe,
  rundeCent,
  steuer,
  zeilenkosten,
  type FlaecheEingabe,
} from '@bautakt/rechnen-kosten';
import type {
  EinstellungZeile,
  FlaecheZeile,
  KnotenDaten,
  KostenDaten,
  KostenZeile,
  ZeileBerechnet,
} from '../gemeinsam/typen.js';

export function einstellungLesen(db: PluginDb): EinstellungZeile {
  const e = db.eins<EinstellungZeile>('SELECT * FROM k_einstellung LIMIT 1');
  if (!e) throw new Error('Die Kosteneinstellungen fehlen in der Projektdatei.');
  return e;
}

/**
 * Kostendaten mit allen Rechenergebnissen (E-15, E-16, E-56–E-58). Berechnet wird bei jeder
 * Abfrage, gespeichert werden nur Eingaben.
 */
export function kostenDatenLaden(
  db: PluginDb,
  kennwertVersion?: (id: string) => number | null,
): KostenDaten {
  const einstellung = einstellungLesen(db);
  const fl = db.lesen<FlaecheZeile>('SELECT * FROM k_flaeche');
  const eingaben: Partial<Record<FlaecheEingabe, number | null>> = {};
  const flaechenQuelle: Partial<Record<FlaecheEingabe, string>> = {};
  for (const f of fl) {
    eingaben[f.kategorie] = f.wert_m2;
    flaechenQuelle[f.kategorie] = f.quelle;
  }
  const flaechen = flaechenAbleiten(eingaben);

  const zeilen: ZeileBerechnet[] = db
    .lesen<KostenZeile>('SELECT * FROM k_zeile ORDER BY kg')
    .map((z) => {
      const hinweise: string[] = [];
      const mengeWirksam =
        z.menge_quelle === 'flaeche' && z.flaeche ? (flaechen[z.flaeche] ?? null) : z.menge;
      if (z.menge_quelle === 'flaeche' && z.flaeche && mengeWirksam === null)
        hinweise.push(`Fläche ${z.flaeche} ist noch nicht eingetragen.`);
      const index = indexfaktor({
        modus: z.index_modus,
        indexStand: z.kkw_stand_index,
        indexAktuell: einstellung.index_aktuell,
        eigenerFaktor: z.index_faktor,
        begruendung: z.index_begruendung,
      });
      if (index.fehler) hinweise.push(index.fehler);
      if (index.hinweis && z.kkw_gewaehlt !== null) hinweise.push(index.hinweis);
      const kkw =
        z.kkw_gewaehlt === null
          ? null
          : kkwWirksam(z.kkw_gewaehlt, index.faktor, einstellung.regionalfaktor);
      const kosten = kkw !== null && mengeWirksam !== null ? zeilenkosten(mengeWirksam, kkw) : null;
      // Gewählter KKW außerhalb der Spanne Von–Bis (E-58)
      const g = z.kkw_gewaehlt;
      if (
        g !== null &&
        ((z.kkw_von !== null && g < z.kkw_von) || (z.kkw_bis !== null && g > z.kkw_bis))
      )
        hinweise.push(
          `KKW gewählt liegt außerhalb der Spanne ${z.kkw_von !== null ? euro(z.kkw_von) : '…'} – ${z.kkw_bis !== null ? euro(z.kkw_bis) : '…'}.`,
        );
      const aktuell = z.kkw_ref && kennwertVersion ? kennwertVersion(z.kkw_ref) : null;
      const neuereVersion =
        aktuell !== null && z.kkw_ref_version !== null && aktuell > z.kkw_ref_version
          ? aktuell
          : null;
      if (neuereVersion)
        hinweise.push(`In der Bibliothek gibt es Version ${neuereVersion} des Kennwerts.`);
      return {
        ...z,
        katalogBezeichnung: kostengruppe(z.kg)?.bezeichnung ?? '',
        mengeWirksam,
        index,
        kkwWirksam: kkw,
        kosten,
        hinweise,
        neuereVersion,
      };
    });

  const summen = kostenBaum(zeilen.map((z) => ({ kg: z.kg, kosten: z.kosten })));
  const zeileJeKg = new Map(zeilen.map((z) => [z.kg, z]));
  const baum: KnotenDaten[] = [...summen.values()]
    .sort((a, b) => a.kg - b.kg)
    .map((k) => ({
      kg: k.kg,
      ebene: kgEbene(k.kg),
      bezeichnung: zeileJeKg.get(k.kg)?.bezeichnung || (kostengruppe(k.kg)?.bezeichnung ?? ''),
      summe: k.summe,
      ausUnterzeilen: k.ausUnterzeilen,
      kinder: k.kinder,
      zeileId: zeileJeKg.get(k.kg)?.id ?? null,
    }));

  const ebene1 = (kgs: number[]) =>
    rundeCent(kgs.reduce((s, kg) => s + (summen.get(kg)?.summe ?? 0), 0));
  const vst = einstellung.vorsteuerabzug === 1;
  const gesamtNetto = ebene1([100, 200, 300, 400, 500, 600, 700, 800]);
  const bauwerkNetto = ebene1([300, 400]);
  const bgf = flaechen.BGF;
  return {
    einstellung,
    flaechen,
    flaechenQuelle,
    zeilen,
    baum,
    gesamt: steuer(gesamtNetto, einstellung.mwst_satz, vst),
    bauwerk: steuer(bauwerkNetto, einstellung.mwst_satz, vst),
    bauwerkJeBgf: bgf && bgf > 0 ? rundeCent(bauwerkNetto / bgf) : null,
  };
}
