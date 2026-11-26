# Bibliothek

Die Bibliothek enthält Ihre **Aufwandswerte** (h je Mengeneinheit) mit Quelle und Stand. Sie gilt
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
