import type { BautaktApi } from '@bautakt/kern/vertrag';
import { Dialog, LeereAnsicht, type AnsichtProps } from '@bautakt/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { raumZuordnen, type RaumKategorie, type RaumZuordnung } from '../gemeinsam/raeume.js';
import type {
  Aenderungsbericht,
  BauteilZeile,
  EigenschaftsGruppe,
  ModellZeile,
  RegelZeile,
  ZuweisungZeile,
} from '../gemeinsam/typen.js';
import { zuordnen, type Mengenart, type Zuordnung } from '../gemeinsam/zuordnung.js';
import { Bauteilliste, type Struktur } from './Bauteilliste.js';
import { KgDialog, RegelnDialog, ZuordnungBereich } from './Kostengruppen.js';
import { RaumBereich, RaumDialog, VorschauDialog, type RaumRegelZeile } from './Raeume.js';
import { geometrie } from './geometrie.js';
import { Szene, type Ansicht } from './szene.js';
import { lesen, schluessel, setzen, useAnsicht, type Schnitt } from './zustand.js';

async function holen<T>(api: BautaktApi, name: string, argumente?: unknown): Promise<T> {
  const a = await api.abfrage<T>('bim', name, argumente);
  if (!a.ok) throw new Error(a.fehler);
  return a.wert;
}

/** Zustand je Bauteil aus dem Ansichtszustand: 0 ausgeblendet, 1 sichtbar, 2 ausgewählt. */
function zustandFn() {
  const a = lesen();
  const gewaehlt = a.auswahl ? schluessel(a.auswahl.modellId, a.auswahl.expressId) : null;
  return (modellId: string, expressId: number) => {
    if (a.modelleAus.has(modellId)) return 0 as const;
    const k = schluessel(modellId, expressId);
    if (a.versteckt.has(k)) return 0 as const;
    return k === gewaehlt ? (2 as const) : (1 as const);
  };
}

/** Höhe des Geschossschnitts über dem Fußboden (übliche Grundriss-Schnitthöhe). */
const SCHNITTHOEHE = 1.2;

