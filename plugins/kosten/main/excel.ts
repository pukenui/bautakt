import type { PluginDb } from '@bautakt/kern';
import {
  FLAECHE_TEXT,
  KOSTEN_URSACHEN,
  STUFE_TEXT,
  STUFEN,
  type Flaeche,
  type KostenUrsache,
  type Stufe,
} from '@bautakt/rechnen-kosten';
import ExcelJS from 'exceljs';
import type { KnotenDaten, KostenDaten } from '../gemeinsam/typen.js';
import { kostenDatenLaden, type KostenUmgebung } from './daten.js';
import { sollIstLaden } from './sollist.js';

const EURO = '#,##0.00 "€"';
const BETRAG = '#,##0.00';
const MENGE = '#,##0.##';
const FAKTOR = '0.0000';
const PROZENT = '0.0%';
const DATUM = 'dd.mm.yyyy';

/** Excel-Spaltenbuchstabe (1 → A). */
const sp = (n: number) => String.fromCharCode(64 + n);

function kopfzeile(ws: ExcelJS.Worksheet, zeile: number, titel: string[]): void {
  const r = ws.getRow(zeile);
  titel.forEach((t, i) => {
    const c = r.getCell(i + 1);
    c.value = t;
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0EC' } };
    c.border = { bottom: { style: 'thin' } };
    c.alignment = { vertical: 'bottom', wrapText: true };
  });
  ws.views = [{ state: 'frozen', ySplit: zeile }];
}

function titel(ws: ExcelJS.Worksheet, text: string, untertitel: string): void {
  ws.getCell('A1').value = text;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = untertitel;
  ws.getCell('A2').font = { color: { argb: 'FF555555' } };
}

/** Datum JJJJ-MM-TT als Excel-Datum (UTC, ohne Zeitzonenversatz). */
function excelDatum(iso: string | null): Date | null {
  if (!iso) return null;
  const [j, m, t] = iso.split('-').map(Number);
  return new Date(Date.UTC(j ?? 1970, (m ?? 1) - 1, t ?? 1));
}

/** Zeilenfolge des KG-Baums (Ebene 1 immer, darunter alle Knoten). */
function baumFolge(d: KostenDaten): KnotenDaten[] {
  const knoten = new Map(d.baum.map((k) => [k.kg, k]));
  const liste: KnotenDaten[] = [];
  const gehe = (k: KnotenDaten) => {
    liste.push(k);
    for (const c of k.kinder) gehe(knoten.get(c) as KnotenDaten);
  };
  for (const kg of [100, 200, 300, 400, 500, 600, 700, 800]) {
    const k = knoten.get(kg);
    if (k) gehe(k);
    else
      liste.push({
        kg,
        ebene: 1,
        bezeichnung: d.baum.find((b) => b.kg === kg)?.bezeichnung ?? '',
        summe: null,
        ausUnterzeilen: false,
        kinder: [],
        zeileId: null,
      });
  }
  return liste;
}

const KATALOG_EBENE1: Record<number, string> = {
  100: 'Grundstück',
  200: 'Vorbereitende Maßnahmen',
  300: 'Bauwerk – Baukonstruktionen',
  400: 'Bauwerk – Technische Anlagen',
  500: 'Außenanlagen und Freiflächen',
  600: 'Ausstattung und Kunstwerke',
  700: 'Baunebenkosten',
  800: 'Finanzierung',
};

