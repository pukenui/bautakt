import {
  NetzplanFehler,
  type BeziehungEingabe,
  type BeziehungErgebnis,
  type NetzplanErgebnis,
  type NetzplanOptionen,
  type VorgangEingabe,
  type VorgangErgebnis,
  type Vorgangsstatus,
} from './typen.js';
import { alsNummern, findeZyklus, zyklusText } from './zyklus.js';

/**
 * Zeitabstand als Funktion auf Zeitpunkten:
 * f(t) = Zeitpunkt nach dem Abstand, g(t) = größtes s mit f(s) ≤ t (Umkehrung für die Rückwärtsrechnung).
 * Bei AT: f(t) = t + z, g(t) = t − z. Bei KT über den Kalender (Architektur 5.5).
 */
interface Abstand {
  f(t: number): number;
  g(t: number): number;
}

function abstandFunktion(b: BeziehungEingabe, o: NetzplanOptionen, nummer: () => string): Abstand {
  const z = b.abstand;
  if ((b.einheit ?? 'AT') === 'AT') return { f: (t) => t + z, g: (t) => t - z };
  const kal = o.kalender;
  if (!kal) {
    throw new NetzplanFehler(
      'KALENDER_FEHLT',
      `Die Beziehung ${nummer()} hat einen Abstand in Kalendertagen; dafür ist ein Kalender nötig.`,
    );
  }
  const f = (t: number) => kal.ktVersatz(t, z);
  return {
    f,
    g(t) {
      // f ist monoton steigend; grobe Schätzung (5 AT je 7 KT), dann exakt nachführen
      let s = t - Math.round((z * 5) / 7);
      while (f(s) > t) s--;
      while (f(s + 1) <= t) s++;
      return s;
    },
  };
}

function pruefeGanzzahl(wert: unknown, was: string): number {
  if (typeof wert !== 'number' || !Number.isInteger(wert)) {
    throw new NetzplanFehler('UNGUELTIG', `${was} muss eine ganze Zahl sein.`);
  }
  return wert;
}

interface Knoten {
  v: VorgangEingabe;
  d: number;
  faz: number;
  fez: number;
  saz: number;
  sez: number;
  /** ausgehende/eingehende Beziehungen (Index in der Eingabe) */
  aus: number[];
  ein: number[];
  status: Vorgangsstatus;
}

/**
 * Netzplanrechnung nach DIN 69900 (Vorgangsknotennetz), Rechenregeln Architektur Abschnitt 5.
 * Zeitachse: kontinuierliche Zeitpunkte in AT ab 0 (Projektstart).
 */
