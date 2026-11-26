import type { PluginDb } from '@bautakt/kern';
import { bezugFormatieren } from '@bautakt/rechnen-termine';
import ExcelJS from 'exceljs';
import { planDatenLaden } from './daten.js';

const TYP = { vorgang: 'Vorgang', sammel: 'Sammelvorgang', meilenstein: 'Meilenstein' } as const;
const DATUM = 'dd.mm.yyyy';

function excelDatum(iso: string | undefined): Date | null {
  if (!iso) return null;
  const [j, m, t] = iso.split('-').map(Number);
  return new Date(Date.UTC(j ?? 1970, (m ?? 1) - 1, t ?? 1));
}

/**
 * Vorgangsliste als Excel-Arbeitsmappe (E-25, E-66): alle Vorgänge des Plans mit Gliederung,
 * Zeitpunkten nach DIN 69900, Terminen und Eigenschaften; GP als Formel SAZ − FAZ.
 */
export async function vorgangslisteExcel(
  db: PluginDb,
  parameter: Record<string, unknown>,
  aktuelleVersion?: (bibId: string) => number | null,
): Promise<Uint8Array> {
  const planId = String(parameter['planId'] ?? '');
  const sollStandId =
    typeof parameter['sollStandId'] === 'string' ? parameter['sollStandId'] : null;
  const projektname = String(parameter['projektname'] ?? 'Projekt');
  const d = planDatenLaden(db, planId, sollStandId, aktuelleVersion);
  const termine = d.berechnung.ok ? d.berechnung.termine : {};
  const nr = new Map(d.vorgaenge.map((v) => [v.id, v.nr]));
  const vorgaenger = (id: string) =>
    d.beziehungen
      .filter((b) => b.nach_id === id)
      .map((b) =>
        bezugFormatieren(
          { nr: nr.get(b.von_id) ?? '?', art: b.art, abstand: b.abstand, einheit: b.einheit },
          'kurz',
        ),
      )
      .join('; ');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bautakt';
  wb.created = new Date();
  const ws = wb.addWorksheet('Vorgangsliste');
  ws.getCell('A1').value = `${projektname} – ${d.plan.name} – Vorgangsliste`;
  ws.getCell('A1').font = { bold: true, size: 14 };
  const b = d.berechnung;
  ws.getCell('A2').value = [
    `Stand ${new Date().toLocaleDateString('de-DE')}`,
    d.plan.projektstart ? `Projektstart ${d.plan.projektstart.split('-').reverse().join('.')}` : '',
    b.ok
      ? `Projektende ${b.projektendeDatum.split('-').reverse().join('.')} (${b.projektende} AT)`
      : `nicht berechenbar: ${b.fehler}`,
    d.plan.stichtag
      ? `Prognose zum Stichtag ${d.plan.stichtag.split('-').reverse().join('.')}`
      : '',
    d.vergleich ? `Soll-Vergleich „${d.vergleich.standName}“` : '',
    'Zeitpunkte in AT (DIN 69900)',
  ]
    .filter(Boolean)
    .join(' · ');
  ws.getCell('A2').font = { color: { argb: 'FF555555' } };

  const spalten: { titel: string; breite: number }[] = [
    { titel: 'Nr.', breite: 7 },
    { titel: 'Vorgang', breite: 40 },
    { titel: 'Typ', breite: 14 },
    { titel: 'Dauer [AT]', breite: 9 },
    { titel: 'Vorgänger', breite: 20 },
    { titel: 'FAZ', breite: 7 },
    { titel: 'FEZ', breite: 7 },
    { titel: 'SAZ', breite: 7 },
    { titel: 'SEZ', breite: 7 },
    { titel: 'GP', breite: 6 },
    { titel: 'FP', breite: 6 },
    { titel: 'Anfang', breite: 12 },
    { titel: 'Ende', breite: 12 },
    { titel: 'kritisch', breite: 8 },
    { titel: 'Gewerk', breite: 18 },
    { titel: 'Verantwortlich', breite: 18 },
    { titel: 'Quelle/Annahme', breite: 32 },
    { titel: 'Herleitung', breite: 50 },
    ...(d.plan.stichtag ? [{ titel: '% fertig', breite: 9 }] : []),
    ...(d.vergleich
      ? [
          { titel: 'Soll-Ende', breite: 12 },
          { titel: 'Abw. [AT]', breite: 9 },
        ]
      : []),
  ];
  const KOPF = 4;
  const kopf = ws.getRow(KOPF);
  spalten.forEach((s, i) => {
    const c = kopf.getCell(i + 1);
    c.value = s.titel;
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0EC' } };
    c.border = { bottom: { style: 'thin' } };
  });
  ws.columns = spalten.map((s) => ({ width: s.breite }));
  ws.views = [{ state: 'frozen', ySplit: KOPF, xSplit: 2 }];
  ws.autoFilter = { from: { row: KOPF, column: 1 }, to: { row: KOPF, column: spalten.length } };
  ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };

  d.vorgaenge.forEach((v, i) => {
    const t = termine[v.id];
    const r = ws.getRow(KOPF + 1 + i);
    const n = r.number;
    const dauer =
      v.typ === 'vorgang' ? v.dauer_at : v.typ === 'meilenstein' ? 0 : t ? t.fez - t.faz : null;
    const ist = d.ist[v.id];
    const werte: ExcelJS.CellValue[] = [
      v.nr,
      v.name,
      TYP[v.typ],
      dauer,
      v.typ === 'sammel' ? '' : vorgaenger(v.id),
      t?.faz ?? null,
      t?.fez ?? null,
      t?.saz ?? null,
      t?.sez ?? null,
      t ? { formula: `H${n}-F${n}`, result: t.gp } : null,
      t?.fp ?? null,
      v.typ === 'meilenstein' ? null : excelDatum(t?.anfang),
      excelDatum(t?.ende),
      t?.kritisch ? 'ja' : '',
      v.gewerk,
      v.rolle,
      v.quelle_annahme,
      v.dauer_herleitung,
    ];
    if (d.plan.stichtag)
      werte.push(
        t?.status === 'fertig'
          ? 100
          : t?.status === 'begonnen'
            ? (ist?.fertig_prozent ?? null)
            : null,
      );
    if (d.vergleich) {
      const s = d.vergleich.termine[v.id];
      werte.push(excelDatum(s?.ende), s?.abweichung ?? null);
    }
    r.values = werte;
    r.getCell(2).alignment = { indent: v.ebene * 2 };
    r.getCell(12).numFmt = DATUM;
    r.getCell(13).numFmt = DATUM;
    if (d.vergleich) r.getCell(spalten.length - 1).numFmt = DATUM;
    r.outlineLevel = Math.min(7, v.ebene);
    if (v.typ === 'sammel') r.font = { bold: true };
    if (t?.kritisch) {
      r.getCell(2).font = { color: { argb: 'FFB02A27' }, bold: v.typ === 'sammel' };
      r.getCell(14).font = { color: { argb: 'FFB02A27' } };
    }
    if (t && t.gp < 0) r.getCell(10).font = { color: { argb: 'FFB02A27' }, bold: true };
  });
  wb.calcProperties.fullCalcOnLoad = true;
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
