/**
 * Glossar der Fachbegriffe (E-29, E-83): kurze Erklärungen in eigenen Worten mit
 * Mini-Beispiel (Fertigteilhalle aus den Übungen). Kein Normtext.
 */
export interface GlossarEintrag {
  /** Begriff, wie er in der Oberfläche steht, z. B. „GP“ */
  begriff: string;
  /** ausgeschriebene Form, z. B. „Gesamtpuffer“ */
  lang?: string;
  erklaerung: string;
  beispiel?: string;
  /** weitere Schreibweisen, die in Hilfetexten erkannt werden */
  auch?: string[];
}

export const GLOSSAR: readonly GlossarEintrag[] = [
  // --- Zeit und Netzplan (DIN 69900) ---------------------------------------------------
  {
    begriff: 'AT',
    lang: 'Arbeitstag',
    erklaerung:
      'Zähleinheit für Dauern und Termine im Netzplan. Wochenenden, Feiertage und Ruhezeiten zählen nicht.',
    beispiel: 'Ein Vorgang mit 5 AT, der am Montag beginnt, endet am Freitag.',
    auch: ['Arbeitstage'],
  },
  {
    begriff: 'KT',
    lang: 'Kalendertag',
    erklaerung:
      'Jeder Tag zählt, auch Wochenenden und Feiertage – z. B. für Trocknungs- oder Aushärtezeiten.',
    beispiel: '„3EA+21KT“: 21 Kalendertage nach dem Ende von Vorgang 3 (Estrich trocknen).',
    auch: ['Kalendertage'],
  },
  {
    begriff: 'FAZ',
    lang: 'Frühester Anfangszeitpunkt',
    erklaerung:
      'Frühestmöglicher Beginn eines Vorgangs, wenn alle Vorgänger so früh wie möglich liegen (Vorwärtsrechnung).',
    beispiel: 'Erdarbeiten mit „1EA+10“ nach Planung (FEZ 70): FAZ = 80.',
  },
  {
    begriff: 'FEZ',
    lang: 'Frühester Endzeitpunkt',
    erklaerung: 'FAZ plus Dauer.',
    beispiel: 'FAZ 80, Dauer 20 AT → FEZ 100.',
  },
  {
    begriff: 'SAZ',
    lang: 'Spätester Anfangszeitpunkt',
    erklaerung:
      'Spätester Beginn, ohne das Projektende zu verschieben (Rückwärtsrechnung): SEZ minus Dauer.',
    beispiel: 'SEZ 105, Dauer 20 AT → SAZ 85.',
  },
  {
    begriff: 'SEZ',
    lang: 'Spätester Endzeitpunkt',
    erklaerung:
      'Spätestes Ende, ohne das Projektende zu verschieben – aus den Nachfolgern zurückgerechnet.',
    beispiel: 'Nachfolger beginnt spätestens bei 105 (EA ohne Abstand) → SEZ 105.',
  },
  {
    begriff: 'GP',
    lang: 'Gesamtpuffer',
    erklaerung:
      'Um so viele AT lässt sich ein Vorgang verschieben, ohne dass das Projektende später wird: SAZ − FAZ. Negativ, wenn ein Soll-Ende nicht erreichbar ist.',
    beispiel: 'FAZ 80, SAZ 85 → GP 5 AT.',
    auch: ['Gesamtpuffer'],
  },
  {
    begriff: 'FP',
    lang: 'Freier Puffer',
    erklaerung:
      'Verschiebung, die kein Nachfolger bemerkt – der Nachfolger kann trotzdem zu seinem FAZ beginnen.',
    beispiel: 'Vorgang endet bei 100, Nachfolger beginnt frühestens bei 105 → FP 5 AT.',
    auch: ['Freier Puffer'],
  },
  {
    begriff: 'EA',
    lang: 'Ende-Anfang-Beziehung (Normalfolge)',
    erklaerung: 'Der Nachfolger beginnt nach dem Ende des Vorgängers, optional mit Abstand.',
    beispiel: '„1EA+10“: 10 AT nach dem Ende von Vorgang 1.',
  },
  {
    begriff: 'AA',
    lang: 'Anfang-Anfang-Beziehung',
    erklaerung: 'Der Nachfolger beginnt frühestens mit (bzw. nach) dem Anfang des Vorgängers.',
    beispiel: '„3AA+5“: 5 AT nach dem Beginn der Erdarbeiten darf die Gründung anfangen.',
  },
  {
    begriff: 'EE',
    lang: 'Ende-Ende-Beziehung',
    erklaerung: 'Der Nachfolger endet frühestens mit (bzw. nach) dem Ende des Vorgängers.',
    beispiel: '„4EE+2“: Die Abdichtung endet 2 AT nach dem Mauerwerk.',
  },
  {
    begriff: 'AE',
    lang: 'Anfang-Ende-Beziehung (Sprungfolge)',
    erklaerung:
      'Der Nachfolger endet frühestens nach dem Anfang des Vorgängers – selten gebraucht.',
    beispiel: '„6AE“: Die Baustelleneinrichtung bleibt, bis die Montage beginnt.',
  },
  {
    begriff: 'Anordnungsbeziehung',
    erklaerung:
      'Abhängigkeit zwischen zwei Vorgängen (EA, AA, EE, AE) mit optionalem Abstand in AT oder KT.',
    beispiel: 'In der Spalte „Vorgänger“: „1EA+10; 3EA+15“.',
    auch: ['Anordnungsbeziehungen', 'Beziehung', 'Beziehungen'],
  },
  {
    begriff: 'Kritischer Weg',
    erklaerung:
      'Kette von Vorgängen ohne Puffer (GP = minimal, meist 0). Jede Verzögerung dort verschiebt das Projektende. Rot dargestellt.',
    beispiel: 'Planung → Beschaffung → Produktion → Montage.',
    auch: ['kritisch', 'kritische', 'kritischen Weg'],
  },
  {
    begriff: 'Vorgang',
    erklaerung: 'Arbeitspaket mit Dauer, das Zeit verbraucht.',
    beispiel: '„Fundamente, 35 AT, Quelle: Aufwandswert“.',
    auch: ['Vorgänge', 'Einzelvorgang'],
  },
  {
    begriff: 'Sammelvorgang',
    erklaerung:
      'Fasst Unterpunkte zusammen; Anfang und Ende ergeben sich aus ihnen. Hat selbst keine Beziehungen.',
    beispiel: '„Bauausführung“ mit Erdarbeiten, Fundamenten, Montage.',
    auch: ['Sammelvorgänge'],
  },
  {
    begriff: 'Meilenstein',
    erklaerung:
      'Ereignis ohne Dauer (0 AT), z. B. ein Vertrags- oder Übergabetermin. Raute im Balkenplan.',
    beispiel: '„Abnahme“ nach der Montage.',
    auch: ['Meilensteine'],
  },
  {
    begriff: 'Schnittstellentermin',
    erklaerung:
      'Meilenstein an einer Schnittstelle zu anderen Beteiligten, oft mit Bedingung „nicht früher als“ oder „muss enden am“. Orange dargestellt.',
    beispiel: '„Übergabe des freien Baufelds nicht früher als 01.03.“',
    auch: ['Schnittstellentermine', 'Schnittstelle'],
  },
  {
    begriff: 'Soll-Ende',
    erklaerung:
      'Vorgegebenes Projektende. Wahlweise wird vom Soll-Ende zurückgerechnet; dann zeigen negative Puffer, dass es nicht erreichbar ist.',
    beispiel: 'Projektstart + 15 Monate.',
  },
  {
    begriff: 'Rahmenterminplan',
    erklaerung:
      'Grober Plan auf oberster Ebene – in Bautakt durch Zuklappen der Sammelvorgänge, ohne doppelte Pflege.',
    beispiel: '„Gliederung → nur Ebene 1“.',
  },
  {
    begriff: 'Netzplan',
    erklaerung:
      'Vorgänge als Kästchen (Vorgangsknoten) mit FAZ, FEZ, SAZ, SEZ, GP, FP und Pfeilen für die Beziehungen.',
  },
  {
    begriff: 'Balkenplan',
    erklaerung:
      'Vorgänge als Balken auf einer Zeitachse; vernetzt mit Pfeilen für die Beziehungen.',
    auch: ['Gantt'],
  },
  {
    begriff: 'Liniendiagramm',
    lang: 'Weg-Zeit-Diagramm',
    erklaerung:
      'Zeigt, wann welche Arbeit an welchem Ort stattfindet; jede Linie ist ein Vorgang über einen Ortsbereich.',
    beispiel: 'Rohbau EG → 1. OG → 2. OG als ansteigende Linie.',
  },
  {
    begriff: 'Taktzug',
    erklaerung:
      'Gleiche Arbeiten wiederholen sich Ort für Ort im Takt; in Bautakt „Über Takte vervielfältigen“.',
    beispiel: 'Schalen, Bewehren, Betonieren je Geschoss.',
    auch: ['Takt', 'Taktplanung'],
  },
  {
    begriff: 'MTA',
    lang: 'Meilenstein-Trendanalyse',
    erklaerung:
      'Verfolgt die prognostizierten Meilensteintermine über mehrere Berichte. Steigende Linie = Termin rutscht nach hinten.',
  },
  {
    begriff: 'Stichtag',
    erklaerung: 'Stand der Ist-Meldungen; ab hier rechnet Bautakt die Prognose.',
    beispiel: 'Stichtag = Datum der Baubesprechung.',
  },
  {
    begriff: 'Prognose',
    erklaerung:
      'Neu gerechneter Plan ab dem Stichtag: fertige Vorgänge liegen fest, begonnene enden nach ihrer Restdauer, offene beginnen frühestens am Stichtag.',
  },
  {
    begriff: 'Restdauer',
    erklaerung:
      'Noch benötigte AT eines begonnenen Vorgangs ab dem Stichtag. Hat Vorrang vor dem Fertigstellungsgrad.',
    beispiel: 'Ausbau begonnen, noch 12 AT → endet 12 AT nach dem Stichtag.',
  },
  {
    begriff: 'Fertigstellungsgrad',
    erklaerung: 'Geschätzter Anteil der erledigten Arbeit in %; daraus ergibt sich die Restdauer.',
    beispiel: '20 AT, 50 % → Restdauer 10 AT.',
  },
  {
    begriff: 'Soll-Stand',
    erklaerung:
      'Eingefrorener, benannter Stand des Projekts (Baseline), z. B. „Soll Vertrag“ – Grundlage für Soll-Ist-Vergleiche.',
    auch: ['Stand', 'Stände', 'Soll-Stände'],
  },
  {
    begriff: 'Quelle/Annahme',
    erklaerung:
      'Pflichtangabe, woher eine Dauer oder ein Wert stammt – nachvollziehbar für Prüfer und Bauherrschaft.',
    beispiel: '„Aufwandswert 0,50 h/m², UE 05“ oder „Herstellerangabe“.',
  },
  // --- Aufwandswerte ---------------------------------------------------------------------
  {
    begriff: 'Aufwandswert',
    lang: 'AW',
    erklaerung: 'Lohnstunden je Mengeneinheit. Dauer = Menge × AW ÷ (AK × h/AT).',
    beispiel: '650 m² × 0,50 h/m² = 325 h ÷ (4 × 8 h) = 10,2 → 11 AT.',
    auch: ['Aufwandswerte', 'AW'],
  },
  {
    begriff: 'AK',
    lang: 'Arbeitskräfte',
    erklaerung: 'Anzahl der Arbeitskräfte einer Kolonne.',
    beispiel: '4 AK × 8 h = 32 h je Arbeitstag.',
  },
  // --- Kosten (DIN 276/277) ------------------------------------------------------------
  {
    begriff: 'KG',
    lang: 'Kostengruppe',
    erklaerung:
      'Gliederung der Kosten nach DIN 276 in drei Ebenen; übergeordnete Gruppen summieren die Untergruppen.',
    beispiel: '300 Bauwerk – Baukonstruktionen → 330 Außenwände → 331 Tragende Außenwände.',
    auch: ['Kostengruppe', 'Kostengruppen'],
  },
  {
    begriff: 'KKW',
    lang: 'Kostenkennwert',
    erklaerung:
      'Kosten je Bezugseinheit mit Quelle und Stand, z. B. €/m² BGF. Von/Mittel/Bis geben die Spanne an.',
    beispiel: '2.400 €/m² BGF × 1.200 m² = 2.880.000 €.',
    auch: ['Kostenkennwert', 'Kostenkennwerte', 'Kennwert', 'Kennwerte'],
  },
  {
    begriff: 'Baupreisindex',
    erklaerung:
      'Rechnet einen Kennwert von seinem Stand auf heute hoch: KKW × Index aktuell ÷ Index zum Stand.',
    beispiel: '2.400 € × 132,0 ÷ 120,0 = 2.640 €.',
    auch: ['Index'],
  },
  {
    begriff: 'Regionalfaktor',
    erklaerung: 'Passt bundesweite Kennwerte an das Preisniveau der Region an.',
    beispiel: '2.640 € × 1,05 = 2.772 €.',
  },
  {
    begriff: 'Vorsteuerabzug',
    erklaerung:
      'Kann die Bauherrschaft die MwSt. zurückholen, sind die Netto-Kosten maßgebend, sonst die Brutto-Kosten.',
    auch: ['vorsteuerabzugsberechtigt'],
  },
  {
    begriff: 'BGF',
    lang: 'Brutto-Grundfläche',
    erklaerung:
      'Gesamte Grundfläche aller Geschosse einschließlich Konstruktion: NRF + KGF. Übliche Bezugsfläche für KG 300/400.',
    beispiel: 'NRF 1.000 m² + KGF 150 m² = BGF 1.150 m².',
  },
  {
    begriff: 'NRF',
    lang: 'Netto-Raumfläche',
    erklaerung: 'Nutzbare Grundfläche zwischen den Bauteilen: NUF + TF + VF.',
    beispiel: '800 + 60 + 140 = 1.000 m².',
  },
  {
    begriff: 'NUF',
    lang: 'Nutzungsfläche',
    erklaerung:
      'Fläche für die eigentliche Nutzung, unterteilt in NUF 1–7 (z. B. NUF 3 Produktion).',
  },
  {
    begriff: 'TF',
    lang: 'Technikfläche',
    erklaerung: 'Fläche für Haustechnik, z. B. Heizungsraum.',
  },
  { begriff: 'VF', lang: 'Verkehrsfläche', erklaerung: 'Flure, Treppen, Aufzugsschächte.' },
  {
    begriff: 'KGF',
    lang: 'Konstruktions-Grundfläche',
    erklaerung: 'Grundfläche der Wände, Stützen und Schächte.',
  },
  {
    begriff: 'AF',
    lang: 'Außenanlagenfläche',
    erklaerung: 'Fläche der Außenanlagen; Bezugsfläche für KG 500.',
  },
  {
    begriff: 'GF',
    lang: 'Grundstücksfläche',
    erklaerung: 'Fläche des Grundstücks; Bezugsfläche für KG 100 und 200.',
  },
  {
    begriff: 'Kostenrahmen',
    erklaerung: 'Erste, grobe Kostenstufe nach DIN 276 (Bedarfsplanung), meist nur 1. Ebene.',
  },
  {
    begriff: 'Kostenschätzung',
    erklaerung: 'Kostenstufe auf Grundlage der Vorplanung, mindestens 2. Ebene.',
  },
  {
    begriff: 'Kostenberechnung',
    erklaerung:
      'Kostenstufe auf Grundlage der Entwurfsplanung, mindestens 3. Ebene; übliche Bezugsstufe für den Soll-Ist-Vergleich.',
  },
  {
    begriff: 'Kostenanschlag',
    erklaerung: 'Kostenstufe nach der Vergabe – in Bautakt die Summe der Aufträge.',
  },
  {
    begriff: 'Kostenfeststellung',
    erklaerung: 'Tatsächliche Kosten nach Abschluss – in Bautakt die Summe der Rechnungen.',
  },
  {
    begriff: 'Bezugsstufe',
    erklaerung: 'Kostenstufe, gegen die Prognose und Abweichung gerechnet werden.',
  },
  // --- Statistik -------------------------------------------------------------------------
  {
    begriff: 'Faktor',
    lang: 'Ist ÷ Soll',
    erklaerung: 'Über 1 = länger bzw. teurer als geplant, unter 1 = schneller bzw. günstiger.',
    beispiel: 'Soll 10 AT, Ist 12 AT → Faktor 1,2 (20 % länger).',
  },
  {
    begriff: 'Median',
    erklaerung: 'Mittlerer Wert der sortierten Reihe – unempfindlich gegen Ausreißer.',
    beispiel: '1,1 · 1,2 · 1,9 → Median 1,2.',
  },
  {
    begriff: 'Streuung',
    lang: 'Standardabweichung',
    erklaerung: 'Wie weit die Werte um den Mittelwert schwanken; klein = verlässlich.',
  },
];

