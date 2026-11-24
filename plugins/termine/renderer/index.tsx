import { LeereAnsicht, type AnsichtProps, type RendererPlugin } from '@bautakt/ui';
import { useEffect, useState, type FormEvent } from 'react';
import type { PlanZeile } from '../main/index.js';
import hilfePlaene from '../hilfe/plaene.md?raw';

function Plaene({ api, status, datenstand }: AnsichtProps) {
  const [plaene, setPlaene] = useState<PlanZeile[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [neuName, setNeuName] = useState('');
  const [bearbeitet, setBearbeitet] = useState<{ id: string; name: string } | null>(null);
  const nurLesen = status.schreibgeschuetzt;

  useEffect(() => {
    let aktiv = true;
    void api.abfrage<PlanZeile[]>('termine', 'plaene').then((a) => {
      if (!aktiv) return;
      if (a.ok) setPlaene(a.wert);
      else setFehler(a.fehler);
    });
    return () => {
      aktiv = false;
    };
  }, [api, datenstand]);

  async function befehl(name: string, daten: unknown): Promise<boolean> {
    const a = await api.befehl.ausfuehren('termine', name, daten);
    setFehler(a.ok ? null : a.fehler);
    return a.ok;
  }

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    if (await befehl('plan.anlegen', { name: neuName })) setNeuName('');
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
              <th />
            </tr>
          </thead>
          <tbody>
            {plaene.map((p) => (
              <tr key={p.id}>
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
                <td>
                  {p.art === 'bauablauf' ? 'Bauablauf' : p.art === 'rollen' ? 'Rollen' : p.art}
                </td>
                <td className="aktionen">
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
  ansichten: [{ id: 'termine.plaene', titel: 'Pläne', komponente: Plaene, hilfe: hilfePlaene }],
};
