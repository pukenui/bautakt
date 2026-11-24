# Terminplan

Links die Vorgangstabelle, rechts der vernetzte Balkenplan. Jede Eingabe wird sofort neu
gerechnet (Vorwärts-/Rückwärtsrechnung nach DIN 69900).

## Typische Abläufe

1. **+ Vorgang** (Taste Einfg) legt einen Vorgang unter der Auswahl an.
2. Name, Dauer (in AT) und **Quelle/Annahme** eintragen: Zelle wählen und lostippen oder Doppelklick.
   Eingabetaste übernimmt, Esc verwirft. Fehlt die Quelle/Annahme, erscheint ⚠.
3. In der Spalte **Vorgänger** verknüpfen, z. B. `1EA+10; 3EA+15; 4EA+30KT`
   (ohne Einheit = Arbeitstage, `KT` = Kalendertage, negativ = Überlappung).
   Langform geht auch: `3 Ende-Anfang +15 Tage` – oder über **Vorgänger …**.
4. Verbinden per Maus: im Balkenplan am Punkt am Balkenende ziehen und auf einem anderen Vorgang loslassen.
5. Gliedern: ⇥ rückt ein (der Vorgang darüber wird Sammelvorgang), ⇤ rückt aus.
   **Gliederung → nur Ebene 1** klappt alles zum Rahmenterminplan zu.
6. **Planeinstellungen …**: Projektstart, Soll-Ende, Rückwärtsrechnung vom Soll-Ende
   (negative Puffer werden rot), Arbeitstage, Feiertage NRW, Ruhezeiten.

## Darstellung

- Rot = kritischer Weg; schraffiert = Gesamtpuffer; dünner roter Strich = negativer Puffer.
- Raute = Meilenstein, orange = Schnittstellentermin; Klammerbalken = Sammelvorgang.
- Grau = Ruhezeit, hellgrau = Wochenende/Feiertag; blau = heute; rot gestrichelt = Soll-Ende.
- Nummerierte Kreise verweisen auf die Risiko-Legende unten.

## Tastenkürzel

| Kürzel             | Wirkung                  |
| ------------------ | ------------------------ |
| Pfeiltasten        | Zelle wählen             |
| Eingabe / F2       | Zelle bearbeiten         |
| Einfg              | neuer Vorgang            |
| Entf               | Vorgang löschen          |
| Alt+Umschalt+→ / ← | einrücken / ausrücken    |
| Strg+Z / Strg+Y    | Rückgängig / Wiederholen |
