import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { GLOSSAR, glossarEintrag, type GlossarEintrag } from './glossar';

/*
 * Hover-Erklärungen für Fachbegriffe (E-83). Eine einzige Erklärungsblase je Fenster,
 * fest positioniert über allem – so wird sie von Tabellen mit overflow nicht abgeschnitten.
 */

interface Anzeige {
  eintrag: GlossarEintrag;
  rect: { left: number; top: number; bottom: number; width: number };
}

let aktuell: Anzeige | null = null;
let zeitgeber: ReturnType<typeof setTimeout> | undefined;
const abonnenten = new Set<() => void>();
const melden = () => abonnenten.forEach((f) => f());

function zeigen(eintrag: GlossarEintrag, el: HTMLElement, sofort: boolean) {
  clearTimeout(zeitgeber);
  const r = el.getBoundingClientRect();
  const setzen = () => {
    aktuell = { eintrag, rect: { left: r.left, top: r.top, bottom: r.bottom, width: r.width } };
    melden();
  };
  if (sofort) setzen();
  else zeitgeber = setTimeout(setzen, 350);
}

function verbergen() {
  clearTimeout(zeitgeber);
  if (!aktuell) return;
  aktuell = null;
  melden();
}

function abonnieren(f: () => void) {
  abonnenten.add(f);
  // beim Scrollen oder Wegklicken stimmt die Position nicht mehr
  window.addEventListener('scroll', verbergen, true);
  window.addEventListener('mousedown', verbergen, true);
  return () => {
    abonnenten.delete(f);
    window.removeEventListener('scroll', verbergen, true);
    window.removeEventListener('mousedown', verbergen, true);
  };
}

/**
 * Fachbegriff mit Erklärung bei Hover oder Tastaturfokus. `k` ist der Glossarbegriff;
 * ohne Kinder wird er selbst angezeigt. Unbekannte Begriffe erscheinen als reiner Text.
 */
export function Begriff(props: { k: string; children?: ReactNode }) {
  const eintrag = glossarEintrag(props.k);
  if (!eintrag) return <>{props.children ?? props.k}</>;
  return (
    <span
      className="begriff"
      tabIndex={0}
      aria-label={`${eintrag.begriff}${eintrag.lang ? ` (${eintrag.lang})` : ''}: ${eintrag.erklaerung}`}
      onMouseEnter={(e) => zeigen(eintrag, e.currentTarget, false)}
      onMouseLeave={verbergen}
      onFocus={(e) => zeigen(eintrag, e.currentTarget, true)}
      onBlur={verbergen}
    >
      {props.children ?? props.k}
    </span>
  );
}

/** Die Erklärungsblase – einmal in der App-Shell einbinden. */
export function BegriffErklaerung() {
  const a = useSyncExternalStore(abonnieren, () => aktuell);
  const ref = useRef<HTMLDivElement>(null);
  // Position nach dem Messen der Blase setzen (oberhalb, wenn unten kein Platz ist)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!a || !el) return;
    const b = el.offsetWidth;
    const h = el.offsetHeight;
    const unten = a.rect.bottom + 6;
    el.style.left = `${Math.max(8, Math.min(a.rect.left, window.innerWidth - b - 8))}px`;
    el.style.top = `${unten + h > window.innerHeight - 8 ? Math.max(8, a.rect.top - h - 6) : unten}px`;
  }, [a]);
  if (!a) return null;
  return (
    <div ref={ref} className="begriff-blase" role="tooltip" style={{ left: -9999, top: 0 }}>
      <GlossarText eintrag={a.eintrag} />
    </div>
  );
}

function GlossarText({ eintrag: e }: { eintrag: GlossarEintrag }) {
  return (
    <>
      <div className="begriff-titel">
        <strong>{e.begriff}</strong>
        {e.lang && <span> – {e.lang}</span>}
      </div>
      <div>{e.erklaerung}</div>
      {e.beispiel && <div className="begriff-beispiel">Beispiel: {e.beispiel}</div>}
    </>
  );
}

/** Durchsuchbares Glossar (Hilfe-Seitenleiste, E-83). */
export function Glossar() {
  const [suche, setSuche] = useState('');
  const liste = useMemo(() => {
    const s = suche.trim().toLowerCase();
    const alle = [...GLOSSAR].sort((a, b) => a.begriff.localeCompare(b.begriff, 'de'));
    if (!s) return alle;
    return alle.filter((e) =>
      [e.begriff, e.lang, e.erklaerung, ...(e.auch ?? [])].some((t) =>
        t?.toLowerCase().includes(s),
      ),
    );
  }, [suche]);
  return (
    <div className="glossar">
      <input
        type="search"
        placeholder="Begriff suchen …"
        aria-label="Glossar durchsuchen"
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
      />
      {liste.length ? (
        <dl>
          {liste.map((e) => (
            <div key={e.begriff} className="glossar-eintrag">
              <dt>
                <strong>{e.begriff}</strong>
                {e.lang && <span> – {e.lang}</span>}
              </dt>
              <dd>
                {e.erklaerung}
                {e.beispiel && <div className="begriff-beispiel">Beispiel: {e.beispiel}</div>}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="leise">Kein Begriff gefunden.</p>
      )}
    </div>
  );
}
