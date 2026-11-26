import type { ReactNode } from 'react';
import { Begriff } from './begriff';
import { begriffeFinden } from './glossar';

/**
 * Kleiner Markdown-Renderer für die Hilfetexte (E-29): Überschriften, Absätze, Listen,
 * Tabellen, Codeblöcke, **fett**, *kursiv* und `Code`. Erzeugt React-Elemente, kein HTML.
 * Fachbegriffe aus dem Glossar erhalten beim ersten Vorkommen eine Hover-Erklärung (E-83).
 */
export function Markdown({ text }: { text: string }) {
  return <div className="markdown">{bloecke(text, new Set())}</div>;
}

type Block =
  | { art: 'ueberschrift'; ebene: number; text: string }
  | { art: 'absatz'; text: string }
  | { art: 'liste'; geordnet: boolean; punkte: string[] }
  | { art: 'tabelle'; kopf: string[]; zeilen: string[][] }
  | { art: 'code'; text: string };

export function zerlegen(text: string): Block[] {
  const zeilen = text.replace(/\r\n/g, '\n').split('\n');
  const bloecke: Block[] = [];
  let i = 0;
  const zellen = (z: string) =>
    z
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
  while (i < zeilen.length) {
    const z = zeilen[i] ?? '';
    if (!z.trim()) {
      i++;
      continue;
    }
    if (z.startsWith('```')) {
      const inhalt: string[] = [];
      for (i++; i < zeilen.length && !(zeilen[i] ?? '').startsWith('```'); i++)
        inhalt.push(zeilen[i] ?? '');
      i++;
      bloecke.push({ art: 'code', text: inhalt.join('\n') });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(z);
    if (h) {
      bloecke.push({ art: 'ueberschrift', ebene: h[1]?.length ?? 1, text: h[2] ?? '' });
      i++;
      continue;
    }
    if (z.trim().startsWith('|') && /^\s*\|?\s*:?-{2,}/.test(zeilen[i + 1] ?? '')) {
      const kopf = zellen(z);
      const reihen: string[][] = [];
      for (i += 2; i < zeilen.length && (zeilen[i] ?? '').trim().startsWith('|'); i++)
        reihen.push(zellen(zeilen[i] ?? ''));
      bloecke.push({ art: 'tabelle', kopf, zeilen: reihen });
      continue;
    }
    const listenpunkt = /^\s*(?:([-*])|(\d+)\.)\s+(.*)$/;
    const l = listenpunkt.exec(z);
    if (l) {
      const geordnet = !!l[2];
      const punkte: string[] = [];
      while (i < zeilen.length) {
        const m = listenpunkt.exec(zeilen[i] ?? '');
        if (m && !!m[2] === geordnet) {
          punkte.push(m[3] ?? '');
          i++;
        } else if (punkte.length && /^\s{2,}\S/.test(zeilen[i] ?? '')) {
          punkte[punkte.length - 1] += ' ' + (zeilen[i] ?? '').trim(); // Fortsetzungszeile
          i++;
        } else break;
      }
      bloecke.push({ art: 'liste', geordnet, punkte });
      continue;
    }
    const absatz: string[] = [];
    while (
      i < zeilen.length &&
      (zeilen[i] ?? '').trim() &&
      !/^(#{1,4}\s|```|\s*\||\s*([-*]|\d+\.)\s)/.test(zeilen[i] ?? '')
    ) {
      absatz.push((zeilen[i] ?? '').trim());
      i++;
    }
    bloecke.push({ art: 'absatz', text: absatz.join(' ') });
  }
  return bloecke;
}

function bloecke(text: string, gesehen: Set<string>): ReactNode[] {
  return zerlegen(text).map((b, k) => {
    switch (b.art) {
      case 'ueberschrift': {
        const Tag = (['h2', 'h3', 'h4', 'h5'] as const)[b.ebene - 1] ?? 'h5';
        return <Tag key={k}>{inline(b.text)}</Tag>;
      }
      case 'absatz':
        return <p key={k}>{inline(b.text, gesehen)}</p>;
      case 'liste': {
        const Tag = b.geordnet ? 'ol' : 'ul';
        return (
          <Tag key={k}>
            {b.punkte.map((p, j) => (
              <li key={j}>{inline(p, gesehen)}</li>
            ))}
          </Tag>
        );
      }
      case 'tabelle':
        return (
          <table key={k}>
            <thead>
              <tr>
                {b.kopf.map((c, j) => (
                  <th key={j}>{inline(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.zeilen.map((z, j) => (
                <tr key={j}>
                  {z.map((c, n) => (
                    <td key={n}>{inline(c, gesehen)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'code':
        return (
          <pre key={k}>
            <code>{b.text}</code>
          </pre>
        );
    }
  });
}

/**
 * Inline-Auszeichnung: `Code`, **fett**, *kursiv*. Mit `gesehen` werden Glossarbegriffe
 * (außer in Code) beim ersten Vorkommen je Text verlinkt.
 */
export function inline(text: string, gesehen?: Set<string>): ReactNode[] {
  const teile: ReactNode[] = [];
  const muster = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let pos = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = muster.exec(text))) {
    if (m.index > pos) teile.push(...begriffe(text.slice(pos, m.index), gesehen, `t${k++}`));
    if (m[1] !== undefined) teile.push(<code key={k++}>{m[1]}</code>);
    else if (m[2] !== undefined)
      teile.push(<strong key={k++}>{begriffe(m[2], gesehen, `s${k}`)}</strong>);
    else teile.push(<em key={k++}>{m[3]}</em>);
    pos = m.index + m[0].length;
  }
  if (pos < text.length) teile.push(...begriffe(text.slice(pos), gesehen, `t${k}`));
  return teile;
}

/** Glossarbegriffe im Klartext beim ersten Vorkommen mit Erklärung versehen. */
function begriffe(text: string, gesehen: Set<string> | undefined, schluessel: string): ReactNode[] {
  if (!gesehen) return [text];
  const teile: ReactNode[] = [];
  let pos = 0;
  for (const t of begriffeFinden(text)) {
    if (gesehen.has(t.eintrag.begriff)) continue;
    gesehen.add(t.eintrag.begriff);
    if (t.start > pos) teile.push(text.slice(pos, t.start));
    teile.push(
      <Begriff key={`${schluessel}-${t.start}`} k={t.eintrag.begriff}>
        {text.slice(t.start, t.ende)}
      </Begriff>,
    );
    pos = t.ende;
  }
  if (pos < text.length) teile.push(text.slice(pos));
  return teile;
}
