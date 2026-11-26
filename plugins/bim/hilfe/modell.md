## Modell (IFC-Viewer)

Zeigt IFC-Modelle aus Autorenwerkzeugen wie BIMCraft, FreeCAD, Revit oder Archicad. Gelesen
werden IFC2x3 und IFC4. Modelliert wird nicht in Bautakt, sondern im Autorenwerkzeug; nach
Änderungen exportieren Sie dort erneut als IFC.

### Modell einlesen

**IFC einlesen …** übernimmt eine IFC-Datei in die Projektdatei – das Projekt bleibt eine einzige
Datei, die Sie weitergeben können. Mehrere Fachmodelle (z. B. Architektur, Tragwerk, TGA) sind
möglich; sie erscheinen gemeinsam. In der Bauteilliste lässt sich ein Modell umbenennen (✎) oder
entfernen (×). Einlesen und Entfernen sind mit Strg+Z rückgängig zu machen.

### Navigieren

| Bedienung               | Wirkung                          |
| ----------------------- | -------------------------------- |
| linke Maustaste ziehen  | drehen                           |
| rechte Maustaste ziehen | verschieben                      |
| Mausrad                 | zoomen                           |
| Klick auf ein Bauteil   | auswählen, Eigenschaften zeigen  |
| Doppelklick             | auf die Auswahl zoomen           |
| Esc                     | Auswahl aufheben, Messen beenden |

**Einpassen** zeigt das ganze Modell, **Ansicht …** wechselt zwischen Isometrie, Draufsicht,
Vorder- und Seitenansicht.

### Bauteilliste

Gegliedert nach Modell → Geschoss → IFC-Klasse → Bauteil. Das Kästchen blendet ein Bauteil, eine
Klasse, ein Geschoss oder ein ganzes Modell ein und aus. **◎** zeigt nur diesen Zweig
(isolieren), Doppelklick zoomt darauf. **Alles zeigen** blendet alles wieder ein. Ausblenden,
Schnitt und Messungen gehören zur Ansicht und werden nicht im Projekt gespeichert.

### Eigenschaften

Rechts stehen die Attribute (Klasse, GlobalId, Name …), der Typ, die Eigenschaftssätze (Psets)
und die Mengen aus den BaseQuantities (z. B. `Qto_WallBaseQuantities`), umgerechnet in m, m²
und m³.

### Schnitt

- **Geschossschnitt:** schneidet 1,2 m über dem Fußboden des gewählten Geschosses und zeigt von
  oben – wie ein Grundriss.
- **Frei verschiebbar:** waagerecht oder senkrecht entlang X bzw. Z; der Schieber verschiebt die
  Ebene, **⇅ Seite** zeigt die andere Hälfte.

### Messen

**📏 Messen** einschalten und nacheinander zwei Punkte auf Bauteiloberflächen anklicken – der
Abstand erscheint in Metern. **Messungen löschen** entfernt alle Maße.

### Mengen und Kostengruppen (5D)

Beim Einlesen ermittelt Bautakt je Bauteil Fläche, Volumen und Länge – zuerst aus den
**BaseQuantities** des Modells, sonst aus der **Geometrie** (Volumen und Hauptfläche = größte
Ansichtsseite, z. B. die Seitenfläche einer Wand). Die Herkunft steht oben in der
Eigenschaften-Leiste.

Welche **Kostengruppe** ein Bauteil bekommt, regelt die Tabelle **Regeln …**: IFC-Klasse,
optional PredefinedType, außen/tragend (aus IsExternal/LoadBearing) und „Name/Typ enthält“ →
Kostengruppe und Mengenart (Fläche, Volumen, Länge, Stück). Es gilt die erste passende Regel von
oben. Fehlen im Modell IsExternal und LoadBearing, hilft „Name/Typ enthält“ (z. B. „Exterior“ →
331). Einzelne Bauteile ordnen Sie in der Eigenschaften-Leiste mit **Ändern …** abweichend zu.

Die Bauteilliste lässt sich **nach Kostengruppe** gliedern; jede KG zeigt dann ihre Summe. In
der Kostenplanung wählen Sie bei einer Zeile als Menge **aus dem Modell (IFC)** – die Menge folgt
Modell, Regeln und Zuordnungen automatisch.
