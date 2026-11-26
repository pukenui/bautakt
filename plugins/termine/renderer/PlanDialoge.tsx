import type { BautaktApi } from '@bautakt/kern/vertrag';
import type { PlanDaten } from '../gemeinsam/typen.js';
import { AufwandDialog } from './AufwandDialog.js';
import { BeziehungDialog, PlanDialog, VorgangDialog } from './Dialoge.js';
import { ExportDialog, type Darstellung } from './ExportDialog.js';
import { IstDialog } from './IstDialog.js';
import { OrteDialog, TaktDialog } from './OrteDialoge.js';
import { StaendeDialog } from './StaendeDialog.js';
import { useZustand } from './zustand.js';

export type DialogZustand =
  | { art: 'vorgang' | 'beziehung' | 'ist' | 'aufwand' | 'takt'; id: string }
  | { art: 'plan' | 'staende' | 'export' | 'orte' }
  | null;

type Befehl = (name: string, daten: unknown) => Promise<string[] | null>;

/** Dialoge, die Terminplan, Terminliste und Meilensteinplan gemeinsam nutzen. */
export function PlanDialoge(props: {
  dialog: DialogZustand;
  setDialog: (d: DialogZustand) => void;
  onSchliessen: () => void;
  api: BautaktApi;
  daten: PlanDaten;
  datenstand: number;
  projektname: string;
  nurLesen: boolean;
  befehl: Befehl;
  fehler: string | null;
  /** Vorbelegte Darstellung im Export-Dialog. */
  darstellung: Darstellung;
}) {
  const { dialog, daten, nurLesen, befehl, fehler } = props;
  const z = useZustand();
  if (!dialog) return null;
  switch (dialog.art) {
    case 'vorgang':
      return (
        <VorgangDialog
          daten={daten}
          vorgangId={dialog.id}
          nurLesen={nurLesen}
          befehl={befehl}
          fehler={fehler}
          onBeziehungen={() => props.setDialog({ art: 'beziehung', id: dialog.id })}
          onAufwand={() => props.setDialog({ art: 'aufwand', id: dialog.id })}
          onSchliessen={props.onSchliessen}
        />
      );
    case 'aufwand':
      return (
        <AufwandDialog
          api={props.api}
          daten={daten}
          vorgangId={dialog.id}
          datenstand={props.datenstand}
          nurLesen={nurLesen}
          befehl={befehl}
          fehler={fehler}
          onSchliessen={props.onSchliessen}
        />
      );
    case 'orte':
      return (
        <OrteDialog
          daten={daten}
          nurLesen={nurLesen}
          befehl={befehl}
          fehler={fehler}
          onSchliessen={props.onSchliessen}
        />
      );
    case 'takt':
      return (
        <TaktDialog
          daten={daten}
          vorgangId={dialog.id}
          befehl={befehl}
          fehler={fehler}
          onSchliessen={props.onSchliessen}
        />
      );
    case 'beziehung':
      return (
        <BeziehungDialog
          daten={daten}
          vorgangId={dialog.id}
          nurLesen={nurLesen}
          befehl={befehl}
          fehler={fehler}
          onSchliessen={props.onSchliessen}
        />
      );
    case 'plan':
      return (
        <PlanDialog
          daten={daten}
          nurLesen={nurLesen}
          befehl={befehl}
          fehler={fehler}
          onSchliessen={props.onSchliessen}
        />
      );
    case 'ist':
      return (
        <IstDialog
          api={props.api}
          daten={daten}
          vorgangId={dialog.id}
          datenstand={props.datenstand}
          nurLesen={nurLesen}
          befehl={befehl}
          fehler={fehler}
          onSchliessen={props.onSchliessen}
        />
      );
    case 'staende':
      return (
        <StaendeDialog
          api={props.api}
          datenstand={props.datenstand}
          nurLesen={nurLesen}
          onSchliessen={props.onSchliessen}
        />
      );
    case 'export':
      return (
        <ExportDialog
          api={props.api}
          daten={daten}
          projektname={props.projektname}
          zugeklappt={z.zugeklappt[daten.plan.id] ?? []}
          listeFilter={z.listeFilter}
          darstellung={props.darstellung}
          onSchliessen={props.onSchliessen}
        />
      );
  }
}
