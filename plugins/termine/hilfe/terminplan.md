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

## Dauer aus Aufwandswerten

1. Vorgang wählen → **Aufwandswert …** (oder in den Eigenschaften **Herleiten …**).
2. Aufwandswert aus der **Bibliothek** wählen oder einen **eigenen Wert** mit Quelle eingeben.
3. Menge, Arbeitskräfte (AK) und Arbeitszeit je Tag eintragen, bei Bedarf Zu-/Abschläge
   (z. B. Winterbau +15 %, Wiederholeffekt −5 %; sie werden addiert).
4. **Dauer übernehmen**: Die Dauer wird aufgerundet, der Rechenweg steht als Formelzeile in der
   Herleitung, z. B. `650 m² × 0,50 h/m² = 325 h ÷ (4 × 8 h) = 10,2 → 11 AT`. Ist die
   Quelle/Annahme leer, trägt Bautakt den Aufwandswert mit Quelle ein.

In der Spalte Dauer zeigt **ƒ** eine hergeleitete Dauer (Formel im Tooltip). **ƒ⚠** heißt: Die
Dauer wurde danach von Hand geändert oder es gibt eine neuere Version in der Bibliothek.

## Soll-Ist (Ist-Erfassung)

1. **Stände …** → „Soll Vertrag“ speichern (einmal, vor Baubeginn).
2. Oben einen **Stichtag** setzen (z. B. Datum der Sprechstunde).
3. Vorgang wählen → **Ist erfassen …**: Ist-Anfang, bei fertigen Vorgängen Ist-Ende, sonst
   Fertigstellungsgrad oder Restdauer (die Restdauer hat Vorrang). Ursache aus der Liste plus
   eigener Text. Doppelklick in die Spalte **%** öffnet denselben Dialog.
4. Bautakt rechnet ab dem Stichtag neu (Prognose): Fertige Vorgänge liegen fest, begonnene enden
   am Stichtag + Restdauer, nicht begonnene beginnen frühestens am Stichtag.
5. **Vergleich**: Der dünne graue Balken zeigt den Soll-Stand, die Spalte **Abw.** die Verschiebung
   des Endes in AT (+ = später).

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
