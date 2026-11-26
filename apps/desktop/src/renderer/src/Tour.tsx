import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/** Kurze Einführung beim ersten Start, jederzeit aus der Hilfe neu startbar (E-84). */
export interface TourSchritt {
  /** CSS-Selektor des hervorgehobenen Elements; fehlt es, erscheint der Schritt mittig. */
  ziel?: string;
  titel: string;
  text: string;
}

export const TOUR_MERKER = 'bautakt.tour.gesehen';

export const TOUR: TourSchritt[] = [
  {
    titel: 'Willkommen bei Bautakt',
    text: 'Bautakt plant Termine und Kosten eines Bauprojekts: Netzplan und Balkenplan, Kosten nach Kostengruppen, Soll-Ist-Vergleich und Erfahrungswerte. Diese Tour zeigt in wenigen Schritten, wo Sie was finden.',
  },
  {
    ziel: '[data-tour="neu"]',
    titel: 'Projekt anlegen oder öffnen',
    text: 'Ein Projekt ist eine einzelne .bautakt-Datei. Legen Sie ein neues an (Strg+N) oder öffnen Sie eine vorhandene (Strg+O). Gespeichert wird mit Strg+S.',
  },
  {
    ziel: '.reiter',
    titel: 'Ansichten',
    text: 'Oben wechseln Sie zwischen den Ansichten: Terminplan, Netzplan, Liniendiagramm, Listen, MTA, Kosten und Statistik. Rechts vom Trenner liegen Bibliothek und Erfahrungswerte – sie gelten für alle Projekte.',
  },
  {
    ziel: '[data-tour="rueckgaengig"]',
    titel: 'Rückgängig und Wiederholen',
    text: 'Jede Änderung lässt sich mit Strg+Z zurücknehmen und mit Strg+Y wiederholen – auch Importe und Übernahmen aus der Bibliothek. Alle Änderungen werden im Projekt protokolliert.',
  },
  {
    ziel: '[data-tour="hilfe"]',
    titel: 'Hilfe und Glossar',
    text: 'F1 öffnet die Hilfe zur aktuellen Ansicht. Dort finden Sie auch das Glossar. Fachbegriffe wie GP oder BGF sind gepunktet unterstrichen: Maus darüber oder mit Tab hinspringen zeigt die Erklärung.',
  },
  {
    titel: 'Los geht’s',
    text: 'Leere Ansichten sagen jeweils, was als Nächstes zu tun ist. Die Tour können Sie jederzeit in der Hilfe über „Tour starten“ wiederholen.',
  },
];

export function Tour(props: { schritte: TourSchritt[]; onEnde: () => void }) {
  const [nr, setNr] = useState(0);
  const [rahmen, setRahmen] = useState<DOMRect | null>(null);
  const karte = useRef<HTMLDivElement>(null);
  const schritt = props.schritte[nr];
  const letzter = nr === props.schritte.length - 1;
  const { onEnde } = props;

  // Ziel suchen und Rahmen messen; ohne Ziel (oder wenn es gerade fehlt) mittig
  useLayoutEffect(() => {
    const messen = () => {
      const el = schritt?.ziel ? document.querySelector(schritt.ziel) : null;
      const r = el?.getBoundingClientRect();
      setRahmen(r && r.width > 0 ? r : null);
    };
    messen();
    window.addEventListener('resize', messen);
    return () => window.removeEventListener('resize', messen);
  }, [schritt]);

  useEffect(() => {
    karte.current?.querySelector<HTMLButtonElement>('button.primaer')?.focus();
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEnde();
      }
    };
    window.addEventListener('keydown', taste, true);
    return () => window.removeEventListener('keydown', taste, true);
  }, [nr, onEnde]);

  if (!schritt) return null;
  const rand = 6;
  const kartenBreite = 360;
  const stil: CSSProperties = rahmen
    ? {
        position: 'fixed',
        width: kartenBreite,
        left: Math.max(12, Math.min(rahmen.left, window.innerWidth - kartenBreite - 12)),
        top:
          rahmen.bottom + 220 < window.innerHeight
            ? rahmen.bottom + rand + 10
            : Math.max(12, rahmen.top - rand - 10 - 200),
      }
    : {
        position: 'fixed',
        width: kartenBreite + 60,
        left: '50%',
        top: '30%',
        transform: 'translateX(-50%)',
      };

  return (
    <div
      className="tour"
      role="dialog"
      aria-modal="true"
      aria-label={`Einführung: ${schritt.titel}`}
    >
      {rahmen ? (
        <div
          className="tour-rahmen"
          style={{
            left: rahmen.left - rand,
            top: rahmen.top - rand,
            width: rahmen.width + 2 * rand,
            height: rahmen.height + 2 * rand,
          }}
        />
      ) : (
        <div className="tour-abdunkeln" />
      )}
      <div ref={karte} className="tour-karte" style={stil}>
        <div className="tour-schritt">
          Schritt {nr + 1} von {props.schritte.length}
        </div>
        <h2>{schritt.titel}</h2>
        <p>{schritt.text}</p>
        <div className="tour-knoepfe">
          <button onClick={onEnde}>{letzter ? 'Schließen' : 'Überspringen'}</button>
          <span className="tour-luecke" />
          {nr > 0 && <button onClick={() => setNr(nr - 1)}>Zurück</button>}
          <button className="primaer" onClick={() => (letzter ? onEnde() : setNr(nr + 1))}>
            {letzter ? 'Fertig' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  );
}