/** Eintrag zu einem Begriff (Groß-/Kleinschreibung egal, auch über Nebenformen). */
export function glossarEintrag(begriff: string): GlossarEintrag | undefined {
  const k = begriff.trim().toLowerCase();
  return GLOSSAR.find(
    (e) => e.begriff.toLowerCase() === k || e.auch?.some((a) => a.toLowerCase() === k),
  );
}

/**
 * Glossarbegriffe in einem Text finden (für Hilfetexte): ganze Wörter, längere Begriffe zuerst.
 * Abkürzungen (nur Großbuchstaben) nur in exakter Schreibweise.
 */
export function begriffeFinden(
  text: string,
): { start: number; ende: number; eintrag: GlossarEintrag }[] {
  const formen = GLOSSAR.flatMap((e) => [e.begriff, ...(e.auch ?? [])].map((f) => ({ f, e })))
    .filter(({ f }) => f.length >= 2)
    .sort((a, b) => b.f.length - a.f.length);
  const treffer: { start: number; ende: number; eintrag: GlossarEintrag }[] = [];
  const belegt = (s: number, e: number) => treffer.some((t) => s < t.ende && e > t.start);
  for (const { f, e } of formen) {
    const abk = f === f.toUpperCase();
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}])${f.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![\\p{L}\\p{N}])`,
      abk ? 'gu' : 'giu',
    );
    for (let m = re.exec(text); m; m = re.exec(text))
      if (!belegt(m.index, m.index + m[0].length))
        treffer.push({ start: m.index, ende: m.index + m[0].length, eintrag: e });
  }
  return treffer.sort((a, b) => a.start - b.start);
}