/** Blatt „Flächen DIN 277“; liefert die Zelladresse je Fläche (für Mengenverweise). */
function flaechenBlatt(wb: ExcelJS.Workbook, d: KostenDaten): Map<Flaeche, string> {
  const ws = wb.addWorksheet('Flächen DIN 277');
  titel(ws, 'Flächen nach DIN 277', 'NUF = Σ NUF 1–7 · NRF = NUF + TF + VF · BGF = NRF + KGF');
  kopfzeile(ws, 4, ['Fläche', 'm²', 'Quelle']);
  ws.columns = [{ width: 46 }, { width: 14 }, { width: 40 }];
  const adresse = new Map<Flaeche, string>();
  const reihenfolge: Flaeche[] = [
    'NUF1',
    'NUF2',
    'NUF3',
    'NUF4',
    'NUF5',
    'NUF6',
    'NUF7',
    'NUF',
    'TF',
    'VF',
    'NRF',
    'KGF',
    'BGF',
    'AF',
    'GF',
  ];
  let z = 5;
  for (const f of reihenfolge) adresse.set(f, `B${z++}`);
  z = 5;
  const a = (f: Flaeche) => adresse.get(f) as string;
  for (const f of reihenfolge) {
    const r = ws.getRow(z++);
    r.getCell(1).value = FLAECHE_TEXT[f];
    const wert = d.flaechen[f];
    const formel =
      f === 'NUF'
        ? `SUM(${a('NUF1')}:${a('NUF7')})`
        : f === 'NRF'
          ? `${a('NUF')}+${a('TF')}+${a('VF')}`
          : f === 'BGF'
            ? `${a('NRF')}+${a('KGF')}`
            : null;
    r.getCell(2).value = formel ? { formula: formel, result: wert ?? 0 } : wert;
    r.getCell(2).numFmt = MENGE;
    if (formel) r.font = { bold: true };
    if (!formel) r.getCell(3).value = d.flaechenQuelle[f as keyof typeof d.flaechenQuelle] ?? '';
  }
  return adresse;
}

