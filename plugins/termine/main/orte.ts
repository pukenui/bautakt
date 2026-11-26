import { BautaktFehler, neueId, type BefehlDefinition, type Transaktion } from '@bautakt/kern';
import { z } from 'zod';
import type { BeziehungZeile, VorgangZeile } from '../gemeinsam/typen.js';
import type { OrtZeile } from '../gemeinsam/orte.js';
import { ortsBaum } from '../gemeinsam/orte.js';
import { geschwister, pruefeNrFrei, vorgangLesen } from './befehle.js';
import { planDatenLaden } from './daten.js';

const fehler = (meldung: string) => new BautaktFehler('BEFEHL_DATEN', meldung);
const id = z.string().min(1);
const name = z.string().trim().min(1, 'Der Ort braucht einen Namen').max(200);

function ortLesen(tx: Transaktion, oid: string): OrtZeile {
  const o = tx.eins<OrtZeile>('SELECT * FROM t_ort WHERE id = ?', oid);
  if (!o) throw new BautaktFehler('NICHT_GEFUNDEN', 'Den Ort gibt es nicht (mehr).');
  return o;
}

function ortGeschwister(tx: Transaktion, parent: string | null): OrtZeile[] {
  return parent === null
    ? tx.lesen<OrtZeile>('SELECT * FROM t_ort WHERE parent_id IS NULL ORDER BY reihenfolge')
    : tx.lesen<OrtZeile>('SELECT * FROM t_ort WHERE parent_id = ? ORDER BY reihenfolge', parent);
}

type Def = BefehlDefinition<never>;
const def = <T>(d: BefehlDefinition<T>) => d as unknown as Def;

