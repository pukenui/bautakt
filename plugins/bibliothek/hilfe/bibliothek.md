# Bibliothek

Die Bibliothek enthält Ihre **Aufwandswerte** (h je Mengeneinheit) und **Kostenkennwerte** (€ je Bezugseinheit) mit Quelle und Stand. Sie gilt
für **alle Projekte** und liegt im App-Datenordner (`%APPDATA%\Bautakt\bibliothek.sqlite`),
nicht in der Projektdatei.

## Pflegen

- **+ Aufwandswert**: Bezeichnung, Gewerk, Mengeneinheit, Aufwandswert, **Quelle (Pflicht)**,
  Stand und Anmerkung.
- **Bearbeiten** legt eine **neue Version** an. Alte Versionen bleiben unter **Versionen**
  lesbar.
- **Löschen** blendet den Eintrag aus; mit „gelöschte anzeigen“ lässt er sich wiederherstellen.
- Es gibt kein Rückgängig für die Bibliothek – dafür die Versionen.

## Verwenden

Im Terminplan einen Vorgang wählen → **Aufwandswert …** (oder im Eigenschaften-Dialog
**Herleiten …**). Bautakt rechnet

`Dauer [AT] = Menge × AW × (1 + Zu-/Abschläge) ÷ (AK × h/AT)`, aufgerundet,

und speichert den Rechenweg als Formelzeile. Der verwendete Wert wird im Projekt **eingefroren**:
Spätere Änderungen in der Bibliothek ändern das Projekt nicht. Gibt es eine neuere Version, zeigt
der Terminplan einen Hinweis; umgestellt wird nur auf Ihren Klick.

## Kostenkennwerte

Unterreiter **Kostenkennwerte**: Bezeichnung, Kostengruppe (DIN 276), Bezugseinheit (z. B.
„m² BGF“), Von/Mittel/Bis, Stand, **Baupreisindex zum Stand** und Quelle (Pflicht). Keine
BKI-Daten übernehmen – nur eigene Werte mit Quelle.

In der Kostenplanung übernehmen Sie einen Kennwert in eine Kostenzeile; Werte, Quelle, Stand und
Index werden im Projekt eingefroren. Die Indexierung auf den aktuellen Stand rechnet die
Kostenplanung selbst.