export function ModellAnsicht({ api, status, datenstand }: AnsichtProps) {
  const nurLesen = status.schreibgeschuetzt;
  const z = useAnsicht();
  const [modelle, setModelle] = useState<ModellZeile[] | null>(null);
  const [struktur, setStruktur] = useState<ReadonlyMap<string, Struktur>>(new Map());
  // fertig aufbereitete Modelle der aktuellen Szene
  const [fertig, setFertig] = useState<{ szene: Szene | null; ids: ReadonlySet<string> }>({
    szene: null,
    ids: new Set(),
  });
  const [fehler, setFehler] = useState<string | null>(null);
  const [bericht, setBericht] = useState<{ datei: string; zeilen: string[] } | null>(null);
  const [umbenennen, setUmbenennen] = useState<ModellZeile | null>(null);
  const [regeln, setRegeln] = useState<RegelZeile[]>([]);
  const [zuweisungen, setZuweisungen] = useState<ZuweisungZeile[]>([]);
  const [dialog, setDialog] = useState<'regeln' | 'kg' | 'raum' | null>(null);
  const [raumregeln, setRaumregeln] = useState<RaumRegelZeile[]>([]);
  const [raumzuweisungen, setRaumzuweisungen] = useState<
    { modell_id: string; globalid: string; kategorie: RaumKategorie | null }[]
  >([]);
  const [vorschau, setVorschau] = useState<{
    befehl: string;
    daten: unknown;
    details: Aenderungsbericht;
    zeilen: string[];
  } | null>(null);
  const [uebernimmt, setUebernimmt] = useState(false);
  const [eigenschaften, setEigenschaften] = useState<{
    key: string;
    gruppen: EigenschaftsGruppe[];
  } | null>(null);
  const [messung, setMessung] = useState<string | null>(null);
  const [szene, setSzene] = useState<Szene | null>(null);
  const eingepasst = useRef(false);
  // Szene an der Zeichenfläche anlegen und beim Ausblenden freigeben (React-19-Ref mit Aufräumen)
  const flaeche = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const s = new Szene(el);
    eingepasst.current = false;
    setSzene(s);
    return () => {
      s.freigeben();
      setSzene(null);
    };
  }, []);

  // Modelle und Struktur laden
  useEffect(() => {
    let aktiv = true;
    void (async () => {
      try {
        const m = await holen<ModellZeile[]>(api, 'modelle');
        const s = new Map<string, Struktur>();
        for (const x of m) s.set(x.id, await holen<Struktur>(api, 'struktur', { modellId: x.id }));
        const rg = await holen<RegelZeile[]>(api, 'regeln');
        const zw = await holen<ZuweisungZeile[]>(api, 'zuweisungen');
        const rr = await holen<RaumRegelZeile[]>(api, 'raumregeln');
        const rz = await holen<typeof raumzuweisungen>(api, 'raumzuweisungen');
        if (!aktiv) return;
        setModelle(m);
        setStruktur(s);
        setRegeln(rg);
        setZuweisungen(zw);
        setRaumregeln(rr);
        setRaumzuweisungen(rz);
      } catch (e) {
        if (aktiv) setFehler((e as Error).message);
      }
    })();
    return () => {
      aktiv = false;
    };
  }, [api, datenstand]);

  const leer = modelle !== null && modelle.length === 0;

  // Geometrie der Modelle in die Szene bringen
  useEffect(() => {
    if (!szene || !modelle) return;
    const ids = new Set(modelle.map((m) => m.id));
    for (const id of szene.modellIds()) if (!ids.has(id)) szene.modellEntfernen(id);
    let aktiv = true;
    for (const m of modelle) {
      if (szene.modellIds().includes(m.id)) continue;
      const erledigt = () =>
        setFertig((f) => ({ szene, ids: new Set([...(f.szene === szene ? f.ids : []), m.id]) }));
      geometrie(m.hash, () => holen<Uint8Array>(api, 'datei', { modellId: m.id }))
        .then((geo) => {
          if (!aktiv) return;
          szene.modellSetzen(m.id, geo);
          szene.zustandSetzen(zustandFn());
          if (!eingepasst.current) {
            eingepasst.current = true;
            szene.einpassen(szene.grenzen());
          }
        })
        .catch((e: Error) => aktiv && setFehler(`Modell „${m.name}“: ${e.message}`))
        .finally(() => aktiv && erledigt());
    }
    return () => {
      aktiv = false;
    };
  }, [szene, modelle, api]);

  // Sichtbarkeit und Auswahl übertragen
  useEffect(() => {
    szene?.zustandSetzen(zustandFn());
  }, [szene, z.versteckt, z.modelleAus, z.auswahl]);

  // Eigenschaften der Auswahl
  useEffect(() => {
    if (!z.auswahl) return;
    let aktiv = true;
    const key = schluessel(z.auswahl.modellId, z.auswahl.expressId);
    holen<EigenschaftsGruppe[]>(api, 'eigenschaften', z.auswahl)
      .then((gruppen) => aktiv && setEigenschaften({ key, gruppen }))
      .catch((e: Error) => aktiv && setFehler(e.message));
    return () => {
      aktiv = false;
    };
  }, [api, z.auswahl]);

  // Kostengruppe je Bauteil: Überschreibung, sonst erste passende Regel (E-90)
  const zuordnungen = useMemo(() => {
    const ueber = new Map(
      zuweisungen.map((x) => [
        `${x.modell_id}:${x.globalid}`,
        { kg: x.kg, mengenart: x.mengenart },
      ]),
    );
    const m = new Map<string, Zuordnung>();
    for (const st of struktur.values())
      for (const b of st.bauteile)
        m.set(
          schluessel(b.modell_id, b.express_id),
          zuordnen(b, regeln, ueber.get(`${b.modell_id}:${b.globalid}`)),
        );
    return m;
  }, [struktur, regeln, zuweisungen]);
  const zuordnungVon = useCallback(
    (b: BauteilZeile) => zuordnungen.get(schluessel(b.modell_id, b.express_id)),
    [zuordnungen],
  );
  // DIN-277-Kategorie je Raum (E-94)
  const raumZuordnungen = useMemo(() => {
    const vonHand = new Map(
      raumzuweisungen.map((x) => [`${x.modell_id}:${x.globalid}`, { kategorie: x.kategorie }]),
    );
    const m = new Map<string, RaumZuordnung>();
    for (const st of struktur.values())
      for (const b of st.bauteile)
        if (b.klasse === 'IfcSpace')
          m.set(
            schluessel(b.modell_id, b.express_id),
            raumZuordnen(b, raumregeln, vonHand.get(`${b.modell_id}:${b.globalid}`)),
          );
    return m;
  }, [struktur, raumregeln, raumzuweisungen]);
  const raumVon = useCallback(
    (b: BauteilZeile) => raumZuordnungen.get(schluessel(b.modell_id, b.express_id)),
    [raumZuordnungen],
  );
  const alleBauteile = useMemo(() => [...struktur.values()].flatMap((x) => x.bauteile), [struktur]);

  // Schnittebene
  const bauteilVon = useCallback(
    (modellId: string, expressId: number) =>
      struktur.get(modellId)?.bauteile.find((b) => b.express_id === expressId),
    [struktur],
  );
  useEffect(() => {
    if (!szene) return;
    szene.schnittSetzen(ebene(szene, z.schnitt, struktur));
  }, [szene, z.schnitt, struktur, fertig]);

  // Messmodus verlassen → angefangene Messung verwerfen
  useEffect(() => {
    if (!z.messen) szene?.messungAbbrechen();
  }, [szene, z.messen]);

  // Klick in die Fläche: auswählen oder messen (kein Klick nach Drehen/Verschieben)
  const unten = useRef<{ x: number; y: number } | null>(null);
  const zeigerUnten = (e: React.PointerEvent) => {
    unten.current = { x: e.clientX, y: e.clientY };
  };
  const zeigerOben = (e: React.PointerEvent) => {
    const u = unten.current;
    unten.current = null;
    if (!szene || !u || e.button !== 0 || Math.hypot(e.clientX - u.x, e.clientY - u.y) > 4) return;
    const t = szene.treffer(e.clientX, e.clientY);
    if (lesen().messen) {
      if (!t) return;
      const l = szene.messpunkt(t.punkt);
      setMessung(
        l === null
          ? 'Zweiten Punkt anklicken …'
          : `Abstand ${l.toLocaleString('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m`,
      );
      return;
    }
    setzen({ auswahl: t ? { modellId: t.modellId, expressId: t.expressId } : null });
  };

  // Tastatur: Esc bricht Messen ab bzw. hebt die Auswahl auf
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.dialog')) return;
      const a = lesen();
      if (a.messen) {
        szene?.messungAbbrechen();
        setzen({ messen: false });
        setMessung(null);
      } else if (a.auswahl) setzen({ auswahl: null });
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [szene]);

  const einpassen = (bauteile?: BauteilZeile[], ansicht: Ansicht = 'iso') => {
    if (!szene) return;
    if (!bauteile) return szene.einpassen(szene.grenzen(), ansicht);
    const menge = new Set(bauteile.map((b) => schluessel(b.modell_id, b.express_id)));
    const box = szene.grenzen((m, e) => menge.has(schluessel(m, e)));
    szene.einpassen(box.isEmpty() ? szene.grenzen() : box, ansicht);
  };

  const isolieren = (bauteile: BauteilZeile[]) => {
    const behalten = new Set(bauteile.map((b) => schluessel(b.modell_id, b.express_id)));
    const versteckt = new Set<string>();
    for (const s of struktur.values())
      for (const b of s.bauteile) {
        const k = schluessel(b.modell_id, b.express_id);
        if (!behalten.has(k)) versteckt.add(k);
      }
    setzen({ versteckt, modelleAus: new Set() });
  };

  const gewaehlt = z.auswahl ? bauteilVon(z.auswahl.modellId, z.auswahl.expressId) : undefined;
  const gruppen =
    z.auswahl && eigenschaften?.key === schluessel(z.auswahl.modellId, z.auswahl.expressId)
      ? eigenschaften.gruppen
      : null;
  const laedt = (modelle ?? []).filter((m) => !(fertig.szene === szene && fertig.ids.has(m.id)));

  const importieren = async () => {
    setFehler(null);
    const a = await api.import.starten({ plugin: 'bim', format: 'ifc', parameter: {} });
    if (!a.ok) return setFehler(a.fehler);
    if (a.wert) setBericht({ datei: a.wert.datei, zeilen: a.wert.bericht });
  };

  // Neu einlesen mit Vorschau (E-96)
  const neuEinlesen = async (m: ModellZeile) => {
    setFehler(null);
    const a = await api.import.starten({
      plugin: 'bim',
      format: 'ifc-neu',
      parameter: { modellId: m.id },
    });
    if (!a.ok) return setFehler(a.fehler);
    if (a.wert?.vorschau)
      setVorschau({
        befehl: a.wert.vorschau.befehl,
        daten: a.wert.vorschau.daten,
        details: a.wert.vorschau.details as Aenderungsbericht,
        zeilen: a.wert.bericht,
      });
  };

  const befehl = async (name: string, daten: unknown) => {
    const a = await api.befehl.ausfuehren('bim', name, daten);
    if (!a.ok) setFehler(a.fehler);
    return a.ok;
  };

  const schnittOptionen = useMemo(
    () =>
      (modelle ?? []).flatMap((m) =>
        (struktur.get(m.id)?.geschosse ?? []).map((g) => ({
          wert: `g:${m.id}:${g.id}`,
          text: `${modelle && modelle.length > 1 ? `${m.name}: ` : ''}${g.name}`,
        })),
      ),
    [modelle, struktur],
  );
  const schnittWert =
    z.schnitt.art === 'aus'
      ? 'aus'
      : z.schnitt.art === 'geschoss'
        ? `g:${z.schnitt.modellId}:${z.schnitt.geschossId}`
        : `f:${z.schnitt.achse}`;
  const schnittWaehlen = (w: string) => {
    if (w === 'aus') return setzen({ schnitt: { art: 'aus' } });
    const [art, a, b] = w.split(':');
    if (art === 'g' && a && b) {
      setzen({ schnitt: { art: 'geschoss', modellId: a, geschossId: b } });
      // Draufsicht auf das gewählte Geschoss (wie ein Grundriss)
      const imGeschoss = struktur.get(a)?.bauteile.filter((x) => x.geschoss_id === b);
      return einpassen(imGeschoss?.length ? imGeschoss : undefined, 'oben');
    }
    if (art === 'f' && (a === 'x' || a === 'y' || a === 'z'))
      setzen({ schnitt: { art: 'frei', achse: a, lage: 0.5, umkehren: false } });
  };

  if (modelle === null) return <p className="leise">{fehler ?? 'Lädt …'}</p>;
  if (leer)
    return (
      <LeereAnsicht titel="Noch kein IFC-Modell">
        <p>
          Lesen Sie ein IFC-Modell (IFC2x3 oder IFC4) aus Ihrem Autorenwerkzeug ein, z. B. aus
          BIMCraft, FreeCAD, Revit oder Archicad. Die Datei wird in die Projektdatei übernommen;
          weitere Fachmodelle (Tragwerk, TGA) lassen sich danach dazuladen.
        </p>
        {fehler && <p className="fehler">{fehler}</p>}
        {!nurLesen && (
          <div className="knoepfe">
            <button className="primaer" onClick={() => void importieren()}>
              IFC einlesen …
            </button>
          </div>
        )}
        {bericht && <BerichtDialog bericht={bericht} onSchliessen={() => setBericht(null)} />}
      </LeereAnsicht>
    );

  return (
    <div className="bim-ansicht">
      <div className="tp-werkzeuge bim-werkzeuge" role="toolbar" aria-label="Modell">
        {!nurLesen && <button onClick={() => void importieren()}>IFC einlesen …</button>}
        <button onClick={() => setDialog('regeln')} title="Regeltabelle IFC → Kostengruppe">
          Regeln …
        </button>
        <div className="tp-gruppe">
          <button onClick={() => einpassen()} title="Ganzes Modell zeigen">
            Einpassen
          </button>
          <select
            aria-label="Blickrichtung"
            value=""
            onChange={(e) => einpassen(undefined, e.target.value as Ansicht)}
          >
            <option value="" disabled>
              Ansicht …
            </option>
            <option value="iso">Isometrie</option>
            <option value="oben">Von oben</option>
            <option value="vorne">Von vorne</option>
            <option value="seite">Von der Seite</option>
          </select>
        </div>
        <div className="tp-gruppe">
          <button
            disabled={!gewaehlt}
            onClick={() => {
              if (!gewaehlt) return;
              const v = new Set(z.versteckt);
              v.add(schluessel(gewaehlt.modell_id, gewaehlt.express_id));
              setzen({ versteckt: v, auswahl: null });
            }}
          >
            Ausblenden
          </button>
          <button disabled={!gewaehlt} onClick={() => gewaehlt && isolieren([gewaehlt])}>
            Isolieren
          </button>
          <button
            disabled={z.versteckt.size === 0 && z.modelleAus.size === 0}
            onClick={() => setzen({ versteckt: new Set(), modelleAus: new Set() })}
          >
            Alles zeigen
          </button>
        </div>
        <div className="tp-gruppe">
          <label className="inline">
            Schnitt
            <select
              aria-label="Schnitt"
              value={schnittWert}
              onChange={(e) => schnittWaehlen(e.target.value)}
            >
              <option value="aus">kein Schnitt</option>
              <optgroup label="Geschossschnitt">
                {schnittOptionen.map((o) => (
                  <option key={o.wert} value={o.wert}>
                    {o.text}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Frei verschiebbar">
                <option value="f:y">waagerecht (Höhe)</option>
                <option value="f:x">senkrecht entlang X</option>
                <option value="f:z">senkrecht entlang Z</option>
              </optgroup>
            </select>
          </label>
          {z.schnitt.art === 'frei' && (
            <>
              <input
                type="range"
                aria-label="Lage der Schnittebene"
                min={0}
                max={1}
                step={0.005}
                value={z.schnitt.lage}
                onChange={(e) =>
                  z.schnitt.art === 'frei' &&
                  setzen({ schnitt: { ...z.schnitt, lage: Number(e.target.value) } })
                }
              />
              <button
                title="Andere Seite zeigen"
                onClick={() =>
                  z.schnitt.art === 'frei' &&
                  setzen({ schnitt: { ...z.schnitt, umkehren: !z.schnitt.umkehren } })
                }
              >
                ⇅ Seite
              </button>
            </>
          )}
        </div>
        <div className="tp-gruppe">
          <button
            aria-pressed={z.messen}
            className={z.messen ? 'aktiv' : ''}
            onClick={() => {
              setzen({ messen: !z.messen });
              setMessung(z.messen ? null : 'Ersten Punkt auf einem Bauteil anklicken …');
            }}
          >
            📏 Messen
          </button>
          <button
            disabled={!szene || szene.anzahlMessungen === 0}
            onClick={() => {
              szene?.messungenLoeschen();
              setMessung(null);
            }}
          >
            Messungen löschen
          </button>
        </div>
      </div>
      {fehler && (
        <div className="tp-meldung fehler" role="alert">
          {fehler}
          <button
            className="schliessen"
            aria-label="Meldung schließen"
            onClick={() => setFehler(null)}
          >
            ×
          </button>
        </div>
      )}
      <div className="bim-haupt">
        <Bauteilliste
          modelle={modelle}
          struktur={struktur}
          nurLesen={nurLesen}
          onIsolieren={isolieren}
          onEinpassen={(b) => einpassen(b)}
          zuordnung={zuordnungVon}
          raum={raumVon}
          onModellAktion={(aktion, m) => {
            if (aktion === 'umbenennen') return setUmbenennen(m);
            if (aktion === 'neu') return void neuEinlesen(m);
            // rückgängig machbar (Strg+Z), daher ohne Rückfrage wie andere Löschbefehle
            void befehl('modell.loeschen', { id: m.id });
          }}
        />
        <div
          className={`bim-flaeche${z.messen ? ' messen' : ''}`}
          ref={flaeche}
          onPointerDown={zeigerUnten}
          onPointerUp={zeigerOben}
          onDoubleClick={() => gewaehlt && einpassen([gewaehlt])}
        >
          {laedt.length > 0 && <div className="bim-status">Modell wird aufbereitet …</div>}
          {messung && <div className="bim-status unten">{messung}</div>}
        </div>
        <Eigenschaften bauteil={gewaehlt} gruppen={gruppen}>
          {gewaehlt?.klasse === 'IfcSpace' && (
            <RaumBereich
              raum={gewaehlt}
              zuordnung={raumVon(gewaehlt)}
              nurLesen={nurLesen}
              onAendern={() => setDialog('raum')}
            />
          )}
          {gewaehlt && gewaehlt.klasse !== 'IfcSpace' && (
            <ZuordnungBereich
              bauteil={gewaehlt}
              zuordnung={zuordnungVon(gewaehlt)}
              nurLesen={nurLesen}
              onAendern={() => setDialog('kg')}
            />
          )}
        </Eigenschaften>
      </div>
      {bericht && <BerichtDialog bericht={bericht} onSchliessen={() => setBericht(null)} />}
      {dialog === 'regeln' && (
        <RegelnDialog
          regeln={regeln}
          bauteile={alleBauteile}
          klassen={[...new Set(alleBauteile.map((b) => b.klasse))].sort()}
          nurLesen={nurLesen}
          befehl={befehl}
          raumregeln={raumregeln}
          onSchliessen={() => setDialog(null)}
        />
      )}
      {dialog === 'raum' && gewaehlt && (
        <RaumDialog
          raum={gewaehlt}
          zuordnung={raumVon(gewaehlt)}
          onSchliessen={() => setDialog(null)}
          onSetzen={async (kategorie) => {
            const ok = await befehl('raumzuweisung.setzen', {
              modellId: gewaehlt.modell_id,
              globalid: gewaehlt.globalid,
              kategorie,
            });
            if (ok) setDialog(null);
          }}
          onRegel={async () => {
            const ok = await befehl('raumzuweisung.entfernen', {
              modellId: gewaehlt.modell_id,
              globalid: gewaehlt.globalid,
            });
            if (ok) setDialog(null);
          }}
        />
      )}
      {vorschau && (
        <VorschauDialog
          bericht={vorschau.details}
          zeilen={vorschau.zeilen}
          laeuft={uebernimmt}
          onSchliessen={() => setVorschau(null)}
          onUebernehmen={async () => {
            setUebernimmt(true);
            const ok = await befehl(vorschau.befehl, vorschau.daten);
            setUebernimmt(false);
            if (ok) setVorschau(null);
          }}
        />
      )}
      {dialog === 'kg' && gewaehlt && (
        <KgDialog
          bauteil={gewaehlt}
          zuordnung={zuordnungVon(gewaehlt)}
          onSchliessen={() => setDialog(null)}
          onSetzen={async (kg: number | null, mengenart: Mengenart) => {
            const ok = await befehl('zuweisung.setzen', {
              modellId: gewaehlt.modell_id,
              globalid: gewaehlt.globalid,
              kg,
              mengenart,
            });
            if (ok) setDialog(null);
          }}
          onRegel={async () => {
            const ok = await befehl('zuweisung.entfernen', {
              modellId: gewaehlt.modell_id,
              globalid: gewaehlt.globalid,
            });
            if (ok) setDialog(null);
          }}
        />
      )}
      {umbenennen && (
        <UmbenennenDialog
          modell={umbenennen}
          onSchliessen={() => setUmbenennen(null)}
          onSpeichern={async (name) => {
            if (await befehl('modell.umbenennen', { id: umbenennen.id, name })) setUmbenennen(null);
          }}
        />
      )}
    </div>
  );
}

/** Ebene für den gewählten Schnitt (sichtbar bleibt die Seite, in die die Normale zeigt). */
function ebene(
  szene: Szene,
  s: Schnitt,
  struktur: ReadonlyMap<string, Struktur>,
): THREE.Plane | null {
  if (s.art === 'aus') return null;
  if (s.art === 'geschoss') {
    const st = struktur.get(s.modellId);
    const ids = (st?.bauteile ?? [])
      .filter((b) => b.geschoss_id === s.geschossId)
      .map((b) => b.express_id);
    const boden = szene.tiefsterPunkt(s.modellId, ids);
    if (boden === null) return null;
    // alles unterhalb der Schnitthöhe bleibt sichtbar (Blick von oben wie im Grundriss)
    return new THREE.Plane(new THREE.Vector3(0, -1, 0), boden + SCHNITTHOEHE);
  }
  const box = szene.grenzen();
  if (box.isEmpty()) return null;
  const i = { x: 0, y: 1, z: 2 }[s.achse];
  const lo = box.min.getComponent(i);
  const hi = box.max.getComponent(i);
  const wert = lo + (hi - lo) * s.lage;
  const n = new THREE.Vector3().setComponent(i, s.umkehren ? 1 : -1);
  return new THREE.Plane(n, s.umkehren ? -wert : wert);
}

function Eigenschaften(props: {
  bauteil: BauteilZeile | undefined;
  gruppen: EigenschaftsGruppe[] | null;
  children?: React.ReactNode;
}) {
  if (!props.bauteil)
    return (
      <aside className="bim-eigenschaften" aria-label="Eigenschaften">
        <p className="leise">
          Bauteil im Modell oder in der Liste anklicken, um seine Eigenschaften zu sehen.
          Doppelklick zoomt auf das Bauteil.
        </p>
      </aside>
    );
  return (
    <aside className="bim-eigenschaften" aria-label="Eigenschaften">
      <h3>{props.bauteil.name || props.bauteil.klasse}</h3>
      <p className="leise">
        {props.bauteil.klasse}
        {props.bauteil.typ ? ` · ${props.bauteil.typ}` : ''}
      </p>
      {props.children}
      {!props.gruppen ? (
        <p className="leise">Lädt …</p>
      ) : (
        props.gruppen.map((g, _, alle) => (
          <details key={g.titel} open={g.art !== 'pset' || alle.length < 6}>
            <summary>
              {g.titel}
              {g.art === 'mengen' && <span className="bim-marke">Mengen</span>}
            </summary>
            <table>
              <tbody>
                {g.werte.map((w) => (
                  <tr key={w.name}>
                    <th>{w.name}</th>
                    <td>{w.wert}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))
      )}
    </aside>
  );
}

function BerichtDialog(props: {
  bericht: { datei: string; zeilen: string[] };
  onSchliessen: () => void;
}) {
  return (
    <Dialog
      titel="IFC eingelesen"
      onSchliessen={props.onSchliessen}
      fuss={<button onClick={props.onSchliessen}>Schließen</button>}
    >
      <p className="positiv">{props.bericht.datei}</p>
      <ul>
        {props.bericht.zeilen.map((z) => (
          <li key={z}>{z}</li>
        ))}
      </ul>
      <p className="leise">
        Die Datei ist jetzt Teil der Projektdatei. Rückgängig entfernt das Modell wieder.
      </p>
    </Dialog>
  );
}

function UmbenennenDialog(props: {
  modell: ModellZeile;
  onSchliessen: () => void;
  onSpeichern: (name: string) => void;
}) {
  const [name, setName] = useState(props.modell.name);
  return (
    <Dialog
      titel="Modell umbenennen"
      onSchliessen={props.onSchliessen}
      breite={420}
      fuss={
        <>
          <button onClick={props.onSchliessen}>Abbrechen</button>
          <button
            className="primaer"
            disabled={!name.trim()}
            onClick={() => props.onSpeichern(name)}
          >
            Speichern
          </button>
        </>
      }
    >
      <label className="feld breit">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && props.onSpeichern(name)}
        />
      </label>
      <p className="leise">
        Datei: {props.modell.dateiname} · {props.modell.ifc_schema} · {props.modell.anzahl} Bauteile
      </p>
    </Dialog>
  );
}
