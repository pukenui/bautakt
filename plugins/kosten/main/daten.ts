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
  ModellFlaechen,
  ModellMengenQuelle,
  EinstellungZeile,
  FlaecheZeile,
  KnotenDaten,
  KostenDaten,
  KostenZeile,
  ZeileBerechnet,
} from '../gemeinsam/typen.js';

/** Umgebung der Kostenrechnung: optionale Dienste anderer Plugins. */
export interface KostenUmgebung {
  /** aktuelle Version eines Bibliothekskennwerts (E-58) */
  kennwertVersion?: (id: string) => number | null;
  /** Modellmengen je KG (BIM-Plugin, E-93) für den angegebenen Lesezugriff */
  modell?: (db: PluginDb) => ModellMengenQuelle | null;
  /** Flächen je DIN-277-Kategorie aus dem Modell (BIM-Plugin, E-95) */
  flaechenModell?: (db: PluginDb) => ModellFlaechen | null;
}

export function einstellungLesen(db: PluginDb): EinstellungZeile {
  const e = db.eins<EinstellungZeile>('SELECT * FROM k_einstellung LIMIT 1');
  if (!e) throw new Error('Die Kosteneinstellungen fehlen in der Projektdatei.');
  return e;
}

/**
 * Kostendaten mit allen Rechenergebnissen (E-15, E-16, E-56–E-58). Berechnet wird bei jeder
 * Abfrage, gespeichert werden nur Eingaben.
 */
export function kostenDatenLaden(db: PluginDb, umgebung: KostenUmgebung = {}): KostenDaten {
  const { kennwertVersion } = umgebung;
  const modell = umgebung.modell?.(db) ?? null;
  const einstellung = einstellungLesen(db);
  const fl = db.lesen<FlaecheZeile>('SELECT * FROM k_flaeche');
  const eingaben: Partial<Record<FlaecheEingabe, number | null>> = {};
  const flaechenQuelle: Partial<Record<FlaecheEingabe, string>> = {};
  const flaechenAusModell: FlaecheEingabe[] = [];
  const flaechenHinweise: string[] = [];
  const ausModell = fl.some((f) => f.aus_modell === 1)
    ? (umgebung.flaechenModell?.(db) ?? null)
    : null;
  for (const f of fl) {
    eingaben[f.kategorie] = f.wert_m2;
    flaechenQuelle[f.kategorie] = f.quelle;
    if (f.aus_modell === 1) {
      // live aus den Räumen des Modells (E-95)
      flaechenAusModell.push(f.kategorie);
      eingaben[f.kategorie] = ausModell ? (ausModell.werte[f.kategorie] ?? null) : null;
      flaechenQuelle[f.kategorie] = 'aus dem Modell (Räume)';
    }
  }
  if (flaechenAusModell.length && !ausModell)
    flaechenHinweise.push('Flächen „aus dem Modell“, aber das Projekt enthält kein IFC-Modell.');
  if (ausModell) flaechenHinweise.push(...ausModell.hinweise);
  const flaechen = flaechenAbleiten(eingaben);

  const zeilen: ZeileBerechnet[] = db
    .lesen<KostenZeile>('SELECT * FROM k_zeile ORDER BY kg')
    .map((z) => {
      const hinweise: string[] = [];
      // Menge aus dem Modell (E-93): live je KG, mit Hinweisen zur Herkunft
      const modellMenge = z.menge_quelle === 'ifc' && modell ? modell(z.kg, z.einheit) : null;
      if (z.menge_quelle === 'ifc' && !modell)
        hinweise.push('Mengenquelle „Modell“, aber das Projekt enthält kein IFC-Modell.');
      if (modellMenge) hinweise.push(...modellMenge.hinweise);
      const mengeWirksam =
        z.menge_quelle === 'flaeche' && z.flaeche
          ? (flaechen[z.flaeche] ?? null)
          : z.menge_quelle === 'ifc'
            ? (modellMenge?.menge ?? null)
            : z.menge;
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
        modellMenge,
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
    flaechenAusModell,
    flaechenHinweise,
    zeilen,
    baum,
    gesamt: steuer(gesamtNetto, einstellung.mwst_satz, vst),
    bauwerk: steuer(bauwerkNetto, einstellung.mwst_satz, vst),
    bauwerkJeBgf: bgf && bgf > 0 ? rundeCent(bauwerkNetto / bgf) : null,
  };
}
