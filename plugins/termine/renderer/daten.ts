import type { BautaktApi } from '@bautakt/kern/vertrag';
import {
  Arbeitskalender,
  datumDeutsch,
  WOCHENTAG_KURZ,
  wochentag,
  tagVonDatum,
} from '@bautakt/rechnen-kalender';
import { bezugFormatieren } from '@bautakt/rechnen-termine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlanDaten, PlanZeile, VorgangMitEbene } from '../gemeinsam/typen.js';
import { setzen, useZustand } from './zustand.js';

/** Lädt Planliste und den ausgewählten Plan; lädt bei jeder Datenänderung neu. */
export function usePlan(api: BautaktApi, datenstand: number) {
  const { planId } = useZustand();
  const [plaene, setPlaene] = useState<PlanZeile[] | null>(null);
  const [daten, setDaten] = useState<PlanDaten | null>(null);
  const [ladefehler, setLadefehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    void (async () => {
      const p = await api.abfrage<PlanZeile[]>('termine', 'plaene');
      if (!aktiv) return;
      if (!p.ok) return setLadefehler(p.fehler);
      setPlaene(p.wert);
      const gewaehlt = p.wert.find((x) => x.id === planId) ?? p.wert[0];
      if (!gewaehlt) {
        setDaten(null);
        if (planId) setzen({ planId: null });
        return;
      }
      if (gewaehlt.id !== planId) setzen({ planId: gewaehlt.id });
      const d = await api.abfrage<PlanDaten>('termine', 'plan', { planId: gewaehlt.id });
      if (!aktiv) return;
      if (d.ok) {
        setDaten(d.wert);
        setLadefehler(null);
      } else setLadefehler(d.fehler);
    })();
    return () => {
      aktiv = false;
    };
  }, [api, datenstand, planId]);

  return { plaene, daten: daten && daten.plan.id === planId ? daten : null, ladefehler };
}

/** Führt Befehle aus und hält die letzte Fehlermeldung für die Ansicht. */
export function useBefehl(api: BautaktApi) {
  const [fehler, setFehler] = useState<string | null>(null);
  const befehl = useCallback(
    async (name: string, daten: unknown): Promise<string[] | null> => {
      const a = await api.befehl.ausfuehren('termine', name, daten);
      if (!a.ok) {
        setFehler(a.fehler);
        return null;
      }
      setFehler(null);
      return a.wert.eingefuegt.map((e) => e.id);
    },
    [api],
  );
  return { befehl, fehler, setFehler };
}

export function useKalender(daten: PlanDaten | null): Arbeitskalender | null {
  return useMemo(() => {
    if (!daten) return null;
    try {
      return new Arbeitskalender({
        start: daten.plan.projektstart ?? new Date().toISOString().slice(0, 10),
        arbeitstage: daten.kalender.arbeitstage,
        bundesland: daten.kalender.bundesland,
        ruhezeiten: daten.ruhezeiten.map((r) => ({
          von: r.von,
          bis: r.bis,
          name: r.name || 'Ruhezeit',
        })),
      });
    } catch {
      return null;
    }
  }, [daten]);
}

/** Vorgänger eines Vorgangs als Text der Vorgänger-Spalte. */
export function vorgaengerText(daten: PlanDaten, vorgangId: string, form: 'kurz' | 'lang'): string {
  const nr = new Map(daten.vorgaenge.map((v) => [v.id, v.nr]));
  return daten.beziehungen
    .filter((b) => b.nach_id === vorgangId)
    .map((b) =>
      bezugFormatieren(
        { nr: nr.get(b.von_id) ?? '?', art: b.art, abstand: b.abstand, einheit: b.einheit },
        form,
      ),
    )
    .join('; ');
}

/** Sichtbare Zeilen: Kinder zugeklappter Sammelvorgänge ausblenden. */
export function sichtbareVorgaenge(
  vorgaenge: VorgangMitEbene[],
  zugeklappt: readonly string[],
): VorgangMitEbene[] {
  const zu = new Set(zugeklappt);
  const ergebnis: VorgangMitEbene[] = [];
  let ausblendenBisEbene: number | null = null;
  for (const v of vorgaenge) {
    if (ausblendenBisEbene !== null) {
      if (v.ebene > ausblendenBisEbene) continue;
      ausblendenBisEbene = null;
    }
    ergebnis.push(v);
    if (zu.has(v.id) && v.hatKinder) ausblendenBisEbene = v.ebene;
  }
  return ergebnis;
}

/** TT.MM.JJ mit Wochentag, z. B. „Mo 14.12.26“. */
export function datumKurz(iso: string): string {
  const d = datumDeutsch(iso);
  return `${WOCHENTAG_KURZ[wochentag(tagVonDatum(iso)) - 1]} ${d.slice(0, 6)}${d.slice(8)}`;
}

export const ART_TEXT = {
  EA: 'Ende → Anfang (EA)',
  AA: 'Anfang → Anfang (AA)',
  EE: 'Ende → Ende (EE)',
  AE: 'Anfang → Ende (AE)',
} as const;
