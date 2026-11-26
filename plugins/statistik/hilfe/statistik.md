# Statistik (Erfahrungsdatenbank)

Die Erfahrungsdatenbank sammelt Soll-Ist-Vergleiche aus abgeschlossenen oder laufenden
Projekten im App-Datenordner (`%APPDATA%\Bautakt\erfahrung.sqlite`). Die Projektdateien bleiben
unabhängig.

## Projekt übertragen

Bei geöffnetem Projekt oben **Gebäudeart** und **Bauweise** eintragen (BGF kommt aus den
Kosten-Flächen) und **Projekt übertragen** bzw. **Abschließen und übertragen** wählen. Ein
erneutes Übertragen ersetzt die Werte dieses Projekts. Übungs- oder Planspielprojekte schalten Sie
mit **zählt in Statistik** aus.

Übertragen werden:

- **Dauern**: fertige Vorgänge, Soll = Dauer im jüngsten Soll-Stand, Ist = Ist-Dauer in AT.
- **Kosten je KG**: Soll = Kostenberechnung (sonst Schätzung/Rahmen), Ist = Kostenfeststellung
  (Rechnungen) bzw. Prognose.
- **Kostenkennwerte**: Soll = KKW wirksam, Ist = Ist-Kosten ÷ Menge.

## Auswertung

Je Schlüssel (Aufwandswert, Gewerk, Ursache, Kostengruppe, Kennwert): Anzahl, Projekte, Mittelwert,
Median, Streuung, Min und Max des Faktors **Ist ÷ Soll** (über 1 = länger bzw. teurer als geplant).
Kennzahlen gibt es erst ab **n ≥ 3**. Filter nach Gebäudeart, Bauweise und BGF.

Das Diagramm zeigt je Schlüssel den Mittelwert (Punkt), den Median (Strich) und die Spanne Min–Max;
die senkrechte Linie ist Faktor 1.

## Vorschläge

Weicht ein Aufwandswert oder Kennwert der Bibliothek im Mittel um mindestens 5 % ab, erscheint ein
Vorschlag, z. B. „AW Schalung Wände im Mittel 18 % zu niedrig (n = 4) – Bibliothekswert anpassen?“.
**Anpassen …** schlägt den neuen Wert vor (bisher × Faktor); gespeichert wird erst auf Klick als neue
Bibliotheksversion – nie automatisch.
