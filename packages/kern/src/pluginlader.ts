import { BautaktFehler } from './fehler.js';
import type { BautaktPlugin } from './plugin.js';

const RESERVIERT = ['kern', 'meta', 'plugin_schema', 'aenderungsprotokoll', 'stand'];
const ID = /^[a-z][a-z0-9-]*$/;
const PRAEFIX = /^[a-z][a-z0-9]*_$/;

/**
 * Prüft die Plugin-Liste (eindeutige IDs/Präfixe, vorhandene Abhängigkeiten, keine Zyklen)
 * und gibt sie in Ladereihenfolge zurück (Abhängigkeiten zuerst).
 */
export function pluginsOrdnen(plugins: readonly BautaktPlugin[]): BautaktPlugin[] {
  const nachId = new Map<string, BautaktPlugin>();
  const praefixe = new Map<string, string>();
  for (const p of plugins) {
    if (!ID.test(p.id) || RESERVIERT.includes(p.id)) {
      throw new BautaktFehler('PLUGIN', `Ungültige Plugin-ID „${p.id}“.`);
    }
    if (nachId.has(p.id)) throw new BautaktFehler('PLUGIN', `Plugin „${p.id}“ ist doppelt.`);
    if (
      !PRAEFIX.test(p.tabellenPraefix) ||
      RESERVIERT.some((r) => p.tabellenPraefix.startsWith(r))
    ) {
      throw new BautaktFehler(
        'PLUGIN',
        `Ungültiges Tabellenpräfix „${p.tabellenPraefix}“ in „${p.id}“.`,
      );
    }
    for (const [anderer, id] of praefixe) {
      if (anderer.startsWith(p.tabellenPraefix) || p.tabellenPraefix.startsWith(anderer)) {
        throw new BautaktFehler(
          'PLUGIN',
          `Tabellenpräfix „${p.tabellenPraefix}“ von „${p.id}“ überschneidet sich mit „${id}“.`,
        );
      }
    }
    nachId.set(p.id, p);
    praefixe.set(p.tabellenPraefix, p.id);
  }

  const ergebnis: BautaktPlugin[] = [];
  const zustand = new Map<string, 'besucht' | 'fertig'>();
  const besuchen = (p: BautaktPlugin, pfad: string[]) => {
    const z = zustand.get(p.id);
    if (z === 'fertig') return;
    if (z === 'besucht') {
      throw new BautaktFehler(
        'PLUGIN',
        `Zyklische Plugin-Abhängigkeit: ${[...pfad, p.id].join(' → ')}`,
      );
    }
    zustand.set(p.id, 'besucht');
    for (const abh of p.abhaengigkeiten ?? []) {
      const dep = nachId.get(abh);
      if (!dep) {
        throw new BautaktFehler(
          'PLUGIN',
          `Plugin „${p.id}“ benötigt „${abh}“, das nicht vorhanden ist.`,
        );
      }
      besuchen(dep, [...pfad, p.id]);
    }
    zustand.set(p.id, 'fertig');
    ergebnis.push(p);
  };
  for (const p of plugins) besuchen(p, []);
  return ergebnis;
}