/** Blatt „Kostentabelle“ (E-64, E-65). */
function kostenBlatt(
  wb: ExcelJS.Workbook,
  d: KostenDaten,
  projektname: string,
  flaechen: Map<Flaeche, string>,
): void {
  const ws = wb.addWorksheet('Kostentabelle');
  const e = d.einstellung;
  titel(
    ws,
    `${projektname} – Kostenplanung nach DIN 276`,
    `Stand ${new Date().toLocaleDateString('de-DE')} · Beträge netto · KKW wirksam = KKW gewählt × Index- × Regionalfaktor`,
  );
  // Einstellungen (benannte Zellen für die Formeln)
  ws.getCell('A3').value = 'MwSt.-Satz';
  ws.getCell('B3').value = e.mwst_satz / 100;
  ws.getCell('B3').numFmt = '0%';
  ws.getCell('C3').value = 'Regionalfaktor';
  ws.getCell('D3').value = e.regionalfaktor;
  ws.getCell('E3').value = 'Index aktuell';
  ws.getCell('F3').value = e.index_aktuell;
  ws.getCell('G3').value = e.index_aktuell_stand;
  ws.getCell('H3').value = e.vorsteuerabzug
    ? 'vorsteuerabzugsberechtigt'
    : 'nicht vorsteuerabzugsberechtigt';

  const KOPF = 5;
  kopfzeile(ws, KOPF, [
    'KG',
    'Bezeichnung',
    'Menge',
    'Einheit',
    'KKW von',
    'KKW mittel',
    'KKW bis',
    'KKW gewählt',
    'Faktor Index × Region',
    'KKW wirksam',
    'Kosten netto',
    'Anteil',
    'Quelle / Stand',
    'Kommentar',
  ]);
  ws.columns = [
    { width: 7 },
    { width: 44 },
    { width: 11 },
    { width: 10 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 13 },
    { width: 11 },
    { width: 13 },
    { width: 16 },
    { width: 8 },
    { width: 30 },
    { width: 30 },
  ];

  const folge = baumFolge(d);
  const zeileJeKg = new Map(folge.map((k, i) => [k.kg, KOPF + 1 + i]));
  const zeileJeId = new Map(d.zeilen.map((z) => [z.id, z]));
  const summeZeile = KOPF + 1 + folge.length + 1;
  const kostenAdr = (kg: number) => `K${zeileJeKg.get(kg)}`;

  folge.forEach((k, i) => {
    const r = ws.getRow(KOPF + 1 + i);
    const z = k.zeileId && !k.ausUnterzeilen ? zeileJeId.get(k.zeileId) : undefined;
    r.getCell(1).value = k.kg;
    r.getCell(2).value = k.bezeichnung || KATALOG_EBENE1[k.kg] || '';
    r.getCell(2).alignment = { indent: (k.ebene - 1) * 2 };
    if (k.ebene < 3) r.font = { bold: true };
    if (k.ebene === 1)
      r.eachCell(
        (c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F4' } }),
      );
    r.outlineLevel = k.ebene - 1;
    const n = r.number;
    if (z) {
      // Menge: an Fläche gekoppelt → Verweis auf das Flächenblatt
      const flaeche =
        z.menge_quelle === 'flaeche' && z.flaeche ? flaechen.get(z.flaeche) : undefined;
      r.getCell(3).value = flaeche
        ? { formula: `'Flächen DIN 277'!${flaeche}`, result: z.mengeWirksam ?? 0 }
        : z.mengeWirksam;
      r.getCell(4).value = z.einheit;
      r.getCell(5).value = z.kkw_von;
      r.getCell(6).value = z.kkw_mittel;
      r.getCell(7).value = z.kkw_bis;
      r.getCell(8).value = z.kkw_gewaehlt;
      if (z.kkw_gewaehlt !== null) {
        r.getCell(9).value = z.index.faktor * e.regionalfaktor;
        r.getCell(10).value = {
          formula: `ROUND(H${n}*I${n},2)`,
          result: z.kkwWirksam ?? 0,
        };
      }
      if (z.kosten !== null)
        r.getCell(11).value = { formula: `ROUND(C${n}*J${n},2)`, result: z.kosten };
      r.getCell(13).value = [z.kkw_quelle, z.kkw_stand].filter(Boolean).join(', ');
      const hinweise = z.hinweise.length ? ` ⚠ ${z.hinweise.join(' ')}` : '';
      r.getCell(14).value = `${z.kommentar}${hinweise}`.trim();
    } else if (k.kinder.length) {
      r.getCell(11).value = {
        formula: k.kinder.map(kostenAdr).join('+'),
        result: k.summe ?? 0,
      };
      if (k.ausUnterzeilen && k.zeileId)
        r.getCell(14).value = 'Untergruppen maßgebend (eigener Wert überdeckt)';
    }
    if (r.getCell(11).value !== null)
      r.getCell(12).value = {
        formula: `IF($K$${summeZeile}=0,"",K${n}/$K$${summeZeile})`,
        result: d.gesamt.netto ? (k.summe ?? 0) / d.gesamt.netto : '',
      };
    for (const c of [5, 6, 7, 8, 10, 11]) r.getCell(c).numFmt = BETRAG;
    r.getCell(3).numFmt = MENGE;
    r.getCell(9).numFmt = FAKTOR;
    r.getCell(12).numFmt = PROZENT;
  });

  const ebene1 = folge.filter((k) => k.ebene === 1).map((k) => kostenAdr(k.kg));
  const summen: [string, ExcelJS.CellValue, boolean][] = [
    ['Summe KG 100–800 netto', { formula: ebene1.join('+'), result: d.gesamt.netto }, true],
    ['MwSt.', { formula: `ROUND(K${summeZeile}*$B$3,2)`, result: d.gesamt.mwst }, false],
    [
      'Summe brutto',
      { formula: `K${summeZeile}+K${summeZeile + 1}`, result: d.gesamt.brutto },
      true,
    ],
    [
      `maßgebend (${e.vorsteuerabzug ? 'netto, vorsteuerabzugsberechtigt' : 'brutto'})`,
      {
        formula: e.vorsteuerabzug ? `K${summeZeile}` : `K${summeZeile + 2}`,
        result: d.gesamt.massgebend,
      },
      true,
    ],
  ];
  summen.forEach(([text, wert, fett], i) => {
    const r = ws.getRow(summeZeile + i);
    r.getCell(2).value = text;
    r.getCell(11).value = wert;
    r.getCell(11).numFmt = EURO;
    r.font = { bold: fett };
    if (i === 0) r.getCell(11).border = { top: { style: 'thin' } };
  });
  ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

/** Blatt „Soll-Ist“ (E-33, E-61). */
function sollIstBlatt(wb: ExcelJS.Workbook, db: PluginDb, bezug: Stufe): void {
  const s = sollIstLaden(db, bezug);
  const ws = wb.addWorksheet('Soll-Ist');
  titel(
    ws,
    'Kosten Soll-Ist nach DIN 276',
    `Bezugsstufe ${STUFE_TEXT[bezug]} · Prognose = Aufträge bzw. Rechnungen (der höhere Wert), wo vergeben, sonst Bezug · Abweichung = Prognose − Bezug`,
  );
  const KOPF = 4;
  kopfzeile(ws, KOPF, [
    'KG',
    'Bezeichnung',
    ...STUFEN.map((x) => STUFE_TEXT[x]),
    'Prognose',
    'Abweichung',
    'Abweichung %',
    'Ursache',
    'Erläuterung',
  ]);
  ws.columns = [
    { width: 7 },
    { width: 40 },
    ...STUFEN.map(() => ({ width: 15 })),
    { width: 15 },
    { width: 14 },
    { width: 12 },
    { width: 26 },
    { width: 40 },
  ];
  const bezugSpalte = sp(3 + STUFEN.indexOf(bezug));
  const zeile = (
    r: ExcelJS.Row,
    werte: (number | null)[],
    prognose: number | null,
    abw: number | null,
    prozent: number | null,
  ) => {
    const n = r.number;
    werte.forEach((w, i) => {
      r.getCell(3 + i).value = w;
      r.getCell(3 + i).numFmt = BETRAG;
    });
    r.getCell(8).value = prognose;
    r.getCell(8).numFmt = BETRAG;
    if (abw !== null) {
      r.getCell(9).value = { formula: `H${n}-${bezugSpalte}${n}`, result: abw };
      r.getCell(10).value = {
        formula: `IF(${bezugSpalte}${n}=0,"",I${n}/${bezugSpalte}${n})`,
        result: prozent !== null ? prozent / 100 : '',
      };
    }
    r.getCell(9).numFmt = BETRAG;
    r.getCell(10).numFmt = PROZENT;
  };
  s.zeilen.forEach((z, i) => {
    const r = ws.getRow(KOPF + 1 + i);
    r.getCell(1).value = z.kg;
    r.getCell(2).value = z.bezeichnung;
    r.getCell(2).alignment = { indent: (z.ebene - 1) * 2 };
    if (z.ebene < 3) r.font = { bold: true };
    r.outlineLevel = z.ebene - 1;
    zeile(
      r,
      STUFEN.map((x) => z.stufen[x]),
      z.prognose,
      z.abweichung,
      z.abweichungProzent,
    );
    r.getCell(11).value = z.ursache ? KOSTEN_URSACHEN[z.ursache as KostenUrsache] : '';
    r.getCell(12).value = z.ursacheText;
  });
  const r = ws.getRow(KOPF + 2 + s.zeilen.length);
  r.getCell(2).value = 'Summe KG 100–800 netto';
  r.font = { bold: true };
  zeile(
    r,
    STUFEN.map((x) => s.gesamt.stufen[x]),
    s.gesamt.prognose,
    s.gesamt.abweichung,
    s.gesamt.abweichungProzent,
  );
  ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };
}

/** Blätter „Aufträge“ und „Rechnungen“ (E-62). */
function istBlaetter(wb: ExcelJS.Workbook, db: PluginDb): void {
  const s = sollIstLaden(db, 'berechnung');
  const auftragJeId = new Map(s.auftraege.map((a) => [a.id, a]));

  const wa = wb.addWorksheet('Aufträge');
  titel(wa, 'Aufträge (Kostenanschlag)', 'Beträge netto · offen = Auftrag − abgerechnet');
  kopfzeile(wa, 4, [
    'KG',
    'Leistung',
    'Auftragnehmer',
    'Datum',
    'Beleg-Nr.',
    'Betrag netto',
    'abgerechnet',
    'offen',
    'Anhang',
    'Anmerkung',
  ]);
  wa.columns = [
    { width: 7 },
    { width: 32 },
    { width: 26 },
    { width: 12 },
    { width: 12 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 40 },
    { width: 30 },
  ];
  s.auftraege.forEach((a, i) => {
    const r = wa.getRow(5 + i);
    const n = r.number;
    r.values = [
      a.kg,
      a.bezeichnung,
      a.auftragnehmer,
      excelDatum(a.datum),
      a.beleg_nr,
      a.betrag_netto,
      a.abgerechnet,
    ];
    r.getCell(8).value = { formula: `F${n}-G${n}`, result: a.offen };
    r.getCell(9).value = a.anhang ?? '';
    r.getCell(10).value = a.anmerkung;
    r.getCell(4).numFmt = DATUM;
    for (const c of [6, 7, 8]) r.getCell(c).numFmt = BETRAG;
  });
  const ra = wa.getRow(6 + s.auftraege.length);
  ra.getCell(2).value = 'Summe';
  ra.font = { bold: true };
  if (s.auftraege.length) {
    const bis = 4 + s.auftraege.length;
    for (const c of ['F', 'G', 'H']) {
      const sum = s.auftraege.reduce(
        (x, a) => x + (c === 'F' ? a.betrag_netto : c === 'G' ? a.abgerechnet : a.offen),
        0,
      );
      ra.getCell(c).value = {
        formula: `SUM(${c}5:${c}${bis})`,
        result: Math.round(sum * 100) / 100,
      };
      ra.getCell(c).numFmt = BETRAG;
    }
  }

  const wr = wb.addWorksheet('Rechnungen');
  titel(wr, 'Rechnungen (Kostenfeststellung)', 'Beträge netto');
  kopfzeile(wr, 4, [
    'KG',
    'Auftrag',
    'Rechnungssteller',
    'Datum',
    'Beleg-Nr.',
    'Betrag netto',
    'Anhang',
    'Anmerkung',
  ]);
  wr.columns = [
    { width: 7 },
    { width: 32 },
    { width: 26 },
    { width: 12 },
    { width: 12 },
    { width: 15 },
    { width: 40 },
    { width: 30 },
  ];
  s.rechnungen.forEach((x, i) => {
    const a = x.auftrag_id ? auftragJeId.get(x.auftrag_id) : undefined;
    const r = wr.getRow(5 + i);
    r.values = [
      x.kg,
      a ? [a.bezeichnung, a.beleg_nr].filter(Boolean).join(' · ') : '',
      x.rechnungssteller,
      excelDatum(x.datum),
      x.beleg_nr,
      x.betrag_netto,
      x.anhang ?? '',
      x.anmerkung,
    ];
    r.getCell(4).numFmt = DATUM;
    r.getCell(6).numFmt = BETRAG;
  });
  const rr = wr.getRow(6 + s.rechnungen.length);
  rr.getCell(2).value = 'Summe';
  rr.font = { bold: true };
  if (s.rechnungen.length) {
    rr.getCell('F').value = {
      formula: `SUM(F5:F${4 + s.rechnungen.length})`,
      result: Math.round(s.rechnungen.reduce((x, r) => x + r.betrag_netto, 0) * 100) / 100,
    };
    rr.getCell('F').numFmt = BETRAG;
  }
}

/** Kosten-Arbeitsmappe (E-25, E-64, E-65). */
export async function kostenExcel(
  db: PluginDb,
  parameter: Record<string, unknown>,
  umgebung: KostenUmgebung = {},
): Promise<Uint8Array> {
  const d = kostenDatenLaden(db, umgebung);
  const bezug = (STUFEN as readonly string[]).includes(String(parameter['bezug']))
    ? (parameter['bezug'] as Stufe)
    : 'berechnung';
  const projektname = String(parameter['projektname'] ?? 'Projekt');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bautakt';
  wb.created = new Date();
  // Flächen zuerst anlegen (Adressen für Mengenverweise), Kostentabelle aber als erstes Blatt
  const tmp = new ExcelJS.Workbook();
  const adressen = flaechenBlatt(tmp, d);
  kostenBlatt(wb, d, projektname, adressen);
  flaechenBlatt(wb, d);
  sollIstBlatt(wb, db, bezug);
  istBlaetter(wb, db);
  wb.calcProperties.fullCalcOnLoad = true;
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
