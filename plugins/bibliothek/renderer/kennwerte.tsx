import type { BautaktApi } from '@bautakt/kern/vertrag';
import { zahlLesen } from '@bautakt/rechnen-aufwand';
import { KG_KATALOG, kostengruppe } from '@bautakt/rechnen-kosten';
import { Dialog, LeereAnsicht, zeitAnzeigen } from '@bautakt/ui';
import { useEffect, useMemo, useState } from 'react';
import type { KennwertZeile } from '../gemeinsam/typen.js';

const euro = (x: number | null) =>
  x === null
    ? '–'
    : x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zahlText = (x: number | null) => (x === null ? '' : String(x).replace('.', ','));

/** Anlegen bzw. Ändern eines Kennwerts (= neue Version, E-51, E-58). */
function KennwertDialog(props: {
  api: BautaktApi;
  eintrag: KennwertZeile | null;
  onSchliessen: () => void;
}) {
  const e = props.eintrag;
  const [f, setF] = useState(() => ({
    bezeichnung: e?.bezeichnung ?? '',
    kg: String(e?.kg ?? 300),
    einheit: e?.einheit ?? 'm² BGF',
    von: zahlText(e?.von ?? null),
    mittel: zahlText(e?.mittel ?? null),
    bis: zahlText(e?.bis ?? null),
    quelle: e?.quelle ?? '',
    stand: e?.stand ?? '',
    index_stand: zahlText(e?.index_stand ?? null),
    gebaeudeart: e?.gebaeudeart ?? '',
    anmerkung: e?.anmerkung ?? '',
  }));
  const [fehler, setFehler] = useState<string | null>(null);
  const setze = (k: keyof typeof f, w: string) => setF({ ...f, [k]: w });
  const optional = (s: string) => (s.trim() ? zahlLesen(s) : null);

  const speichern = async () => {
    const daten = {
      bezeichnung: f.bezeichnung,
      kg: Number(f.kg),
      einheit: f.einheit,
      von: optional(f.von),
      mittel: zahlLesen(f.mittel),
      bis: optional(f.bis),
      quelle: f.quelle,
      stand: f.stand,
      index_stand: optional(f.index_stand),
      gebaeudeart: f.gebaeudeart,
      anmerkung: f.anmerkung,
    };
    const a = await props.api.global.aktion(
      'bibliothek',
      e ? 'kennwert.aendern' : 'kennwert.anlegen',
      e ? { id: e.id, ...daten } : daten,
    );
    if (a.ok) props.onSchliessen();
    else setFehler(a.fehler);
  };

  const feld = (k: keyof typeof f, label: string, breit = false, hinweis?: string) => (
    <label className={`feld${breit ? ' breit' : ''}`}>
      <span className="feld-label">{label}</span>
      <input value={f[k]} placeholder={hinweis} onChange={(ev) => setze(k, ev.target.value)} />
    </label>
  );

  return (
    <Dialog
      titel={e ? `Kennwert ändern (wird Version ${e.version + 1})` : 'Neuer Kostenkennwert'}
      onSchliessen={props.onSchliessen}
      breite={700}
      fuss={
        <>
          {fehler && <span className="fehler">{fehler}</span>}
          <button onClick={props.onSchliessen}>Abbrechen</button>
          <button className="primaer" onClick={() => void speichern()}>
            Speichern
          </button>
        </>
      }
    >
      <div className="formular">
        {feld('bezeichnung', 'Bezeichnung (Pflicht)', true, 'z. B. Hallen, Fertigteilbau')}
        <label className="feld breit">
          <span className="feld-label">Kostengruppe (DIN 276)</span>
          <select value={f.kg} onChange={(ev) => setze('kg', ev.target.value)}>
            {KG_KATALOG.map((k) => (
              <option key={k.kg} value={k.kg}>
                {' '.repeat(k.ebene - 1)}
                {k.kg} {k.bezeichnung}
              </option>
            ))}
          </select>
        </label>
        {feld('einheit', 'Bezugseinheit', false, 'z. B. m² BGF')}
        {feld('gebaeudeart', 'Gebäudeart', false, 'z. B. Halle')}
        {feld('von', 'Von [€/Einheit]')}
        {feld('mittel', 'Mittel [€/Einheit] (Pflicht)')}
        {feld('bis', 'Bis [€/Einheit]')}
        {feld('index_stand', 'Baupreisindex zum Stand', false, 'z. B. 120,0')}
        {feld('stand', 'Stand', false, 'z. B. 2024, Q1')}
        {feld('quelle', 'Quelle (Pflicht)', true)}
        <label className="feld breit">
          <span className="feld-label">Anmerkung</span>
          <textarea
            rows={2}
            value={f.anmerkung}
            onChange={(ev) => setze('anmerkung', ev.target.value)}
          />
        </label>
      </div>
      <p className="dialog-erklaerung">
        Keine BKI-Daten übernehmen (E-07) – nur eigene Werte mit Quelle. Projekte behalten die
        Version, die sie verwenden.
      </p>
    </Dialog>
  );
}

