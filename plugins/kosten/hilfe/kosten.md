# Kostenplanung

Kostengruppen nach **DIN 276** (bis zur 3. Ebene), Flächen nach **DIN 277**, Kennwerte mit
Baupreisindex, Regionalfaktor und MwSt.

## Typischer Ablauf

1. Rechts die **Flächen** eintragen (Doppelklick auf den Wert): NUF 1–7, TF, VF, KGF, AF, GF.
   NUF, NRF und BGF rechnet Bautakt selbst (NRF = NUF + TF + VF, BGF = NRF + KGF).
2. **+ Kostengruppe …** fügt eine Zeile hinzu (eine Zeile je KG). Übergeordnete Gruppen entstehen
   automatisch und summieren; gibt es Untergruppen, sind diese maßgebend.
3. Zeile doppelklicken → **Kennwert** aus der Bibliothek übernehmen (Werte, Quelle, Stand und
   Index werden eingefroren) oder Von/Mittel/Bis mit Quelle selbst eintragen. **KKW gewählt** ist
   mit „Mittel“ vorbelegt.
4. **Menge**: an eine Fläche gekoppelt (Vorschlag: KG 100/200 → GF, 500 → AF, sonst BGF) oder von
   Hand. In der Tabelle ändern Sie Menge und KKW gewählt per Doppelklick direkt.
5. **Einstellungen …**: aktueller Baupreisindex mit Stand und Quelle, Regionalfaktor, MwSt.-Satz,
   „vorsteuerabzugsberechtigt“ (dann ist netto maßgebend).

## Rechenweg

KKW wirksam = KKW gewählt × (Index aktuell ÷ Index zum Stand) × Regionalfaktor, auf Cent gerundet.
Kosten = Menge × KKW wirksam, auf Cent. MwSt. auf die Summe. Den Rechenweg einer Zeile zeigt der
Tooltip der Kosten-Spalte und der Bearbeiten-Dialog.

Je Zeile lässt sich die Indexierung abschalten oder durch einen eigenen Faktor ersetzen – dann
ist eine **Begründung Pflicht**. ⚠ markiert Zeilen mit Hinweisen (fehlender Index, KKW außerhalb
der Spanne, neuere Bibliotheksversion, fehlende Begründung).

Keine BKI-Daten: Bautakt ergänzt den BKI-Kostenplaner, ersetzt ihn nicht (E-07).

## Export

**Export …** → PDF (A3 quer, mehrseitig) oder PNG mit Flächen, Summen und Einstellungen;
Gliederung wahlweise bis Ebene 1, 2 oder 3.
