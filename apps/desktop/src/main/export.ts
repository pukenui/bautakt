import { BautaktFehler } from '@bautakt/kern';
import { app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/** Auftrag aus dem Renderer (Export-Dialog). */
export const exportSchema = z.object({
  format: z.enum(['pdf', 'png']),
  ansicht: z.string().regex(/^[a-z0-9-]+\.[a-z0-9.-]+$/),
  parameter: z.record(z.string(), z.unknown()),
  /** PNG: Auflösungsfaktor (1 = 96 dpi). */
  aufloesung: z.number().min(1).max(4).default(2),
  dateiname: z.string().max(200).default('Export'),
});
export type ExportAuftrag = z.infer<typeof exportSchema>;

/** Seite A3 quer bei 96 dpi. */
const SEITE = { breite: 1587, hoehe: 1122 };
/** Größte Bildkante für PNG (Grenze der Grafikkarten-Texturen). */
const MAX_PIXEL = 16_000;

/** WebContents der Druckfenster – dürfen dieselben (lesenden) IPC-Aufrufe nutzen. */
export const druckFenster = new Set<number>();

function sicherDateiname(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Export'
  );
}

/**
 * Export (Architektur 6): eigene Druckansicht in einem unsichtbaren Fenster rendern,
 * dann `printToPDF` (A3 quer, mehrseitig) bzw. Bildaufnahme als PNG.
 */
export async function exportieren(
  auftrag: ExportAuftrag,
  hauptfenster: BrowserWindow | null,
  preload: string,
  seiteLaden: (w: BrowserWindow, hash: string) => Promise<void>,
): Promise<string | null> {
  const endung = auftrag.format;
  const opts = {
    title: auftrag.format === 'pdf' ? 'Als PDF exportieren (A3 quer)' : 'Als PNG exportieren',
    defaultPath: path.join(
      app.getPath('documents'),
      `${sicherDateiname(auftrag.dateiname)}.${endung}`,
    ),
    filters: [{ name: endung.toUpperCase(), extensions: [endung] }],
  };
  // Nur für automatische Tests in nicht gepackten Builds: Zielordner ohne Dialog
  const testOrdner = app.isPackaged ? undefined : process.env['BAUTAKT_TEST_EXPORT_ORDNER'];
  const r = testOrdner
    ? { canceled: false, filePath: path.join(testOrdner, path.basename(opts.defaultPath)) }
    : hauptfenster
      ? await dialog.showSaveDialog(hauptfenster, opts)
      : await dialog.showSaveDialog(opts);
  if (r.canceled || !r.filePath) return null;
  const ziel = r.filePath.toLowerCase().endsWith(`.${endung}`)
    ? r.filePath
    : `${r.filePath}.${endung}`;

  const w = new BrowserWindow({
    show: false,
    width: SEITE.breite,
    height: SEITE.hoehe,
    useContentSize: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: auftrag.format === 'png',
      spellcheck: false,
    },
  });
  const id = w.webContents.id;
  druckFenster.add(id);
  try {
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.on('will-navigate', (e) => e.preventDefault());
    const hash = `druck=${encodeURIComponent(JSON.stringify({ ansicht: auftrag.ansicht, format: auftrag.format, parameter: auftrag.parameter }))}`;
    await seiteLaden(w, hash);
    await aufDruckansichtWarten(w);

    if (auftrag.format === 'pdf') {
      const pdf = await w.webContents.printToPDF({
        landscape: true,
        pageSize: 'A3',
        printBackground: true,
        preferCSSPageSize: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      fs.writeFileSync(ziel, pdf);
    } else {
      const groesse = (await w.webContents.executeJavaScript(
        '({ b: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })',
      )) as { b: number; h: number };
      const faktor = Math.min(auftrag.aufloesung, MAX_PIXEL / groesse.b, MAX_PIXEL / groesse.h);
      w.setContentSize(Math.ceil(groesse.b * faktor), Math.ceil(groesse.h * faktor));
      w.webContents.setZoomFactor(faktor);
      w.webContents.invalidate();
      await new Promise((res) => setTimeout(res, 400));
      const bild = await w.webContents.capturePage();
      if (bild.isEmpty())
        throw new BautaktFehler('ZUGRIFF', 'Das Bild konnte nicht erzeugt werden.');
      fs.writeFileSync(ziel, bild.toPNG());
    }
    return ziel;
  } finally {
    druckFenster.delete(id);
    w.destroy();
  }
}

async function aufDruckansichtWarten(w: BrowserWindow): Promise<void> {
  const ende = Date.now() + 30_000;
  while (Date.now() < ende) {
    const s = (await w.webContents.executeJavaScript(
      '({ fertig: document.body.dataset.druckFertig === "1", fehler: document.body.dataset.druckFehler ?? null })',
    )) as { fertig: boolean; fehler: string | null };
    if (s.fehler) throw new BautaktFehler('BEFEHL_DATEN', s.fehler);
    if (s.fertig) return;
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new BautaktFehler('BEFEHL_DATEN', 'Die Druckansicht wurde nicht rechtzeitig fertig.');
}