function VersionenDialog(props: { api: BautaktApi; id: string; onSchliessen: () => void }) {
  const [liste, setListe] = useState<KennwertZeile[]>([]);
  useEffect(() => {
    void props.api.global
      .abfrage<KennwertZeile[]>('bibliothek', 'kennwertVersionen', { id: props.id })
      .then((a) => a.ok && setListe(a.wert));
  }, [props.api, props.id]);
  return (
    <Dialog
      titel={`Versionen: ${liste[0]?.bezeichnung ?? ''}`}
      onSchliessen={props.onSchliessen}
      breite={900}
      fuss={<button onClick={props.onSchliessen}>Schließen</button>}
    >
      <table className="tabelle">
        <thead>
          <tr>
            <th>Version</th>
            <th>Geändert</th>
            <th className="zahl">Von</th>
            <th className="zahl">Mittel</th>
            <th className="zahl">Bis</th>
            <th>Stand</th>
            <th className="zahl">Index</th>
            <th>Quelle</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {liste.map((v) => (
            <tr key={v.version}>
              <td>{v.version}</td>
              <td>{zeitAnzeigen(v.erstellt)}</td>
              <td className="zahl">{euro(v.von)}</td>
              <td className="zahl">{euro(v.mittel)}</td>
              <td className="zahl">{euro(v.bis)}</td>
              <td>{v.stand}</td>
              <td className="zahl">{v.index_stand?.toLocaleString('de-DE') ?? '–'}</td>
              <td>{v.quelle}</td>
              <td>{v.ausgeblendet ? 'gelöscht' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

/** Kostenkennwerte der Bibliothek (E-07, E-58). */
export function KennwerteTeil(props: { api: BautaktApi; datenstand: number }) {
  const { api, datenstand } = props;
  const [liste, setListe] = useState<KennwertZeile[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [geloeschte, setGeloeschte] = useState(false);
  const [dialog, setDialog] = useState<
    { art: 'eintrag'; eintrag: KennwertZeile | null } | { art: 'versionen'; id: string } | null
  >(null);

  useEffect(() => {
    let aktiv = true;
    void api.global
      .abfrage<KennwertZeile[]>('bibliothek', 'kennwerte', { mitAusgeblendeten: geloeschte })
      .then((a) => {
        if (!aktiv) return;
        if (a.ok) setListe(a.wert);
        else setFehler(a.fehler);
      });
    return () => {
      aktiv = false;
    };
  }, [api, datenstand, geloeschte]);

  const gefiltert = useMemo(() => {
    const s = suche.trim().toLowerCase();
    return (liste ?? []).filter(
      (k) =>
        !s ||
        `${k.kg} ${k.bezeichnung} ${k.gebaeudeart} ${k.quelle} ${k.stand}`
          .toLowerCase()
          .includes(s),
    );
  }, [liste, suche]);

  const aktion = async (name: string, id: string) => {
    const a = await api.global.aktion('bibliothek', name, { id });
    setFehler(a.ok ? null : a.fehler);
  };

  if (!liste) return fehler ? <p className="fehler">{fehler}</p> : <p className="leise">Lädt …</p>;
  return (
    <>
      <div className="werkzeugleiste">
        <button className="primaer" onClick={() => setDialog({ art: 'eintrag', eintrag: null })}>
          + Kennwert
        </button>
        <input
          type="search"
          aria-label="Suche"
          placeholder="Suchen (KG, Bezeichnung, Quelle) …"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
        <label className="inline">
          <input
            type="checkbox"
            checked={geloeschte}
            onChange={(e) => setGeloeschte(e.target.checked)}
          />
          gelöschte anzeigen
        </label>
      </div>
      {fehler && <p className="fehler">{fehler}</p>}
      {liste.length === 0 && !geloeschte ? (
        <LeereAnsicht titel="Noch keine Kostenkennwerte">
          <p>
            Legen Sie eigene Kostenkennwerte mit Quelle, Stand und Index an (z. B. KG 300, €/m² BGF,
            Von/Mittel/Bis). In der Kostenplanung übernehmen Sie sie in eine Kostenzeile.
          </p>
        </LeereAnsicht>
      ) : (
        <table className="tabelle bib-tabelle">
          <thead>
            <tr>
              <th>KG</th>
              <th>Bezeichnung</th>
              <th>Einheit</th>
              <th className="zahl">Von</th>
              <th className="zahl">Mittel</th>
              <th className="zahl">Bis</th>
              <th>Stand</th>
              <th className="zahl">Index</th>
              <th>Quelle</th>
              <th className="zahl">Vers.</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {gefiltert.map((k) => (
              <tr key={k.id} className={k.ausgeblendet ? 'geloescht' : ''}>
                <td title={kostengruppe(k.kg)?.bezeichnung}>{k.kg}</td>
                <td title={k.anmerkung || undefined}>
                  {k.bezeichnung}
                  {k.gebaeudeart && <span className="leise"> · {k.gebaeudeart}</span>}
                </td>
                <td>{k.einheit}</td>
                <td className="zahl">{euro(k.von)}</td>
                <td className="zahl">{euro(k.mittel)}</td>
                <td className="zahl">{euro(k.bis)}</td>
                <td>{k.stand}</td>
                <td className="zahl">{k.index_stand?.toLocaleString('de-DE') ?? '–'}</td>
                <td>{k.quelle}</td>
                <td className="zahl">{k.version}</td>
                <td className="aktionen">
                  {k.ausgeblendet ? (
                    <button onClick={() => void aktion('kennwert.einblenden', k.id)}>
                      Wiederherstellen
                    </button>
                  ) : (
                    <>
                      <button onClick={() => setDialog({ art: 'eintrag', eintrag: k })}>
                        Bearbeiten
                      </button>
                      <button onClick={() => void aktion('kennwert.ausblenden', k.id)}>
                        Löschen
                      </button>
                    </>
                  )}
                  {k.version > 1 && (
                    <button onClick={() => setDialog({ art: 'versionen', id: k.id })}>
                      Versionen
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dialog?.art === 'eintrag' && (
        <KennwertDialog api={api} eintrag={dialog.eintrag} onSchliessen={() => setDialog(null)} />
      )}
      {dialog?.art === 'versionen' && (
        <VersionenDialog api={api} id={dialog.id} onSchliessen={() => setDialog(null)} />
      )}
    </>
  );
}
