# Bautakt – Referenzbeispiele (Testfälle)

Diese Beispiele sind verbindliche Tests der Rechenbibliotheken (`packages/rechnen-*`).
Rechenregeln: `architektur.md`, Abschnitt 5. Zeiten in AT, kontinuierliche Zeitpunkte ab 0.
Alle Sollwerte wurden unabhängig nachgerechnet.

---

## R-01 Fertigteilhalle (UE 05, Beispielaufgabe aus PVM) – Netzplan EA

**Quelle:** UE 05 „Termine, Kosten, Nachhaltigkeit“, Folien 10–16.

| Nr. | Vorgang | D | Vorgänger |
|---|---|---|---|
| 1 | Planung | 70 | – (nach Beauftragung) |
| 2 | Erdarbeiten | 20 | `1EA+10` |
| 3 | Beschaffung/Vormontage FTE | 20 | `1EA+15` |
| 4 | Fundamente | 35 | `2EA; 3EA` |
| 5 | Produktion/Lieferung | 80 | `3EA` |
| 6 | Montage | 50 | `4EA+30; 5EA` |

Start-Meilenstein „Beauftragung“, Ende-Meilenstein „Abnahme“.

**Sollwerte:**

| Nr. | FAZ | FEZ | SAZ | SEZ | GP | FP | kritisch |
|---|---|---|---|---|---|---|---|
| 1 | 0 | 70 | 0 | 70 | 0 | 0 | ja |
| 2 | 80 | 100 | 100 | 120 | 20 | 5 | nein |
| 3 | 85 | 105 | 85 | 105 | 0 | 0 | ja |
| 4 | 105 | 140 | 120 | 155 | 15 | 15 | nein |
| 5 | 105 | 185 | 105 | 185 | 0 | 0 | ja |
| 6 | 185 | 235 | 185 | 235 | 0 | 0 | ja |

- Projektdauer **235 AT**
- Kritischer Pfad: **Beauftragung → 1 → 3 → 5 → 6 → Abnahme**
- Prüfregel: FP ≤ GP für alle Vorgänge.

## R-02 Fertigteilhalle mit Soll-Ende 220 AT (negative Puffer, E-19)

Wie R-01, Rückwärtsrechnung **vom Soll-Ende T = 220**:

| Nr. | SAZ | SEZ | GP | FP |
|---|---|---|---|---|
| 1 | −15 | 55 | −15 | 0 |
| 2 | 85 | 105 | 5 | 5 |
| 3 | 70 | 90 | −15 | 0 |
| 4 | 105 | 140 | 0 | 0 |
| 5 | 90 | 170 | −15 | 0 |
| 6 | 170 | 220 | −15 | 0 |

- FAZ/FEZ unverändert wie R-01; berechnetes Ende 235 > Soll-Ende 220 → **Überschreitung 15 AT**, rot markiert.
- Kritisch (minimaler GP = −15): 1, 3, 5, 6.

## R-03 Anfang-Anfang mit Abstand (UE 05, Folie 17)

„4 Tage nach Beginn der Baugrubenherstellung, die 6 Tage dauert, kann mit der Herstellung der Sauberkeitsschicht begonnen werden, welche einen Tag dauert.“

| Nr. | Vorgang | D | Vorgänger |
|---|---|---|---|
| 1 | Baugrube | 6 | – |
| 2 | Sauberkeitsschicht | 1 | `1AA+4` |

| Nr. | FAZ | FEZ | SAZ | SEZ | GP | FP |
|---|---|---|---|---|---|---|
| 1 | 0 | 6 | 0 | 6 | 0 | 0 |
| 2 | 4 | 5 | 5 | 6 | 1 | 1 |

Hinweis: Die Folie zeichnet die Baugrube mit Dauer 10; maßgebend ist der Text (6 Tage).

## R-04 Alle Beziehungsarten und negativer Abstand (eigenes Beispiel)

| Nr. | Vorgang | D | Vorgänger |
|---|---|---|---|
| A | A | 5 | – |
| B | B | 3 | `A EE+2` |
| C | C | 4 | `A AE+6` |
| D | D | 2 | `B EA-1` |

| Nr. | FAZ | FEZ | SAZ | SEZ | GP | FP | kritisch |
|---|---|---|---|---|---|---|---|
| A | 0 | 5 | 0 | 5 | 0 | 0 | ja |
| B | 4 | 7 | 4 | 7 | 0 | 0 | ja |
| C | 2 | 6 | 4 | 8 | 2 | 2 | nein |
| D | 6 | 8 | 6 | 8 | 0 | 0 | ja |

Projektdauer 8 AT.

## R-05 Zirkelbezug

