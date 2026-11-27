# Kostenplanung

Kostengruppen nach **DIN 276** (bis zur 3. Ebene), Flächen nach **DIN 277**, Kennwerte mit
Baupreisindex, Regionalfaktor und MwSt.

## Typischer Ablauf

1. Rechts die **Flächen** eintragen (Doppelklick auf den Wert): NUF 1–7, TF, VF, KGF, AF, GF.
   Mit **⬡** kommen NUF 1–7, TF und VF live aus den Räumen des IFC-Modells (Reiter Modell).
   NUF, NRF und BGF rechnet Bautakt selbst (NRF = NUF + TF + VF, BGF = NRF + KGF).
2. **+ Kostengruppe …** fügt eine Zeile hinzu (eine Zeile je KG). Übergeordnete Gruppen entstehen
   automatisch und summieren; gibt es Untergruppen, sind diese maßgebend.
3. Zeile doppelklicken → **Kennwert** aus der Bibliothek übernehmen (Werte, Quelle, Stand und
   Index werden eingefroren) oder Von/Mittel/Bis mit Quelle selbst eintragen. **KKW gewählt** ist
   mit „Mittel“ vorbelegt.
4. **Menge**: an eine Fläche gekoppelt (Vorschlag: KG 100/200 → GF, 500 → AF, sonst BGF), von
   Hand oder **aus dem Modell (IFC)**: dann ist die Menge die Summe der Bauteile dieser KG und
   ihrer Unter-KG und folgt Modell und Regeln automatisch (Markierung ⬡; Herkunft im Tooltip). In der Tabelle ändern Sie Menge und KKW gewählt per Doppelklick direkt.
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

## Soll-Ist

Unterreiter **Soll-Ist**: die Stufen nach DIN 276 nebeneinander.

1. **Planung festschreiben als** Kostenrahmen, Kostenschätzung oder Kostenberechnung: Die
   maßgebenden Kosten der Planung werden als diese Stufe übernommen (ersetzt die Stufe;
   Rückgängig möglich). Danach lässt sich jeder Betrag per Doppelklick von Hand korrigieren (✎).
2. **Kostenanschlag** = Summe der Aufträge, **Kostenfeststellung** = Summe der Rechnungen – beides
   automatisch.
3. **Bezugsstufe** wählen (Standard Kostenberechnung). **Prognose** = Aufträge bzw. Rechnungen
   (der höhere Wert), wo schon vergeben, sonst Bezugswert. **Abweichung** = Prognose − Bezug,
   in € und % (rot = teurer).
4. In der Spalte **Ursache** je KG eine Ursache aus der Liste wählen und eigenen Text ergänzen.

## Aufträge und Rechnungen

Unterreiter **Aufträge & Rechnungen**: Beträge netto mit KG, Leistung, Auftragnehmer bzw.
Rechnungssteller, Datum, Beleg-Nr. und Anmerkung. Eine Rechnung kann einem Auftrag zugeordnet
werden (**+ Rechnung** in der Auftragszeile) – dann gilt dessen KG, und der Auftrag zeigt
„abgerechnet“ und „offen“.

**Anhang**: Bautakt speichert nur den Verweis auf die Datei (z. B. das PDF der Rechnung) und
öffnet sie mit dem Standardprogramm. Verschobene oder gelöschte Dateien werden mit ⚠ markiert.
Geöffnet werden nur Dokumente und Bilder, die im Projekt eingetragen sind.

## Export

**Export …** → Kostentabelle (mit Flächen, Summen und Einstellungen) oder Soll-Ist (Stufen,
Prognose, Abweichung, Ursachen) als PDF (A3 quer, mehrseitig) oder PNG; Gliederung wahlweise bis
Ebene 1, 2 oder 3.

**Excel**: Format „Excel-Arbeitsmappe“ erzeugt eine Datei mit den Blättern Kostentabelle,
Flächen DIN 277, Soll-Ist, Aufträge und Rechnungen. KKW wirksam, Kosten, Summen, MwSt. und
Abweichungen stehen als Formeln darin und lassen sich in Excel nachrechnen.
