import {
  BautaktFehler,
  neueId,
  type BefehlDefinition,
  type Transaktion,
  type Zeile,
} from '@bautakt/kern';
import { tagVonDatum } from '@bautakt/rechnen-kalender';
import {
  bezuegeAufloesen,
  vorgaengerParsen,
  zyklusDurchNeueBeziehung,
  alsNummern,
  zyklusText,
  type BeziehungEingabe,
} from '@bautakt/rechnen-termine';
import { z } from 'zod';
import type { BeziehungZeile, VorgangZeile } from '../gemeinsam/typen.js';
import { beziehungenLesen, heuteIso, planLesen, vorgaengeLesen } from './daten.js';

// --- Schemas -----------------------------------------------------------------------------
const id = z.string().min(1);
const text = (max = 4000) => z.string().max(max);
const datum = z.string().refine((d) => {
  try {
    tagVonDatum(d);
    return true;
  } catch {
    return false;
  }
}, 'Ungültiges Datum');
const name = z.string().trim().min(1, 'Name darf nicht leer sein').max(300);
const ganz = (was: string) => z.number().int(`${was} muss eine ganze Zahl sein`);
const art = z.enum(['EA', 'AA', 'EE', 'AE']);
const einheit = z.enum(['AT', 'KT']);
const typ = z.enum(['vorgang', 'sammel', 'meilenstein']);

const fehler = (meldung: string) => new BautaktFehler('BEFEHL_DATEN', meldung);

// --- Hilfen ------------------------------------------------------------------------------
export function vorgangLesen(tx: Transaktion, vid: string): VorgangZeile {
  const v = tx.eins<VorgangZeile>('SELECT * FROM t_vorgang WHERE id = ?', vid);
  if (!v) throw new BautaktFehler('NICHT_GEFUNDEN', 'Der Vorgang existiert nicht (mehr).');
  return v;
}

export function geschwister(
  tx: Transaktion,
  planId: string,
  parent: string | null,
): VorgangZeile[] {
  return tx.lesen<VorgangZeile>(
    parent === null
      ? 'SELECT * FROM t_vorgang WHERE plan_id = ? AND parent_id IS NULL ORDER BY sortierung'
      : 'SELECT * FROM t_vorgang WHERE plan_id = ? AND parent_id = ? ORDER BY sortierung',
    ...(parent === null ? [planId] : [planId, parent]),
  );
}

function hatBeziehungen(tx: Transaktion, vid: string): boolean {
  return !!tx.eins('SELECT 1 FROM t_beziehung WHERE von_id = ? OR nach_id = ? LIMIT 1', vid, vid);
}

function naechsteNr(tx: Transaktion, planId: string): string {
  const nrs = tx.lesen<{ nr: string }>('SELECT nr FROM t_vorgang WHERE plan_id = ?', planId);
  const max = nrs.reduce((m, { nr }) => (/^\d+$/.test(nr) ? Math.max(m, Number(nr)) : m), 0);
  return String(max + 1);
}

export function pruefeNrFrei(tx: Transaktion, planId: string, nr: string, ausser?: string): void {
  const da = tx.eins<{ id: string }>(
    'SELECT id FROM t_vorgang WHERE plan_id = ? AND lower(nr) = lower(?)',
    planId,
    nr,
  );
  if (da && da.id !== ausser) throw fehler(`Die Nr. ${nr} ist in diesem Plan schon vergeben.`);
}

/** Alle Nachkommen eines Vorgangs (Tiefe zuerst, Kinder vor Eltern). */
function nachkommen(tx: Transaktion, vid: string): string[] {
  const ergebnis: string[] = [];
  const gehe = (p: string) => {
    for (const k of tx.lesen<{ id: string }>('SELECT id FROM t_vorgang WHERE parent_id = ?', p)) {
      gehe(k.id);
      ergebnis.push(k.id);
    }
  };
  gehe(vid);
  return ergebnis;
}

