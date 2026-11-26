import { useState, type KeyboardEvent } from 'react';
import { eingabeZahl } from './format.js';

/** Zahl direkt in der Tabelle ändern (Doppelklick, Eingabe übernimmt, Esc verwirft). */
export function ZahlZelle(props: {
  wert: number | null;
  anzeige: string;
  darf: boolean;
  titel?: string;
  onSpeichern: (w: number | null) => Promise<boolean>;
}) {
  const [text, setText] = useState<string | null>(null);
  const fertig = async () => {
    if (text === null) return;
    const w = eingabeZahl(text);
    if (w !== props.wert && !Number.isNaN(w) && !(await props.onSpeichern(w))) return;
    setText(null);
  };
  if (text !== null)
    return (
      <input
        autoFocus
        className="tp-editor kk-zahl"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void fertig()}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter') void fertig();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setText(null);
          }
        }}
      />
    );
  return (
    <span
      className={props.darf ? 'kk-bearbeitbar' : ''}
      title={props.titel ?? (props.darf ? 'Doppelklick zum Ändern' : undefined)}
      onDoubleClick={() =>
        props.darf &&
        setText(
          props.wert === null
            ? ''
            : props.wert.toLocaleString('de-DE', { useGrouping: false, maximumFractionDigits: 4 }),
        )
      }
    >
      {props.anzeige || (props.darf ? '…' : '')}
    </span>
  );
}
