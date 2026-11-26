/**
 * Kostengruppen nach DIN 276:2018-12 bis zur 3. Ebene (E-55): nur Nummer und Kurzbezeichnung,
 * kein Normtext. Aus Fachwissen zusammengestellt – bei Abweichungen zur Norm gilt die Norm.
 */
const ROH = `
100 Grundstück
110 Grundstückswert
120 Grundstücksnebenkosten
121 Vermessungsgebühren
122 Gerichtsgebühren
123 Notariatsgebühren
124 Maklerprovisionen
125 Grunderwerbsteuer
126 Wertermittlungen, Untersuchungen
127 Genehmigungsgebühren
128 Bodenordnung, Grenzregulierung
129 Sonstiges zur KG 120
130 Rechte Dritter
131 Abfindungen
132 Ablösen dinglicher Rechte
139 Sonstiges zur KG 130
200 Vorbereitende Maßnahmen
210 Herrichten
211 Sicherungsmaßnahmen
212 Abbruchmaßnahmen
213 Altlastenbeseitigung
214 Herrichten der Geländeoberfläche
215 Kampfmittelräumung
216 Kulturhistorische Funde
219 Sonstiges zur KG 210
220 Öffentliche Erschließung
221 Abwasserentsorgung
222 Wasserversorgung
223 Gasversorgung
224 Fernwärmeversorgung
225 Stromversorgung
226 Telekommunikation
227 Verkehrserschließung
228 Abfallentsorgung
229 Sonstiges zur KG 220
230 Nichtöffentliche Erschließung
240 Ausgleichsmaßnahmen und -abgaben
241 Ausgleichsmaßnahmen
242 Ausgleichsabgaben
249 Sonstiges zur KG 240
250 Übergangsmaßnahmen
251 Provisorien
252 Auslagerungen
259 Sonstiges zur KG 250
300 Bauwerk – Baukonstruktionen
310 Baugrube/Erdbau
311 Herstellung
312 Umschließung
313 Wasserhaltung
314 Vortrieb
319 Sonstiges zur KG 310
320 Gründung, Unterbau
321 Baugrundverbesserung
322 Flachgründungen und Bodenplatten
323 Tiefgründungen
324 Gründungsbeläge
325 Abdichtungen und Bekleidungen
326 Dränagen
329 Sonstiges zur KG 320
330 Außenwände/Vertikale Baukonstruktionen, außen
331 Tragende Außenwände
332 Nichttragende Außenwände
333 Außenstützen
334 Außenwandöffnungen
335 Außenwandbekleidungen, außen
336 Außenwandbekleidungen, innen
337 Elementierte Außenwandkonstruktionen
338 Lichtschutz zur KG 330
339 Sonstiges zur KG 330
340 Innenwände/Vertikale Baukonstruktionen, innen
341 Tragende Innenwände
342 Nichttragende Innenwände
343 Innenstützen
344 Innenwandöffnungen
345 Innenwandbekleidungen
346 Elementierte Innenwandkonstruktionen
347 Lichtschutz zur KG 340
349 Sonstiges zur KG 340
350 Decken/Horizontale Baukonstruktionen
351 Deckenkonstruktionen
352 Deckenöffnungen
353 Deckenbeläge
354 Deckenbekleidungen
355 Elementierte Deckenkonstruktionen
359 Sonstiges zur KG 350
360 Dächer
361 Dachkonstruktionen
362 Dachöffnungen
363 Dachbeläge
364 Dachbekleidungen
365 Elementierte Dachkonstruktionen
366 Lichtschutz zur KG 360
369 Sonstiges zur KG 360
370 Infrastrukturanlagen
371 Anlagen für den Straßenverkehr
372 Anlagen für den Schienenverkehr
373 Anlagen für den Flugverkehr
374 Anlagen des Wasserbaus
375 Anlagen der Abwasserentsorgung
376 Anlagen der Wasserversorgung
377 Anlagen der Energie- und Informationsversorgung
378 Anlagen der Abfallentsorgung
379 Sonstiges zur KG 370
380 Baukonstruktive Einbauten
381 Allgemeine Einbauten
382 Besondere Einbauten
383 Landschaftsgestalterische Einbauten
384 Mechanische Einbauten
385 Einbauten in Konstruktionen des Ingenieurbaus
386 Orientierungs- und Informationssysteme
387 Schutzeinbauten
389 Sonstiges zur KG 380
390 Sonstige Maßnahmen für Baukonstruktionen
391 Baustelleneinrichtung
392 Gerüste
393 Sicherungsmaßnahmen
394 Abbruchmaßnahmen
395 Instandsetzungen
396 Materialentsorgung
397 Zusätzliche Maßnahmen
398 Provisorische Baukonstruktionen
399 Sonstiges zur KG 390
400 Bauwerk – Technische Anlagen
410 Abwasser-, Wasser-, Gasanlagen
411 Abwasseranlagen
412 Wasseranlagen
413 Gasanlagen
419 Sonstiges zur KG 410
420 Wärmeversorgungsanlagen
421 Wärmeerzeugungsanlagen
422 Wärmeverteilnetze
423 Raumheizflächen
424 Verkehrsheizflächen
429 Sonstiges zur KG 420
430 Raumlufttechnische Anlagen
431 Lüftungsanlagen
432 Teilklimaanlagen
433 Klimaanlagen
434 Kälteanlagen
439 Sonstiges zur KG 430
440 Elektrische Anlagen
441 Hoch- und Mittelspannungsanlagen
442 Eigenstromversorgungsanlagen
443 Niederspannungsschaltanlagen
444 Niederspannungsinstallationsanlagen
445 Beleuchtungsanlagen
446 Blitzschutz- und Erdungsanlagen
447 Fahrleitungssysteme
449 Sonstiges zur KG 440
450 Kommunikations-, sicherheits- und informationstechnische Anlagen
451 Telekommunikationsanlagen
452 Such- und Signalanlagen
453 Zeitdienstanlagen
454 Elektroakustische Anlagen
455 Audiovisuelle Medien- und Antennenanlagen
456 Gefahrenmelde- und Alarmanlagen
457 Datenübertragungsnetze
458 Verkehrsbeeinflussungsanlagen
459 Sonstiges zur KG 450
460 Förderanlagen
461 Aufzugsanlagen
462 Fahrtreppen, Fahrsteige
463 Befahranlagen
464 Transportanlagen
465 Krananlagen
466 Hydraulikanlagen
469 Sonstiges zur KG 460
470 Nutzungsspezifische und verfahrenstechnische Anlagen
471 Küchentechnische Anlagen
472 Wäscherei-, Reinigungs- und badetechnische Anlagen
473 Medienversorgungsanlagen, Medizin- und labortechnische Anlagen
474 Feuerlöschanlagen
475 Prozesswärme-, -kälte- und -luftanlagen
476 Weitere nutzungsspezifische Anlagen
477 Verfahrenstechnische Anlagen, Wasser, Abwasser und Gase
478 Verfahrenstechnische Anlagen, Feststoffe, Wertstoffe und Abfälle
479 Sonstiges zur KG 470
480 Gebäude- und Anlagenautomation
481 Automationseinrichtungen
482 Schaltschränke, Automationsschwerpunkte
483 Automationsmanagement
484 Kabel, Leitungen und Verlegesysteme
485 Datenübertragungsnetze
489 Sonstiges zur KG 480
490 Sonstige Maßnahmen für technische Anlagen
491 Baustelleneinrichtung
492 Gerüste
493 Sicherungsmaßnahmen
494 Abbruchmaßnahmen
495 Instandsetzungen
496 Materialentsorgung
497 Zusätzliche Maßnahmen
498 Provisorische technische Anlagen
499 Sonstiges zur KG 490
500 Außenanlagen und Freiflächen
510 Erdbau
511 Herstellung
512 Umschließung
513 Wasserhaltung
514 Vortrieb
519 Sonstiges zur KG 510
520 Gründung, Unterbau
521 Baugrundverbesserung
522 Gründungen und Bodenplatten
523 Gründungsbeläge
524 Abdichtungen und Bekleidungen
525 Dränagen
529 Sonstiges zur KG 520
530 Oberbau, Deckschichten
531 Wege
532 Straßen
533 Plätze, Höfe, Terrassen
534 Stellplätze
535 Sportplatzflächen
536 Spielplatzflächen
537 Gleisanlagen
538 Flugplatzflächen
539 Sonstiges zur KG 530
540 Baukonstruktionen
541 Einfriedungen
542 Schutzkonstruktionen
543 Wandkonstruktionen
544 Rampen, Treppen, Tribünen
545 Überdachungen
546 Stege
547 Kanal- und Schachtkonstruktionen
548 Wasserbecken
549 Sonstiges zur KG 540
550 Technische Anlagen
551 Abwasseranlagen
552 Wasseranlagen
553 Anlagen für Gase und Flüssigkeiten
554 Wärmeversorgungsanlagen
555 Raumlufttechnische Anlagen
556 Elektrische Anlagen
557 Kommunikations-, sicherheits- und informationstechnische Anlagen
558 Nutzungsspezifische Anlagen
559 Sonstiges zur KG 550
560 Einbauten in Außenanlagen und Freiflächen
561 Allgemeine Einbauten
562 Besondere Einbauten
563 Orientierungs- und Informationssysteme
569 Sonstiges zur KG 560
570 Vegetationsflächen
571 Vegetationstechnische Bodenbearbeitung
572 Sicherungsbauweisen
573 Pflanzflächen
574 Rasen- und Saatflächen
579 Sonstiges zur KG 570
580 Wasserflächen
581 Befestigungen
582 Abdichtungen
583 Bepflanzungen
589 Sonstiges zur KG 580
590 Sonstige Maßnahmen für Außenanlagen und Freiflächen
591 Baustelleneinrichtung
592 Gerüste
593 Sicherungsmaßnahmen
594 Abbruchmaßnahmen
595 Instandsetzungen
596 Materialentsorgung
597 Zusätzliche Maßnahmen
598 Provisorische Außenanlagen und Freiflächen
599 Sonstiges zur KG 590
600 Ausstattung und Kunstwerke
610 Allgemeine Ausstattung
620 Besondere Ausstattung
630 Informationstechnische Ausstattung
640 Künstlerische Ausstattung
641 Kunstobjekte
642 Kunstbezogene Kosten
649 Sonstiges zur KG 640
690 Sonstige Ausstattung
700 Baunebenkosten
710 Bauherrenaufgaben
711 Projektleitung
712 Bedarfsplanung
713 Projektsteuerung
714 Sicherheits- und Gesundheitsschutzkoordination
715 Vergabeverfahren
719 Sonstiges zur KG 710
720 Vorbereitung der Objektplanung
721 Untersuchungen
722 Wertermittlungen
723 Städtebauliche Leistungen
724 Landschaftsplanerische Leistungen
725 Wettbewerbe
729 Sonstiges zur KG 720
730 Objektplanung
731 Gebäude und Innenräume
732 Freianlagen
733 Ingenieurbauwerke
734 Verkehrsanlagen
739 Sonstiges zur KG 730
740 Fachplanung
741 Tragwerksplanung
742 Technische Ausrüstung
743 Bauphysik
744 Geotechnik
745 Ingenieurvermessung
746 Lichttechnik, Tageslichttechnik
747 Brandschutz
748 Altlasten, Kampfmittel, kulturhistorische Funde
749 Sonstiges zur KG 740
750 Künstlerische Leistungen
751 Kunstwettbewerbe
752 Honorare
759 Sonstiges zur KG 750
760 Allgemeine Baunebenkosten
761 Gutachten und Beratung
762 Prüfungen, Genehmigungen, Abnahmen
763 Bewirtschaftungskosten
764 Bemusterungskosten
765 Betriebskosten nach der Abnahme
766 Versicherungen
769 Sonstiges zur KG 760
790 Sonstige Baunebenkosten
800 Finanzierung
810 Finanzierungsnebenkosten
820 Fremdkapitalzinsen
830 Eigenkapitalzinsen
840 Bürgschaften
890 Sonstige Finanzierungskosten
`;