/** Prüft eine neue Beziehung: kein Sammelvorgang, kein Zirkelbezug (E-14, E-18). */
function pruefeBeziehung(
  tx: Transaktion,
  planId: string,
  neu: Pick<BeziehungEingabe, 'von' | 'nach'>,
  vorhanden: readonly Pick<BeziehungEingabe, 'von' | 'nach'>[],
): void {
  const vorgaenge = vorgaengeLesen(tx, planId);
  const nachId = new Map(vorgaenge.map((v) => [v.id, v]));
  for (const x of [neu.von, neu.nach]) {
    const v = nachId.get(x);
    if (!v) throw fehler('Der Vorgang gehört nicht zu diesem Plan.');
    if (v.typ === 'sammel') {
      throw fehler(
        `Sammelvorgang ${v.nr} kann keine Anordnungsbeziehungen haben; bitte Einzelvorgänge verbinden.`,
      );
    }
  }
  if (neu.von === neu.nach) throw fehler('Ein Vorgang kann nicht sein eigener Vorgänger sein.');
  const zyklus = zyklusDurchNeueBeziehung(vorhanden, neu);
  if (zyklus) {
    const eingaben = vorgaenge.map((v) => ({ id: v.id, nr: v.nr, dauer: 0 }));
    throw fehler(
      `${zyklusText(alsNummern(zyklus, eingaben))} – die Beziehung wurde nicht übernommen.`,
    );
  }
}

/** Ist-Meldungen und Herleitung (Aufwandswert) eines Vorgangs löschen. */
export function zugehoerigeLoeschen(tx: Transaktion, vid: string): void {
  for (const i of tx.lesen<{ id: string }>('SELECT id FROM t_ist WHERE vorgang_id = ?', vid)) {
    tx.loeschen('t_ist', i.id);
  }
  for (const a of tx.lesen<{ id: string }>('SELECT id FROM t_aufwand WHERE vorgang_id = ?', vid)) {
    tx.loeschen('t_aufwand', a.id);
  }
  for (const m of tx.lesen<{ id: string }>(
    'SELECT id FROM t_mta_termin WHERE vorgang_id = ?',
    vid,
  )) {
    tx.loeschen('t_mta_termin', m.id);
  }
}

const kanten = (bs: readonly BeziehungZeile[]) =>
  bs.map((b) => ({ von: b.von_id, nach: b.nach_id }));

// --- Befehle -----------------------------------------------------------------------------
type Def = BefehlDefinition<never>;
const def = <T>(d: BefehlDefinition<T>) => d as unknown as Def;

/** Verweis auf ein Bauteil eines IFC-Modells (4D, E-101): Modell-ID und GlobalId. */
const bauteilRef = z.object({ m: z.string().min(1), g: z.string().min(1).max(64) });