1 → 2 (`1EA`), 2 → 3 (`2EA`), 3 → 1 (`3EA`): Eingabe der letzten Beziehung wird **abgelehnt**, Fehlermeldung nennt den Zyklus `1 → 2 → 3 → 1`.

## R-06 Syntax der Vorgänger-Spalte

| Eingabe | Ergebnis |
|---|---|
| `3` | Vorgänger 3, EA, +0 AT |
| `1EA+10` | 1, EA, +10 AT |
| `4ea+30kt` | 4, EA, +30 KT |
| `2AA-2` | 2, AA, −2 AT |
| `3 Ende-Anfang +15 Tage` | 3, EA, +15 AT |
| `5 Anfang-Anfang +3 Kalendertage` | 5, AA, +3 KT |
| `1EA+10; 3EA+15` | zwei Beziehungen |
| `1XY+3` | Fehler an Position 2: unbekannte Beziehungsart |
| `99` (gibt es nicht) | Fehler: Vorgang 99 existiert nicht |

## R-07 Kalender NRW, Ruhezeit, Datumsanzeige

Projektstart **Mo 14.12.2026**, Mo–Fr, Feiertage NRW, Ruhezeit **21.12.2026–01.01.2027** (Weihnachtspause).

- Vorgang A: FAZ 0, D = 10 AT → **Anfang Mo 14.12.2026, Ende Fr 08.01.2027**
  (AT 1–5 = 14.–18.12.; Pause; AT 6–10 = 04.–08.01.2027; 06.01. ist in NRW kein Feiertag).
- Feiertage NRW 2027, die erkannt werden müssen: 01.01., 26.03. (Karfreitag), 29.03. (Ostermontag), 01.05., 06.05. (Himmelfahrt), 17.05. (Pfingstmontag), 27.05. (Fronleichnam), 03.10., 01.11., 25.12., 26.12.
- Feiertage NRW 2026 (Kontrolle): 03.04., 06.04., 14.05., 25.05., 04.06.

## R-08 Kalendertage-Abstand (KT)

Wie R-07, dazu Vorgang B mit Vorgänger `A EA+21KT`:

- Ende A = Fr 08.01.2027 → Zeitpunkt Beginn Sa 09.01.2027, + 21 KT = Sa 30.01.2027 → nächster Arbeitstag
- **Anfang B = Mo 01.02.2027**
- Intern: FEZ_A = 10, FAZ_B = 25 (Anfang = AT 26 = Mo 01.02.2027).
- Gegenprobe: mit `A EA+21` (AT) ist FAZ_B = 31 → Anfang = AT 32 = **Di 09.02.2027**.

## R-09 Aufwandswerte (UE 05, Folie 21, fiktive Beispielwerte)

Formel: Dauer [AT] = Menge × AW ÷ (AK × h/AT), aufrunden auf ganze AT.

| Vorgang | Menge | AW | Lohnstunden | Kolonne | Dauer | Rechenweg (erwartete Formelzeile) |
|---|---|---|---|---|---|---|
| Schalung Ortbetonwände | 650 m² | 0,50 h/m² | 325 h | 4 AK × 8 h = 32 h/AT | 10,16 → **11 AT** | `650 m² × 0,50 h/m² = 325 h ÷ (4 × 8 h) = 10,2 → 11 AT` |
| Montage Fertigteilstützen | 24 Stk | 2,0 h/Stk | 48 h | 32 h/AT | 1,5 → **2 AT** | `24 Stk × 2,00 h/Stk = 48 h ÷ (4 × 8 h) = 1,5 → 2 AT` |

Mit Zuschlag „Winterbau +15 %“ auf Schalung: 325 h × 1,15 = 373,75 h ÷ 32 = 11,68 → **12 AT**.

## R-10 Kostenzeile mit Index, Regionalfaktor, MwSt. (fiktive Testwerte)

| Größe | Wert |
|---|---|
| Menge | 1.200 m² BGF |
| KKW gewählt (Stand) | 2.400,00 €/m² BGF, Index zum Stand 120,0 |
| Index aktuell | 132,0 |
| Regionalfaktor | 1,05 |

- KKW indexiert = 2.400 × 132,0 / 120,0 = 2.640,00 €/m²
- mit Regionalfaktor = 2.640 × 1,05 = **2.772,00 €/m²**
- Kosten netto = 1.200 × 2.772 = **3.326.400,00 €**
- MwSt. 19 % = 632.016,00 € · brutto = **3.958.416,00 €**
- Vorsteuerabzug = ja → maßgebend **netto**.

## R-11 DIN 277 Flächenableitung (fiktive Testwerte)

NUF 800 m², TF 60 m², VF 140 m², KGF 150 m²:
NRF = 800 + 60 + 140 = **1.000 m²**, BGF = NRF + KGF = **1.150 m²**.
