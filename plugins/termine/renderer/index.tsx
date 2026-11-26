import { LeereAnsicht, type AnsichtProps, type RendererPlugin } from '@bautakt/ui';
import { useEffect, useState, type FormEvent } from 'react';
import type { PlanZeile } from '../gemeinsam/typen.js';
import hilfeMeilensteine from '../hilfe/meilensteinplan.md?raw';
import hilfeNetzplan from '../hilfe/netzplan.md?raw';
import hilfeTerminliste from '../hilfe/terminliste.md?raw';
import hilfePlaene from '../hilfe/plaene.md?raw';
import hilfeTerminplan from '../hilfe/terminplan.md?raw';
import { datumKurz, useBefehl } from './daten.js';
import { DruckBalkenplan } from './druck/DruckBalkenplan.js';
import { DruckMeilensteinplan } from './druck/DruckMeilensteinplan.js';
import { DruckNetzplan } from './druck/DruckNetzplan.js';
import { DruckTerminliste } from './druck/DruckTerminliste.js';
import { MeilensteinAnsicht } from './MeilensteinAnsicht.js';
import { NetzplanAnsicht } from './NetzplanAnsicht.js';
import { TerminlisteAnsicht } from './TerminlisteAnsicht.js';
import { TerminplanAnsicht } from './TerminplanAnsicht.js';
import { setzen, useZustand } from './zustand.js';
import './termine.css';

const ART: Record<string, string> = { bauablauf: 'Bauablauf', rollen: 'Rollen', frei: 'frei' };

/** Übersicht aller Pläne des Projekts (E-14). */
function Plaene({ api, status, datenstand }: AnsichtProps) {
  const [plaene, setPlaene] = useState<PlanZeile[]>([]);
  const { befehl, fehler } = useBefehl(api);
  const [neuName, setNeuName] = useState('');
  const [bearbeitet, setBearbeitet] = useState<{ id: string; name: string } | null>(null);
  const { planId } = useZustand();
  const nurLesen = status.schreibgeschuetzt;

  useEffect(() => {
    let aktiv = true;
    void api
      .abfrage<PlanZeile[]>('termine', 'plaene')
      .then((a) => aktiv && a.ok && setPlaene(a.wert));
    return () => {
      aktiv = false;
    };
  }, [api, datenstand]);

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    const ids = await befehl('plan.anlegen', { name: neuName });
    if (ids) {
      setNeuName('');
      if (ids[1]) setzen({ planId: ids[1] });
    }
  }

  async function umbenennen(e: FormEvent) {
    e.preventDefault();
    if (bearbeitet && (await befehl('plan.umbenennen', bearbeitet))) setBearbeitet(null);
  }

  return (
    <div className="ansicht">
      {!nurLesen && (
        <form className="werkzeugleiste" onSubmit={anlegen}>
          <input
            aria-label="Name des neuen Plans"
            placeholder="z. B. Terminplan Gesamtprojekt"
            value={neuName}
            onChange={(e) => setNeuName(e.target.value)}
          />
          <button type="submit" disabled={!neuName.trim()}>
            Neuer Plan
          </button>
        </form>
      )}
      {fehler && <p className="fehler">{fehler}</p>}
      {plaene.length === 0 ? (
        <LeereAnsicht titel="Noch kein Plan angelegt">
          <p>
            Ein Projekt kann mehrere Pläne enthalten, z. B. „Rollen-Netzplan“ und „Terminplan
            Gesamtprojekt“. Geben Sie oben einen Namen ein und wählen Sie „Neuer Plan“.
          </p>
        </LeereAnsicht>
      ) : (
        <table className="tabelle">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Art</th>
              <th>Projektstart</th>
              <th>Soll-Ende</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {plaene.map((p) => (
              <tr key={p.id} className={p.id === planId ? 'aktiv' : ''}>
                <td>
                  {bearbeitet?.id === p.id ? (
                    <form onSubmit={umbenennen}>
                      <input
                        autoFocus
                        aria-label="Neuer Name"
                        value={bearbeitet.name}
                        onChange={(e) => setBearbeitet({ id: p.id, name: e.target.value })}
                        onKeyDown={(e) => e.key === 'Escape' && setBearbeitet(null)}
                      />
                    </form>
                  ) : (
                    p.name
                  )}
                </td>
                <td>{ART[p.art] ?? p.art}</td>
                <td>{p.projektstart ? datumKurz(p.projektstart) : '–'}</td>
                <td>{p.soll_ende ? datumKurz(p.soll_ende) : '–'}</td>
                <td className="aktionen">
                  <button
                    onClick={() => setzen({ planId: p.id, auswahl: null })}
                    disabled={p.id === planId}
                  >
                    {p.id === planId ? 'ausgewählt' : 'Auswählen'}
                  </button>
                  {!nurLesen && bearbeitet?.id !== p.id && (
                    <>
                      <button onClick={() => setBearbeitet({ id: p.id, name: p.name })}>
                        Umbenennen
                      </button>
                      <button onClick={() => void befehl('plan.loeschen', { id: p.id })}>
                        Löschen
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export const termineRenderer: RendererPlugin = {
  id: 'termine',
  ansichten: [
    {
      id: 'termine.plan',
      titel: 'Terminplan',
      komponente: TerminplanAnsicht,
      hilfe: hilfeTerminplan,
    },
    { id: 'termine.netz', titel: 'Netzplan', komponente: NetzplanAnsicht, hilfe: hilfeNetzplan },
    {
      id: 'termine.liste',
      titel: 'Terminliste',
      komponente: TerminlisteAnsicht,
      hilfe: hilfeTerminliste,
    },
    {
      id: 'termine.meilensteine',
      titel: 'Meilensteinplan',
      komponente: MeilensteinAnsicht,
      hilfe: hilfeMeilensteine,
    },
    { id: 'termine.plaene', titel: 'Pläne', komponente: Plaene, hilfe: hilfePlaene },
  ],
  druckansichten: [
    { id: 'termine.balkenplan', titel: 'Balkenplan', komponente: DruckBalkenplan },
    { id: 'termine.netzplan', titel: 'Netzplan', komponente: DruckNetzplan },
    { id: 'termine.terminliste', titel: 'Terminliste', komponente: DruckTerminliste },
    { id: 'termine.meilensteinplan', titel: 'Meilensteinplan', komponente: DruckMeilensteinplan },
  ],
};