/** Befehle der Ortsstruktur (E-31, E-67) und des Taktzugs (E-69, E-70). */
export const ORTE_BEFEHLE: Def[] = [
  def({
    name: 'ort.anlegen',
    titel: 'Ort anlegen',
    schema: z.object({
      name,
      /** übergeordneter Ort; fehlt = oberste Ebene */
      parentId: id.nullable().optional(),
      /** mehrere Orte auf einmal, z. B. „EG, 1. OG, 2. OG“ → je Name ein Ort */
      mehrere: z.boolean().optional(),
    }),
    ausfuehren(tx, d) {
      const parent = d.parentId ?? null;
      if (parent) ortLesen(tx, parent);
      const namen = d.mehrere
        ? d.name
            .split(/[,;\n]/)
            .map((n) => n.trim())
            .filter(Boolean)
        : [d.name];
      let r = (ortGeschwister(tx, parent).at(-1)?.reihenfolge ?? 0) + 1;
      for (const n of namen)
        tx.einfuegen('t_ort', {
          id: neueId(),
          parent_id: parent,
          name: n.slice(0, 200),
          reihenfolge: r++,
        });
    },
  }),
  def({
    name: 'ort.umbenennen',
    titel: 'Ort umbenennen',
    schema: z.object({ id, name }),
    ausfuehren(tx, d) {
      ortLesen(tx, d.id);
      tx.aendern('t_ort', d.id, { name: d.name });
    },
  }),
  def({
    name: 'ort.verschieben',
    titel: 'Ort verschieben',
    schema: z.object({ id, richtung: z.enum(['hoch', 'runter']) }),
    ausfuehren(tx, d) {
      const o = ortLesen(tx, d.id);
      const liste = ortGeschwister(tx, o.parent_id);
      const i = liste.findIndex((x) => x.id === o.id);
      const anderer = liste[d.richtung === 'hoch' ? i - 1 : i + 1];
      if (!anderer) return;
      tx.aendern('t_ort', o.id, { reihenfolge: anderer.reihenfolge });
      tx.aendern('t_ort', anderer.id, { reihenfolge: o.reihenfolge });
    },
  }),
  def({
    name: 'ort.loeschen',
    titel: 'Ort löschen',
    schema: z.object({ id }),
    ausfuehren(tx, d) {
      ortLesen(tx, d.id);
      // Ort mit allen Unterorten; Verweise der Vorgänge werden geleert
      const weg = new Set<string>([d.id]);
      for (let neu = true; neu;) {
        neu = false;
        for (const o of tx.lesen<OrtZeile>('SELECT * FROM t_ort'))
          if (o.parent_id && weg.has(o.parent_id) && !weg.has(o.id)) {
            weg.add(o.id);
            neu = true;
          }
      }
      for (const v of tx.lesen<VorgangZeile>(
        'SELECT * FROM t_vorgang WHERE ort_von IS NOT NULL OR ort_bis IS NOT NULL',
      )) {
        const f: Record<string, null> = {};
        if (v.ort_von && weg.has(v.ort_von)) f['ort_von'] = null;
        if (v.ort_bis && weg.has(v.ort_bis)) f['ort_bis'] = null;
        if (Object.keys(f).length) tx.aendern('t_vorgang', v.id, f);
      }
      for (const o of weg) tx.loeschen('t_ort', o);
    },
  }),
  def({
    name: 'takt.vervielfaeltigen',
    titel: 'Über Takte vervielfältigen',
    schema: z.object({
      /** aufeinanderfolgende Vorgänge des Taktzugs in ihrer Reihenfolge */
      vorgaenge: z.array(z.object({ id, taktdauer: z.number().int().min(1).max(100_000) })).min(1),
      /** Orte in Taktreihenfolge */
      orte: z.array(id).min(2, 'Für einen Taktzug sind mindestens zwei Orte nötig'),
    }),
    ausfuehren(tx, d) {
      const vs = d.vorgaenge.map((x) => vorgangLesen(tx, x.id));
      const plan = vs[0]?.plan_id ?? '';
      const ids = new Set(vs.map((v) => v.id));
      if (ids.size !== vs.length) throw fehler('Ein Vorgang ist doppelt gewählt.');
      if (new Set(d.orte).size !== d.orte.length) throw fehler('Ein Ort ist doppelt gewählt.');
      const orte = d.orte.map((o) => ortLesen(tx, o));
      for (const v of vs) {
        if (v.plan_id !== plan) throw fehler('Alle Vorgänge müssen im selben Plan liegen.');
        if (v.typ !== 'vorgang')
          throw fehler(
            `${v.nr} ist kein Einzelvorgang – nur Vorgänge lassen sich vervielfältigen.`,
          );
        if (tx.eins('SELECT 1 FROM t_ist WHERE vorgang_id = ? LIMIT 1', v.id))
          throw fehler(`${v.nr} hat Ist-Meldungen und kann nicht mehr vervielfältigt werden.`);
      }
      // Reihenfolge: aufeinanderfolgende Geschwister (E-69)
      const liste = geschwister(tx, plan, vs[0]?.parent_id ?? null);
      const start = liste.findIndex((x) => x.id === vs[0]?.id);
      vs.forEach((v, i) => {
        if (liste[start + i]?.id !== v.id)
          throw fehler(
            'Die Vorgänge des Taktzugs müssen direkt aufeinanderfolgen (gleiche Ebene).',
          );
      });

      const beziehungen = tx.lesen<BeziehungZeile>(
        'SELECT * FROM t_beziehung WHERE plan_id = ?',
        plan,
      );
      const n = orte.length;
      // Kopien je Vorgang und Ort
      const kopie = new Map<string, string[]>(); // Original → Kopien je Ort
      for (const [k, v] of vs.entries()) {
        const ziele: string[] = [];
        orte.forEach((o, j) => {
          const nr = `${v.nr}.${j + 1}`;
          pruefeNrFrei(tx, plan, nr);
          const neu = neueId();
          tx.einfuegen('t_vorgang', {
            id: neu,
            plan_id: plan,
            parent_id: v.id,
            sortierung: j + 1,
            nr,
            name: `${v.name} – ${o.name}`.slice(0, 300),
            typ: 'vorgang',
            dauer_at: d.vorgaenge[k]?.taktdauer ?? 1,
            quelle_annahme: `${v.quelle_annahme}${v.quelle_annahme ? ' ' : ''}(Takt ${j + 1}/${n})`,
            anmerkung: v.anmerkung,
            gewerk: v.gewerk,
            rolle: v.rolle,
            risiko: '',
            info_braucht: v.info_braucht,
            info_liefert: v.info_liefert,
            dauer_herleitung: '',
            ort_von: o.id,
            ort_bis: o.id,
            bedingung_typ: 'keine',
            schnittstelle: 0,
          });
          ziele.push(neu);
        });
        kopie.set(v.id, ziele);
      }
      const verbinden = (von: string, nach: string, b?: BeziehungZeile) =>
        tx.einfuegen('t_beziehung', {
          id: neueId(),
          plan_id: plan,
          von_id: von,
          nach_id: nach,
          art: b?.art ?? 'EA',
          abstand: b?.abstand ?? 0,
          einheit: b?.einheit ?? 'AT',
        });
      // Beziehungen der Originale: von außen → erster Ort, nach außen → letzter Ort,
      // innerhalb des Taktzugs entfallen (ersetzt durch die Verkettung)
      for (const b of beziehungen) {
        const vonDrin = ids.has(b.von_id);
        const nachDrin = ids.has(b.nach_id);
        if (!vonDrin && !nachDrin) continue;
        tx.loeschen('t_beziehung', b.id);
        if (vonDrin && nachDrin) continue;
        if (nachDrin) verbinden(b.von_id, kopie.get(b.nach_id)?.[0] ?? '', b);
        else verbinden(kopie.get(b.von_id)?.[n - 1] ?? '', b.nach_id, b);
      }
      // Verkettung: gleiche Arbeit von Ort zu Ort, innerhalb eines Orts in Taktzug-Reihenfolge
      for (const v of vs) {
        const k = kopie.get(v.id) ?? [];
        for (let j = 1; j < n; j++) verbinden(k[j - 1] ?? '', k[j] ?? '');
      }
      for (let i = 1; i < vs.length; i++) {
        const vor = kopie.get(vs[i - 1]?.id ?? '') ?? [];
        const nach = kopie.get(vs[i]?.id ?? '') ?? [];
        for (let j = 0; j < n; j++) verbinden(vor[j] ?? '', nach[j] ?? '');
      }
      // Originale werden Sammelvorgänge; Herleitung entfällt (E-69)
      for (const v of vs) {
        for (const a of tx.lesen<{ id: string }>(
          'SELECT id FROM t_aufwand WHERE vorgang_id = ?',
          v.id,
        ))
          tx.loeschen('t_aufwand', a.id);
        tx.aendern('t_vorgang', v.id, {
          typ: 'sammel',
          dauer_herleitung: '',
          aufwand_ref: null,
          ort_von: orte[0]?.id ?? null,
          ort_bis: orte[n - 1]?.id ?? null,
        });
      }
      // Sicherheitsnetz: Netz muss weiter rechenbar sein (z. B. kein Zirkelbezug)
      const pruefung = planDatenLaden(tx, plan).berechnung;
      if (!pruefung.ok) throw fehler(`Der Taktzug ist so nicht möglich: ${pruefung.fehler}`);
    },
  }),
];

/** Für Tests und Oberfläche: Orte in Baumreihenfolge. */
export { ortsBaum };