export interface Kostengruppe {
  kg: number;
  /** 1 = x00, 2 = xy0, 3 = xyz */
  ebene: 1 | 2 | 3;
  bezeichnung: string;
}

/** Ebene einer KG-Nummer (100–899). */
export function kgEbene(kg: number): 1 | 2 | 3 {
  if (kg % 100 === 0) return 1;
  if (kg % 10 === 0) return 2;
  return 3;
}

/** Übergeordnete KG (331 → 330, 330 → 300, 300 → null). */
export function kgEltern(kg: number): number | null {
  const e = kgEbene(kg);
  if (e === 1) return null;
  return e === 2 ? Math.floor(kg / 100) * 100 : Math.floor(kg / 10) * 10;
}

/** Ist `vorfahr` eine übergeordnete KG von `kg` (nicht gleich)? */
export function kgUnter(kg: number, vorfahr: number): boolean {
  for (let e = kgEltern(kg); e !== null; e = kgEltern(e)) if (e === vorfahr) return true;
  return false;
}

export const KG_KATALOG: readonly Kostengruppe[] = ROH.trim()
  .split('\n')
  .map((zeile) => {
    const kg = Number(zeile.slice(0, 3));
    return { kg, ebene: kgEbene(kg), bezeichnung: zeile.slice(4).trim() };
  });

const NACH_NUMMER = new Map(KG_KATALOG.map((k) => [k.kg, k]));

export function kostengruppe(kg: number): Kostengruppe | undefined {
  return NACH_NUMMER.get(kg);
}

/** Bezugsfläche, die für eine KG vorgeschlagen wird (E-15, E-55). */
export function bezugsflaecheVorschlag(kg: number): 'BGF' | 'GF' | 'AF' {
  const h = Math.floor(kg / 100);
  if (h === 1 || h === 2) return 'GF';
  if (h === 5) return 'AF';
  return 'BGF';
}