export const BEFEHLE: Def[] = [
  // 4D: Bauteile an Vorgängen (E-101) – mehrere Vorgänge in einem Undo-Schritt
  def({
    name: 'bauteile.setzen',
    titel: 'Bauteile verknüpfen',
    schema: z.object({
      aenderungen: z
        .array(
          z.object({
            vorgangId: id,
            bauteile: z.array(bauteilRef).max(100_000),
            modus: z.enum(['ersetzen', 'hinzufuegen', 'loesen']).default('ersetzen'),
          }),
        )
        .min(1),
    }),
    ausfuehren(tx, d) {
      const schluessel = (b: { m: string; g: string }) => `${b.m}:${b.g}`;
      for (const a of d.aenderungen) {
        const v = vorgangLesen(tx, a.vorgangId);
        if (v.typ === 'sammel')
          throw fehler(`„${v.name}“ ist ein Sammelvorgang; Bauteile gehören an seine Vorgänge.`);
        let alt: { m: string; g: string }[] = [];
        try {
          alt = JSON.parse(v.bauteil_refs || '[]') as { m: string; g: string }[];
        } catch {
          alt = [];
        }
        const weg = new Set(a.bauteile.map(schluessel));
        const neu =
          a.modus === 'ersetzen'
            ? a.bauteile
            : a.modus === 'loesen'
              ? alt.filter((b) => !weg.has(schluessel(b)))
              : [
                  ...alt,
                  ...a.bauteile.filter((b) => !alt.some((x) => schluessel(x) === schluessel(b))),
                ];
        // doppelte entfernen, Reihenfolge stabil
        const gesehen = new Set<string>();
        const eindeutig = neu.filter(
          (b) => !gesehen.has(schluessel(b)) && gesehen.add(schluessel(b)),
        );
        tx.aendern('t_vorgang', v.id, { bauteil_refs: JSON.stringify(eindeutig) });
      }
    },
  }),
  // Pläne -------------------------------------------------------------------------------
  def({
    name: 'plan.anlegen',
    titel: 'Plan anlegen',
    schema: z.object({
      name,
      art: z.string().trim().min(1).default('bauablauf'),
      projektstart: datum.optional(),
    }),
    ausfuehren(tx, d) {
      const kalenderId = neueId();
      tx.einfuegen('t_kalender', { id: kalenderId, arbeitstage: '1111100', bundesland: 'NW' });
      tx.einfuegen('t_plan', {
        id: neueId(),
        name: d.name,
        art: d.art,
        projektstart: d.projektstart ?? heuteIso(),
        kalender_id: kalenderId,
      });
    },
  }),
  def({
    name: 'plan.umbenennen',
    titel: 'Plan umbenennen',
    schema: z.object({ id, name }),
    ausfuehren(tx, d) {
      tx.aendern('t_plan', d.id, { name: d.name });
    },
  }),
  def({
    name: 'plan.aendern',
    titel: 'Planeinstellungen ändern',
    schema: z.object({
      id,
      name: name.optional(),
      art: z.string().trim().min(1).optional(),
      projektstart: datum.optional(),
      soll_ende: datum.nullable().optional(),
      rueckwaerts_von: z.enum(['berechnet', 'soll_ende']).optional(),
      stichtag: datum.nullable().optional(),
    }),
    ausfuehren(tx, d) {
      const alt = planLesen(tx, d.id);
      const neu = { ...alt, ...d };
      if (neu.rueckwaerts_von === 'soll_ende' && !neu.soll_ende) {
        throw fehler(
          'Für die Rückwärtsrechnung vom Soll-Ende muss ein Soll-Ende eingetragen sein.',
        );
      }
      if (neu.soll_ende && neu.projektstart && neu.soll_ende < neu.projektstart) {
        throw fehler('Das Soll-Ende liegt vor dem Projektstart.');
      }
      const { id: _id, ...felder } = d;
      tx.aendern('t_plan', d.id, felder as Zeile);
    },
  }),
  def({
    name: 'plan.loeschen',
    titel: 'Plan löschen',
    schema: z.object({ id }),
    ausfuehren(tx, d) {
      const plan = planLesen(tx, d.id);
      for (const b of beziehungenLesen(tx, d.id)) tx.loeschen('t_beziehung', b.id);
      // Kinder vor Eltern löschen (Undo fügt in umgekehrter Reihenfolge wieder ein)
      const vs = vorgaengeLesen(tx, d.id);
      const tiefe = (v: VorgangZeile) => {
        let t = 0;
        for (let p = v.parent_id; p; p = vs.find((x) => x.id === p)?.parent_id ?? null) t++;
        return t;
      };
      for (const v of vs) zugehoerigeLoeschen(tx, v.id);
      for (const v of [...vs].sort((a, b) => tiefe(b) - tiefe(a))) tx.loeschen('t_vorgang', v.id);
      if (plan.kalender_id) {
        for (const r of tx.lesen<{ id: string }>(
          'SELECT id FROM t_ruhezeit WHERE kalender_id = ?',
          plan.kalender_id,
        )) {
          tx.loeschen('t_ruhezeit', r.id);
        }
      }
      for (const b of tx.lesen<{ id: string }>(
        'SELECT id FROM t_mta_bericht WHERE plan_id = ?',
        d.id,
      ))
        tx.loeschen('t_mta_bericht', b.id);
      tx.loeschen('t_plan', d.id);
      if (plan.kalender_id && tx.eins('SELECT 1 FROM t_kalender WHERE id = ?', plan.kalender_id)) {
        tx.loeschen('t_kalender', plan.kalender_id);
      }
    },
  }),

  // Kalender (E-12) ----------------------------------------------------------------------
  def({
    name: 'kalender.aendern',
    titel: 'Kalender ändern',
    schema: z.object({
      id,
      arbeitstage: z.array(z.boolean()).length(7).optional(),
      bundesland: z.enum(['NW']).nullable().optional(),
    }),
    ausfuehren(tx, d) {
      const felder: Zeile = {};
      if (d.arbeitstage) {
        if (!d.arbeitstage.some(Boolean))
          throw fehler('Mindestens ein Wochentag muss Arbeitstag sein.');
        felder['arbeitstage'] = d.arbeitstage.map((a) => (a ? '1' : '0')).join('');
      }
      if (d.bundesland !== undefined) felder['bundesland'] = d.bundesland;
      tx.aendern('t_kalender', d.id, felder);
    },
  }),
  def({
    name: 'ruhezeit.anlegen',
    titel: 'Ruhezeit anlegen',
    schema: z.object({ kalenderId: id, von: datum, bis: datum, name: text(200).default('') }),
    ausfuehren(tx, d) {
      if (d.bis < d.von) throw fehler('Die Ruhezeit endet vor ihrem Beginn.');
      tx.einfuegen('t_ruhezeit', {
        id: neueId(),
        kalender_id: d.kalenderId,
        von: d.von,
        bis: d.bis,
        name: d.name.trim(),
      });
    },
  }),
  def({
    name: 'ruhezeit.aendern',
    titel: 'Ruhezeit ändern',
    schema: z.object({ id, von: datum, bis: datum, name: text(200) }),
    ausfuehren(tx, d) {
      if (d.bis < d.von) throw fehler('Die Ruhezeit endet vor ihrem Beginn.');
      tx.aendern('t_ruhezeit', d.id, { von: d.von, bis: d.bis, name: d.name.trim() });
    },
  }),
  def({
    name: 'ruhezeit.loeschen',
    titel: 'Ruhezeit löschen',
    schema: z.object({ id }),
    ausfuehren(tx, d) {
      tx.loeschen('t_ruhezeit', d.id);
    },
  }),

  // Vorgänge (E-13, E-14) ----------------------------------------------------------------
  def({
    name: 'vorgang.anlegen',
    titel: 'Vorgang anlegen',
    schema: z.object({
      planId: id,
      /** Einfügen nach diesem Vorgang (gleiche Ebene); sonst am Ende der Ebene `parentId`. */
      nachId: id.optional(),
      parentId: id.nullable().optional(),
      typ: typ.default('vorgang'),
      name: name.optional(),
      dauer: ganz('Die Dauer').min(0).optional(),
    }),
    ausfuehren(tx, d) {
      planLesen(tx, d.planId);
      let parent = d.parentId ?? null;
      let sortierung: number;
      if (d.nachId) {
        const nach = vorgangLesen(tx, d.nachId);
        parent = nach.parent_id;
        const liste = geschwister(tx, d.planId, parent);
        const i = liste.findIndex((v) => v.id === nach.id);
        const naechster = liste[i + 1];
        sortierung = naechster ? (nach.sortierung + naechster.sortierung) / 2 : nach.sortierung + 1;
      } else {
        if (parent) {
          const p = vorgangLesen(tx, parent);
          if (p.typ !== 'sammel') throw fehler('Unterpunkte gibt es nur bei Sammelvorgängen.');
        }
        const liste = geschwister(tx, d.planId, parent);
        sortierung = (liste.at(-1)?.sortierung ?? 0) + 1;
      }
      const standardName = {
        vorgang: 'Neuer Vorgang',
        meilenstein: 'Neuer Meilenstein',
        sammel: 'Neuer Sammelvorgang',
      }[d.typ];
      tx.einfuegen('t_vorgang', {
        id: neueId(),
        plan_id: d.planId,
        parent_id: parent,
        sortierung,
        nr: naechsteNr(tx, d.planId),
        name: d.name ?? standardName,
        typ: d.typ,
        dauer_at: d.typ === 'vorgang' ? (d.dauer ?? 1) : 0,
      });
    },
  }),
  def({
    name: 'vorgang.aendern',
    titel: 'Vorgang ändern',
    schema: z.object({
      id,
      felder: z
        .object({
          nr: z
            .string()
            .trim()
            .min(1, 'Nr. darf nicht leer sein')
            .max(30)
            .regex(/^[\p{L}\p{N}_.]+$/u, 'Nr. darf nur Buchstaben, Ziffern, „_“ und „.“ enthalten'),
          name,
          typ,
          dauer_at: ganz('Die Dauer').min(0, 'Die Dauer darf nicht negativ sein').max(100_000),
          quelle_annahme: text(),
          anmerkung: text(),
          gewerk: text(200),
          rolle: text(200),
          risiko: text(),
          info_braucht: text(),
          info_liefert: text(),
          bedingung_typ: z.enum(['keine', 'nicht_frueher_als', 'muss_enden_am']),
          bedingung_datum: datum.nullable(),
          ort_von: id.nullable(),
          ort_bis: id.nullable(),
          schnittstelle: z
            .union([z.boolean(), z.literal(0), z.literal(1)])
            .transform((b) => (b ? 1 : 0)),
        })
        .partial()
        .strict(),
    }),
    ausfuehren(tx, d) {
      const v = vorgangLesen(tx, d.id);
      const f: Zeile = { ...d.felder };
      if (d.felder.nr !== undefined) pruefeNrFrei(tx, v.plan_id, d.felder.nr, v.id);
      const neuerTyp = d.felder.typ ?? v.typ;
      if (neuerTyp !== v.typ) {
        if (neuerTyp === 'sammel' && hatBeziehungen(tx, v.id)) {
          throw fehler(
            'Ein Vorgang mit Anordnungsbeziehungen kann kein Sammelvorgang werden (E-14).',
          );
        }
        if (v.typ === 'sammel' && tx.eins('SELECT 1 FROM t_vorgang WHERE parent_id = ?', v.id)) {
          throw fehler('Der Sammelvorgang hat noch Unterpunkte; erst ausrücken oder löschen.');
        }
      }
      if (neuerTyp === 'meilenstein') f['dauer_at'] = 0;
      if (neuerTyp === 'sammel' && d.felder.dauer_at !== undefined) delete f['dauer_at'];
      if (d.felder.bedingung_typ === 'keine') f['bedingung_datum'] = null;
      const bedTyp = d.felder.bedingung_typ ?? v.bedingung_typ;
      const bedDatum = 'bedingung_datum' in f ? f['bedingung_datum'] : v.bedingung_datum;
      if (bedTyp !== 'keine' && !bedDatum) throw fehler('Für die Bedingung fehlt das Datum.');
      for (const o of [d.felder.ort_von, d.felder.ort_bis])
        if (o && !tx.eins('SELECT 1 FROM t_ort WHERE id = ?', o))
          throw fehler('Den Ort gibt es in der Ortsstruktur nicht (mehr).');
      tx.aendern('t_vorgang', v.id, f);
    },
  }),
  def({
    name: 'vorgang.loeschen',
    titel: 'Vorgang löschen',
    schema: z.object({ ids: z.array(id).min(1) }),
    ausfuehren(tx, d) {
      const weg = new Set<string>();
      for (const vid of d.ids) {
        vorgangLesen(tx, vid);
        for (const k of nachkommen(tx, vid)) weg.add(k);
        weg.add(vid);
      }
      for (const vid of weg) {
        for (const b of tx.lesen<{ id: string }>(
          'SELECT id FROM t_beziehung WHERE von_id = ? OR nach_id = ?',
          vid,
          vid,
        )) {
          if (tx.eins('SELECT 1 FROM t_beziehung WHERE id = ?', b.id))
            tx.loeschen('t_beziehung', b.id);
        }
      }
      for (const vid of weg) zugehoerigeLoeschen(tx, vid);
      for (const vid of weg) tx.loeschen('t_vorgang', vid); // Nachkommen stehen vor ihren Eltern
    },
  }),
  def({
    name: 'vorgang.verschieben',
    titel: 'Vorgang verschieben',
    schema: z.object({ id, richtung: z.enum(['hoch', 'runter']) }),
    ausfuehren(tx, d) {
      const v = vorgangLesen(tx, d.id);
      const liste = geschwister(tx, v.plan_id, v.parent_id);
      const i = liste.findIndex((x) => x.id === v.id);
      const anderer = liste[d.richtung === 'hoch' ? i - 1 : i + 1];
      if (!anderer) return;
      tx.aendern('t_vorgang', v.id, { sortierung: anderer.sortierung });
      tx.aendern('t_vorgang', anderer.id, { sortierung: v.sortierung });
    },
  }),
  def({
    name: 'vorgang.einruecken',
    titel: 'Vorgang einrücken',
    schema: z.object({ id }),
    ausfuehren(tx, d) {
      const v = vorgangLesen(tx, d.id);
      const liste = geschwister(tx, v.plan_id, v.parent_id);
      const oben = liste[liste.findIndex((x) => x.id === v.id) - 1];
      if (!oben)
        throw fehler(
          'Darüber steht kein Vorgang derselben Ebene, unter den eingerückt werden kann.',
        );
      if (oben.typ !== 'sammel') {
        if (hatBeziehungen(tx, oben.id)) {
          throw fehler(
            `Vorgang ${oben.nr} hat Anordnungsbeziehungen und kann deshalb nicht zum Sammelvorgang werden (E-14).`,
          );
        }
        tx.aendern('t_vorgang', oben.id, { typ: 'sammel' });
      }
      const kinder = geschwister(tx, v.plan_id, oben.id);
      tx.aendern('t_vorgang', v.id, {
        parent_id: oben.id,
        sortierung: (kinder.at(-1)?.sortierung ?? 0) + 1,
      });
    },
  }),
  def({
    name: 'vorgang.ausruecken',
    titel: 'Vorgang ausrücken',
    schema: z.object({ id }),
    ausfuehren(tx, d) {
      const v = vorgangLesen(tx, d.id);
      if (!v.parent_id) throw fehler('Der Vorgang steht bereits auf oberster Ebene.');
      const p = vorgangLesen(tx, v.parent_id);
      const liste = geschwister(tx, v.plan_id, p.parent_id);
      const naechster = liste[liste.findIndex((x) => x.id === p.id) + 1];
      tx.aendern('t_vorgang', v.id, {
        parent_id: p.parent_id,
        sortierung: naechster ? (p.sortierung + naechster.sortierung) / 2 : p.sortierung + 1,
      });
    },
  }),

  // Beziehungen (E-18, E-28) -------------------------------------------------------------
  def({
    name: 'vorgaenger.setzen',
    titel: 'Vorgänger ändern',
    schema: z.object({ nachId: id, text: text(2000) }),
    ausfuehren(tx, d) {
      const nach = vorgangLesen(tx, d.nachId);
      const p = vorgaengerParsen(d.text);
      if (!p.ok)
        throw fehler(`Vorgänger: Fehler an Position ${p.fehler.position}: ${p.fehler.meldung}`);
      const vs = vorgaengeLesen(tx, nach.plan_id);
      const a = bezuegeAufloesen(p.bezuege, vs, nach.id);
      if (!a.ok)
        throw fehler(`Vorgänger: Fehler an Position ${a.fehler.position}: ${a.fehler.meldung}`);
      const alle = beziehungenLesen(tx, nach.plan_id);
      const alt = alle.filter((b) => b.nach_id === nach.id);
      const bleibend = kanten(alle.filter((b) => b.nach_id !== nach.id));
      for (const b of a.beziehungen) {
        pruefeBeziehung(tx, nach.plan_id, b, bleibend);
        bleibend.push(b);
      }
      // Unveränderte Beziehungen behalten (stabile IDs), Rest ersetzen
      const gleich = (x: BeziehungZeile, y: BeziehungEingabe) =>
        x.von_id === y.von &&
        x.art === y.art &&
        x.abstand === y.abstand &&
        x.einheit === (y.einheit ?? 'AT');
      const offen = [...alt];
      const neu: BeziehungEingabe[] = [];
      for (const b of a.beziehungen) {
        const i = offen.findIndex((x) => gleich(x, b));
        if (i >= 0) offen.splice(i, 1);
        else neu.push(b);
      }
      for (const b of offen) tx.loeschen('t_beziehung', b.id);
      for (const b of neu) {
        tx.einfuegen('t_beziehung', {
          id: neueId(),
          plan_id: nach.plan_id,
          von_id: b.von,
          nach_id: b.nach,
          art: b.art,
          abstand: b.abstand,
          einheit: b.einheit ?? 'AT',
        });
      }
    },
  }),
  def({
    name: 'beziehung.anlegen',
    titel: 'Beziehung anlegen',
    schema: z.object({
      von: id,
      nach: id,
      art: art.default('EA'),
      abstand: ganz('Der Abstand').default(0),
      einheit: einheit.default('AT'),
    }),
    ausfuehren(tx, d) {
      const nach = vorgangLesen(tx, d.nach);
      pruefeBeziehung(tx, nach.plan_id, d, kanten(beziehungenLesen(tx, nach.plan_id)));
      tx.einfuegen('t_beziehung', {
        id: neueId(),
        plan_id: nach.plan_id,
        von_id: d.von,
        nach_id: d.nach,
        art: d.art,
        abstand: d.abstand,
        einheit: d.einheit,
      });
    },
  }),
  def({
    name: 'beziehung.aendern',
    titel: 'Beziehung ändern',
    schema: z.object({ id, von: id, art, abstand: ganz('Der Abstand'), einheit }),
    ausfuehren(tx, d) {
      const b = tx.eins<BeziehungZeile>('SELECT * FROM t_beziehung WHERE id = ?', d.id);
      if (!b) throw new BautaktFehler('NICHT_GEFUNDEN', 'Die Beziehung existiert nicht (mehr).');
      const andere = kanten(beziehungenLesen(tx, b.plan_id).filter((x) => x.id !== b.id));
      pruefeBeziehung(tx, b.plan_id, { von: d.von, nach: b.nach_id }, andere);
      tx.aendern('t_beziehung', b.id, {
        von_id: d.von,
        art: d.art,
        abstand: d.abstand,
        einheit: d.einheit,
      });
    },
  }),
  def({
    name: 'beziehung.loeschen',
    titel: 'Beziehung löschen',
    schema: z.object({ id }),
    ausfuehren(tx, d) {
      tx.loeschen('t_beziehung', d.id);
    },
  }),

  // Ist-Erfassung (E-32, E-43–E-45) ----------------------------------------------------
  def({
    name: 'ist.setzen',
    titel: 'Ist-Stand erfassen',
    schema: z.object({
      vorgangId: id,
      stichtag: datum,
      ist_anfang: datum.nullable().default(null),
      ist_ende: datum.nullable().default(null),
      fertig_prozent: ganz('Der Fertigstellungsgrad')
        .min(0, 'Fertigstellungsgrad 0–100 %')
        .max(100, 'Fertigstellungsgrad 0–100 %')
        .nullable()
        .default(null),
      restdauer_at: ganz('Die Restdauer')
        .min(0, 'Die Restdauer darf nicht negativ sein')
        .nullable()
        .default(null),
      ursache: z
        .enum(['witterung', 'lieferverzug', 'planaenderung', 'personal', 'baugrund', 'sonstiges'])
        .nullable()
        .default(null),
      ursache_text: text(2000).default(''),
    }),
    ausfuehren(tx, d) {
      const v = vorgangLesen(tx, d.vorgangId);
      if (v.typ === 'sammel')
        throw fehler('Für Sammelvorgänge wird kein Ist erfasst; bitte die Unterpunkte melden.');
      const z = { ...d };
      if (z.ist_ende && !z.ist_anfang) z.ist_anfang = v.typ === 'meilenstein' ? z.ist_ende : null;
      if (z.ist_ende && !z.ist_anfang) throw fehler('Zum Ist-Ende fehlt der Ist-Anfang.');
      if (z.ist_anfang && z.ist_anfang > z.stichtag)
        throw fehler('Der Ist-Anfang liegt nach dem Stichtag.');
      if (z.ist_ende && z.ist_ende > z.stichtag)
        throw fehler('Das Ist-Ende liegt nach dem Stichtag.');
      if (z.ist_anfang && z.ist_ende && z.ist_ende < z.ist_anfang)
        throw fehler('Das Ist-Ende liegt vor dem Ist-Anfang.');
      if (z.ist_ende) {
        z.fertig_prozent = 100;
        z.restdauer_at = null;
      } else if (z.ist_anfang) {
        if (z.fertig_prozent === 100) throw fehler('Bei 100 % bitte das Ist-Ende angeben.');
        if (z.fertig_prozent === null && z.restdauer_at === null) {
          throw fehler(
            'Für einen begonnenen Vorgang bitte Fertigstellungsgrad oder Restdauer angeben (E-43).',
          );
        }
      } else if ((z.fertig_prozent ?? 0) > 0 || z.restdauer_at !== null) {
        throw fehler('Fortschritt ohne Ist-Anfang: bitte den Ist-Anfang angeben.');
      }
      const zeile = {
        ist_anfang: z.ist_anfang,
        ist_ende: z.ist_ende,
        fertig_prozent: z.fertig_prozent,
        restdauer_at: z.restdauer_at,
        ursache: z.ursache,
        ursache_text: z.ursache_text.trim(),
      };
      const da = tx.eins<{ id: string }>(
        'SELECT id FROM t_ist WHERE vorgang_id = ? AND stichtag = ?',
        v.id,
        z.stichtag,
      );
      if (da) tx.aendern('t_ist', da.id, zeile);
      else
        tx.einfuegen('t_ist', { id: neueId(), vorgang_id: v.id, stichtag: z.stichtag, ...zeile });
    },
  }),
  def({
    name: 'ist.loeschen',
    titel: 'Ist-Meldung löschen',
    schema: z.object({ id }),
    ausfuehren(tx, d) {
      tx.loeschen('t_ist', d.id);
    },
  }),

  // Netzplan-Positionen (E-20) -----------------------------------------------------------
  def({
    name: 'netz.position',
    titel: 'Netzplan-Knoten verschieben',
    schema: z.object({
      positionen: z.array(z.object({ id, x: z.number().finite(), y: z.number().finite() })).min(1),
    }),
    ausfuehren(tx, d) {
      for (const p of d.positionen)
        tx.aendern('t_vorgang', p.id, { netz_x: Math.round(p.x), netz_y: Math.round(p.y) });
    },
  }),
  def({
    name: 'netz.zuruecksetzen',
    titel: 'Netzplan automatisch anordnen',
    schema: z.object({ planId: id }),
    ausfuehren(tx, d) {
      for (const v of tx.lesen<{ id: string }>(
        'SELECT id FROM t_vorgang WHERE plan_id = ? AND (netz_x IS NOT NULL OR netz_y IS NOT NULL)',
        d.planId,
      )) {
        tx.aendern('t_vorgang', v.id, { netz_x: null, netz_y: null });
      }
    },
  }),
];