export function netzplanBerechnen(
  vorgaenge: readonly VorgangEingabe[],
  beziehungen: readonly BeziehungEingabe[],
  optionen: NetzplanOptionen = {},
): NetzplanErgebnis {
  // --- Eingaben prüfen ---------------------------------------------------------------------
  const alle = new Map<string, VorgangEingabe>();
  for (const v of vorgaenge) {
    if (alle.has(v.id))
      throw new NetzplanFehler('UNGUELTIG', `Vorgang ${v.nr ?? v.id} ist doppelt.`);
    alle.set(v.id, v);
  }
  const nr = (id: string) => alle.get(id)?.nr ?? id;

  const knoten = new Map<string, Knoten>();
  for (const v of vorgaenge) {
    if (v.typ === 'sammel') continue;
    const d = pruefeGanzzahl(v.dauer, `Die Dauer von Vorgang ${nr(v.id)}`);
    if (d < 0)
      throw new NetzplanFehler('UNGUELTIG', `Die Dauer von Vorgang ${nr(v.id)} ist negativ.`);
    if (v.typ === 'meilenstein' && d !== 0) {
      throw new NetzplanFehler('UNGUELTIG', `Meilenstein ${nr(v.id)} muss die Dauer 0 haben.`);
    }
    if (v.fruehestensAb != null)
      pruefeGanzzahl(v.fruehestensAb, `„Nicht früher als“ bei ${nr(v.id)}`);
    if (v.spaetestensBis != null)
      pruefeGanzzahl(v.spaetestensBis, `„Muss enden am“ bei ${nr(v.id)}`);
    if (v.ist) {
      const ist = v.ist;
      pruefeGanzzahl(ist.anfang, `Der Ist-Anfang von ${nr(v.id)}`);
      if (ist.ende != null) {
        pruefeGanzzahl(ist.ende, `Das Ist-Ende von ${nr(v.id)}`);
        if (ist.ende < ist.anfang) {
          throw new NetzplanFehler(
            'UNGUELTIG',
            `Ist-Ende von ${nr(v.id)} liegt vor dem Ist-Anfang.`,
          );
        }
      } else {
        if (ist.rest == null) {
          throw new NetzplanFehler(
            'UNGUELTIG',
            `Für den begonnenen Vorgang ${nr(v.id)} fehlt die Restdauer.`,
          );
        }
        pruefeGanzzahl(ist.rest, `Die Restdauer von ${nr(v.id)}`);
        if (ist.rest < 0)
          throw new NetzplanFehler('UNGUELTIG', `Die Restdauer von ${nr(v.id)} ist negativ.`);
      }
    }
    knoten.set(v.id, { v, d, faz: 0, fez: 0, saz: 0, sez: 0, aus: [], ein: [], status: 'geplant' });
  }
  for (const v of vorgaenge) {
    if (v.parent != null && alle.get(v.parent)?.typ !== 'sammel') {
      throw new NetzplanFehler(
        'UNGUELTIG',
        `Übergeordneter Vorgang von ${nr(v.id)} ist kein Sammelvorgang.`,
      );
    }
  }

  const bezName = (b: BeziehungEingabe) => `${nr(b.von)} → ${nr(b.nach)}`;
  const abstaende: Abstand[] = beziehungen.map((b, i) => {
    for (const id of [b.von, b.nach]) {
      if (!alle.has(id)) throw new NetzplanFehler('UNGUELTIG', `Vorgang ${id} existiert nicht.`);
      if (!knoten.has(id)) {
        throw new NetzplanFehler(
          'UNGUELTIG',
          `Beziehung ${bezName(b)}: Sammelvorgänge können keine Anordnungsbeziehungen haben (E-14).`,
        );
      }
    }
    if (b.von === b.nach) {
      throw new NetzplanFehler(
        'UNGUELTIG',
        `Vorgang ${nr(b.von)} kann nicht sein eigener Vorgänger sein.`,
      );
    }
    pruefeGanzzahl(b.abstand, `Der Abstand der Beziehung ${bezName(b)}`);
    knoten.get(b.von)?.aus.push(i);
    knoten.get(b.nach)?.ein.push(i);
    return abstandFunktion(b, optionen, () => bezName(b));
  });

  const stichtag = optionen.stichtag ?? null;
  if (stichtag !== null) pruefeGanzzahl(stichtag, 'Der Stichtag');
  const rueckwaertsVon = optionen.rueckwaertsVon ?? 'berechnet';
  const sollEnde = optionen.sollEnde ?? null;
  if (sollEnde !== null) pruefeGanzzahl(sollEnde, 'Das Soll-Ende');
  if (rueckwaertsVon === 'soll_ende' && sollEnde === null) {
    throw new NetzplanFehler(
      'UNGUELTIG',
      'Für die Rückwärtsrechnung vom Soll-Ende fehlt das Soll-Ende.',
    );
  }

  // --- Topologische Sortierung (Kahn) ------------------------------------------------------
  const ids = [...knoten.keys()];
  const offen = new Map(ids.map((id) => [id, knoten.get(id)?.ein.length ?? 0]));
  const reihenfolge = ids.filter((id) => offen.get(id) === 0);
  for (let i = 0; i < reihenfolge.length; i++) {
    for (const bi of knoten.get(reihenfolge[i] as string)?.aus ?? []) {
      const nach = (beziehungen[bi] as BeziehungEingabe).nach;
      const rest = (offen.get(nach) ?? 0) - 1;
      offen.set(nach, rest);
      if (rest === 0) reihenfolge.push(nach);
    }
  }
  if (reihenfolge.length < ids.length) {
    const zyklus = findeZyklus(ids, beziehungen) ?? [];
    const nummern = alsNummern(zyklus, vorgaenge);
    throw new NetzplanFehler('ZYKLUS', zyklusText(nummern), nummern);
  }

  const k = (id: string) => knoten.get(id) as Knoten;
  const bez = (i: number) => beziehungen[i] as BeziehungEingabe;
  const abst = (i: number) => abstaende[i] as Abstand;

  // --- Vorwärtsrechnung (Architektur 5.2) --------------------------------------------------
  for (const id of reihenfolge) {
    const j = k(id);
    // Prognose (E-43): fertige und begonnene Vorgänge liegen durch den Ist-Stand fest
    const ist = j.v.ist;
    if (ist) {
      j.faz = ist.anfang;
      if (ist.ende != null) {
        j.fez = ist.ende;
        j.status = 'fertig';
      } else {
        j.fez = Math.max(stichtag ?? ist.anfang, ist.anfang) + (ist.rest ?? 0);
        j.status = 'begonnen';
      }
      j.d = j.fez - j.faz;
      continue;
    }
    // nicht begonnen: frühestens am Stichtag (E-44)
    let faz = Math.max(0, j.v.fruehestensAb ?? 0, stichtag ?? 0);
    for (const bi of j.ein) {
      const b = bez(bi);
      const i = k(b.von);
      const { f } = abst(bi);
      switch (b.art) {
        case 'EA':
          faz = Math.max(faz, f(i.fez));
          break;
        case 'AA':
          faz = Math.max(faz, f(i.faz));
          break;
        case 'EE':
          faz = Math.max(faz, f(i.fez) - j.d);
          break;
        case 'AE':
          faz = Math.max(faz, f(i.faz) - j.d);
          break;
      }
    }
    j.faz = faz;
    j.fez = faz + j.d;
  }

  const projektende = ids.reduce((m, id) => Math.max(m, k(id).fez), 0);
  const bezugsende = rueckwaertsVon === 'soll_ende' ? (sollEnde as number) : projektende;

  // --- Rückwärtsrechnung (Architektur 5.3) -------------------------------------------------
  for (let r = reihenfolge.length - 1; r >= 0; r--) {
    const i = k(reihenfolge[r] as string);
    if (i.status === 'fertig') {
      // fertige Vorgänge liegen fest
      i.sez = i.fez;
      i.saz = i.faz;
      continue;
    }
    let sez = bezugsende;
    if (i.v.spaetestensBis != null) sez = Math.min(sez, i.v.spaetestensBis);
    for (const bi of i.aus) {
      const b = bez(bi);
      const j = k(b.nach);
      const { g } = abst(bi);
      switch (b.art) {
        case 'EA':
          sez = Math.min(sez, g(j.saz));
          break;
        case 'AA':
          sez = Math.min(sez, g(j.saz) + i.d);
          break;
        case 'EE':
          sez = Math.min(sez, g(j.sez));
          break;
        case 'AE':
          sez = Math.min(sez, g(j.sez) + i.d);
          break;
      }
    }
    i.sez = sez;
    i.saz = sez - i.d;
  }

  // --- Puffer, kritischer Weg (Architektur 5.4) --------------------------------------------
  const gp = (x: Knoten) => x.sez - x.fez;
  const offeneIds = ids.filter((id) => k(id).status !== 'fertig');
  const minGp = offeneIds.length
    ? offeneIds.reduce((m, id) => Math.min(m, gp(k(id))), Infinity)
    : 0;
  const grenze = rueckwaertsVon === 'soll_ende' ? minGp : 0;

  const ergebnisse = new Map<string, VorgangErgebnis>();
  for (const id of reihenfolge) {
    const i = k(id);
    let spielraum = i.aus.length === 0 ? projektende - i.fez : Infinity;
    for (const bi of i.aus) {
      const b = bez(bi);
      const j = k(b.nach);
      const { g } = abst(bi);
      const s =
        b.art === 'EA'
          ? g(j.faz) - i.fez
          : b.art === 'AA'
            ? g(j.faz) - i.faz
            : b.art === 'EE'
              ? g(j.fez) - i.fez
              : g(j.fez) - i.faz;
      spielraum = Math.min(spielraum, s);
    }
    const gesamt = gp(i);
    const fertig = i.status === 'fertig';
    ergebnisse.set(id, {
      id,
      faz: i.faz,
      fez: i.fez,
      saz: i.saz,
      sez: i.sez,
      gp: fertig ? 0 : gesamt,
      fp: fertig ? 0 : Math.max(0, Math.min(spielraum, gesamt)),
      kritisch: !fertig && gesamt <= grenze,
      status: i.status,
    });
  }

  const beziehungErgebnisse: BeziehungErgebnis[] = beziehungen.map((b, index) => {
    const i = k(b.von);
    const j = k(b.nach);
    const vk = ergebnisse.get(b.von)?.kritisch ?? false;
    const nk = ergebnisse.get(b.nach)?.kritisch ?? false;
    const { g } = abst(index);
    // Spielraum bei spätester Lage
    const spaet =
      b.art === 'EA'
        ? g(j.saz) - i.sez
        : b.art === 'AA'
          ? g(j.saz) - i.saz
          : b.art === 'EE'
            ? g(j.sez) - i.sez
            : g(j.sez) - i.saz;
    return {
      index,
      ...(b.id !== undefined ? { id: b.id } : {}),
      kritisch: vk && nk && spaet === 0,
    };
  });

  // --- Sammelvorgänge: Verdichtung der Kinder (E-14) ---------------------------------------
  const sammel = new Map<string, VorgangErgebnis>();
  for (const id of reihenfolge) {
    const e = ergebnisse.get(id) as VorgangErgebnis;
    const gesehen = new Set<string>();
    for (let p = alle.get(id)?.parent; p != null && !gesehen.has(p); p = alle.get(p)?.parent) {
      gesehen.add(p);
      const s = sammel.get(p);
      sammel.set(
        p,
        s
          ? {
              ...s,
              faz: Math.min(s.faz, e.faz),
              fez: Math.max(s.fez, e.fez),
              saz: Math.min(s.saz, e.saz),
              sez: Math.max(s.sez, e.sez),
              kritisch: s.kritisch || e.kritisch,
              status: sammelStatus(s.status, e.status),
            }
          : {
              id: p,
              faz: e.faz,
              fez: e.fez,
              saz: e.saz,
              sez: e.sez,
              gp: 0,
              fp: null,
              kritisch: e.kritisch,
              status: e.status,
            },
      );
    }
  }
  for (const [id, s] of sammel) ergebnisse.set(id, { ...s, gp: s.sez - s.fez });

  const position = new Map(reihenfolge.map((id, i) => [id, i]));
  const kritischerPfad = reihenfolge
    .filter((id) => ergebnisse.get(id)?.kritisch)
    .sort((a, b) => k(a).faz - k(b).faz || (position.get(a) ?? 0) - (position.get(b) ?? 0));

  return {
    vorgaenge: ergebnisse,
    beziehungen: beziehungErgebnisse,
    projektende,
    bezugsende,
    abweichungSollEnde: sollEnde === null ? null : projektende - sollEnde,
    minGp,
    kritischerPfad,
    reihenfolge,
  };
}

/** Status eines Sammelvorgangs: fertig, wenn alle Kinder fertig; begonnen, sobald eines läuft. */
function sammelStatus(a: Vorgangsstatus, b: Vorgangsstatus): Vorgangsstatus {
  if (a === 'fertig' && b === 'fertig') return 'fertig';
  if (a === 'geplant' && b === 'geplant') return 'geplant';
  return 'begonnen';
}
