import { BautaktFehler, GlobaleDaten, type Meldungen } from '@bautakt/kern';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AUFRUFE, MELDUNG_PRAEFIX, type Aufruf } from '../shared/kanaele';
import { druckFenster, exportieren, exportSchema } from './export';
import { menueErstellen } from './menue';
import { PLUGINS } from './plugins';
import { antwort, ProjektVerwaltung } from './projekt';

let fenster: BrowserWindow | null = null;

const senden = <K extends keyof Meldungen>(name: K, daten: Meldungen[K]) => {
  if (fenster && !fenster.isDestroyed()) fenster.webContents.send(MELDUNG_PRAEFIX + name, daten);
};
let globaleDaten: GlobaleDaten | null = null;
const projekte = new ProjektVerwaltung(
  () => fenster,
  senden,
  () => globaleDaten,
);

/** Globale Daten (Bibliothek, E-23) im App-Datenordner; Testordner nur in der Entwicklung. */
function globaleDatenOeffnen(): void {
  const testOrdner = app.isPackaged ? undefined : process.env['BAUTAKT_DATENORDNER'];
  globaleDaten = GlobaleDaten.oeffnen(testOrdner || app.getPath('userData'), PLUGINS);
  globaleDaten.onGeaendert((plugin) => senden('globalGeaendert', { plugin }));
}

function globale(): GlobaleDaten {
  if (!globaleDaten) throw new Error('Die globalen Daten sind nicht verfügbar.');
  return globaleDaten;
}

// Eingaben aus dem Renderer werden geprüft, bevor sie den Kern erreichen.
const befehlSchema = z.object({
  plugin: z.string().min(1),
  name: z.string().min(1),
  daten: z.unknown(),
  grund: z.string().max(2000).optional(),
});
const abfrageSchema = z.object({
  plugin: z.string().min(1),
  name: z.string().min(1),
  argumente: z.unknown(),
});

function aktiveSitzung() {
  const s = projekte.aktiv;
  if (!s) throw new Error('Kein Projekt geöffnet.');
  return s;
}

const PRELOAD = path.join(__dirname, '../preload/index.js');

/** Dateiendungen, die als Anhang mit dem Standardprogramm geöffnet werden dürfen (E-62). */
const ANHANG_ENDUNGEN = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.tif',
  '.tiff',
  '.docx',
  '.doc',
  '.xlsx',
  '.xls',
  '.odt',
  '.ods',
  '.txt',
  '.msg',
  '.eml',
];

/**
 * Öffnet einen Anhang nur, wenn das Projekt auf genau diese Datei verweist und sie ein Dokument
 * oder Bild ist – so kann die Oberfläche keine beliebigen Programme starten.
 */
async function anhangOeffnen(pfad: unknown): Promise<null> {
  const p = z.string().min(1).max(4000).parse(pfad);
  if (!path.isAbsolute(p))
    throw new BautaktFehler('ZUGRIFF', 'Der Anhang braucht einen vollständigen Pfad.');
  if (!ANHANG_ENDUNGEN.includes(path.extname(p).toLowerCase()))
    throw new BautaktFehler('ZUGRIFF', 'Dieser Dateityp wird nicht als Anhang geöffnet.');
  if (!aktiveSitzung().anhangBekannt(p))
    throw new BautaktFehler(
      'ZUGRIFF',
      'Die Datei ist in diesem Projekt nicht als Anhang eingetragen.',
    );
  if (!fs.existsSync(p))
    throw new BautaktFehler('DATEI_FEHLT', `Die Datei wurde nicht gefunden: ${p}`);
  const fehler = await shell.openPath(p);
  if (fehler) throw new BautaktFehler('ZUGRIFF', fehler);
  return null;
}

/** Lädt die Renderer-Seite (Entwicklung: Dev-Server, sonst Datei) mit optionalem Hash. */
async function seiteLaden(w: BrowserWindow, hash = ''): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) await w.loadURL(hash ? `${devUrl}#${hash}` : devUrl);
  else await w.loadFile(path.join(__dirname, '../renderer/index.html'), hash ? { hash } : {});
}

const handler: Record<Aufruf, (args: unknown[]) => unknown> = {
  'projekt:status': () => projekte.status(),
  'projekt:neu': () => antwort(() => projekte.neu()),
  'projekt:oeffnen': () => antwort(() => projekte.oeffnenDialog()),
  'projekt:speichern': () => antwort(() => projekte.speichern()),
  'projekt:speichernUnter': () => antwort(() => projekte.speichernUnter()),
  'projekt:jsonExportieren': () => antwort(() => projekte.jsonExportieren()),
  'projekt:schliessen': () =>
    antwort(() => {
      projekte.schliessen();
      projekte.statusMelden();
      return null;
    }),
  'befehl:ausfuehren': ([daten]) =>
    antwort(() => {
      const a = befehlSchema.parse(daten);
      const e = aktiveSitzung().befehl({
        plugin: a.plugin,
        name: a.name,
        daten: a.daten,
        ...(a.grund ? { grund: a.grund } : {}),
      });
      return {
        befehlId: e.befehlId,
        eingefuegt: e.aenderungen
          .filter((x) => x.art === 'einfuegen')
          .map((x) => ({ tabelle: x.tabelle, id: x.id })),
      };
    }),
  'befehl:rueckgaengig': () => antwort(() => aktiveSitzung().rueckgaengig()),
  'befehl:wiederholen': () => antwort(() => aktiveSitzung().wiederholen()),
  'export:starten': ([daten]) =>
    antwort(async () => {
      aktiveSitzung();
      return exportieren(exportSchema.parse(daten), fenster, PRELOAD, seiteLaden, (p, f, par) =>
        aktiveSitzung().dateiExport(p, f, par),
      );
    }),
  abfrage: ([daten]) =>
    antwort(() => {
      const a = abfrageSchema.parse(daten);
      return aktiveSitzung().abfrage(a.plugin, a.name, a.argumente);
    }),
  'import:starten': ([daten]) =>
    antwort(async () => {
      const a = z
        .object({
          plugin: z.string().min(1),
          format: z.string().min(1),
          parameter: z.record(z.string(), z.unknown()),
        })
        .parse(daten);
      const sitzung = aktiveSitzung();
      const info = sitzung.importInfo(a.plugin, a.format);
      // Nur für automatische Tests in nicht gepackten Builds: Datei ohne Dialog
      const testDatei = app.isPackaged ? undefined : process.env['BAUTAKT_TEST_IMPORT_DATEI'];
      const r = testDatei
        ? { canceled: false, filePaths: [testDatei] }
        : fenster
          ? await dialog.showOpenDialog(fenster, {
              title: `${info.beschreibung} importieren`,
              properties: ['openFile'],
              filters: [{ name: info.beschreibung, extensions: info.endungen }],
            })
          : { canceled: true, filePaths: [] };
      const datei = r.canceled ? undefined : r.filePaths[0];
      if (!datei) return null;
      const inhalt = fs.readFileSync(datei);
      const e = await sitzung.dateiImport(a.plugin, a.format, new Uint8Array(inhalt), {
        ...a.parameter,
        dateiname: path.basename(datei),
      });
      return {
        datei,
        bericht: e.bericht,
        eingefuegt: e.ergebnis.aenderungen
          .filter((x) => x.art === 'einfuegen')
          .map((x) => ({ tabelle: x.tabelle, id: x.id })),
      };
    }),
  'anhang:waehlen': () =>
    antwort(async () => {
      aktiveSitzung();
      const ergebnis = fenster
        ? await dialog.showOpenDialog(fenster, {
            title: 'Anhang wählen',
            properties: ['openFile'],
            filters: [
              { name: 'Dokumente und Bilder', extensions: ANHANG_ENDUNGEN.map((e) => e.slice(1)) },
            ],
          })
        : { canceled: true, filePaths: [] };
      return ergebnis.canceled ? null : (ergebnis.filePaths[0] ?? null);
    }),
  'anhang:oeffnen': ([pfad]) => antwort(() => anhangOeffnen(pfad)),
  'global:abfrage': ([daten]) =>
    antwort(() => {
      const a = abfrageSchema.parse(daten);
      return globale().abfrage(a.plugin, a.name, a.argumente);
    }),
  'global:aktion': ([daten]) =>
    antwort(() => {
      const a = befehlSchema.omit({ grund: true }).parse(daten);
      return globale().aktion(a.plugin, a.name, a.daten);
    }),
};

/** Kanäle, die Druckfenster (Export) nutzen dürfen – nur lesend. */
const DRUCK_KANAELE: readonly Aufruf[] = ['projekt:status', 'abfrage'];

/** Nur Aufrufe aus dem eigenen Fenster (bzw. Druckfenstern) mit eigener Seite annehmen. */
function vertrauenswuerdig(e: IpcMainInvokeEvent, kanal: Aufruf): boolean {
  const druck = druckFenster.has(e.sender.id) && DRUCK_KANAELE.includes(kanal);
  if (!druck && (!fenster || e.sender !== fenster.webContents)) return false;
  const url = e.senderFrame?.url ?? '';
  return (
    url.startsWith('file://') ||
    (!!process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL']))
  );
}

function ipcRegistrieren(): void {
  for (const kanal of AUFRUFE) {
    ipcMain.handle(kanal, (e, ...args: unknown[]) => {
      if (!vertrauenswuerdig(e, kanal)) throw new Error('Nicht erlaubter IPC-Aufruf.');
      return handler[kanal](args);
    });
  }
}

function fensterErstellen(): void {
  fenster = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Bautakt',
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  fenster.once('ready-to-show', () => fenster?.show());
  // Fenstertitel setzt der Main-Prozess (Projektname), nicht das HTML
  fenster.on('page-title-updated', (e) => e.preventDefault());
  fenster.on('closed', () => (fenster = null));

  // Keine Navigation, keine neuen Fenster; externe Links im Standardbrowser
  fenster.webContents.on('will-navigate', (e) => e.preventDefault());
  fenster.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  void seiteLaden(fenster);
}

/** Projektdatei aus der Kommandozeile (Doppelklick auf .bautakt). */
function dateiAusArgumenten(argv: readonly string[]): string | undefined {
  return argv.slice(1).find((a) => a.toLowerCase().endsWith('.bautakt'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (fenster) {
      if (fenster.isMinimized()) fenster.restore();
      fenster.focus();
    }
    const datei = dateiAusArgumenten(argv);
    if (datei)
      void antwort(() => projekte.oeffnen(datei)).then((a) => {
        if (!a.ok) senden('hinweis', { text: a.fehler, art: 'fehler' });
      });
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('de.bautakt.app');
    // Keine Berechtigungen (Kamera, Mikrofon, Benachrichtigungen …) für den Renderer
    session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    let globalFehler: string | null = null;
    try {
      globaleDatenOeffnen();
    } catch (e) {
      // ohne globale Daten läuft die App weiter (nur ohne Bibliothek)
      globalFehler = `Die Bibliothek konnte nicht geöffnet werden: ${(e as Error).message}`;
    }
    ipcRegistrieren();
    Menu.setApplicationMenu(menueErstellen(senden));
    fensterErstellen();
    if (globalFehler) {
      const text = globalFehler;
      fenster?.webContents.once('did-finish-load', () =>
        senden('hinweis', { text, art: 'fehler' }),
      );
    }

    const datei = dateiAusArgumenten(process.argv);
    if (datei) {
      fenster?.webContents.once('did-finish-load', () => {
        void antwort(() => projekte.oeffnen(datei)).then((a) => {
          if (!a.ok) senden('hinweis', { text: a.fehler, art: 'fehler' });
        });
      });
    }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    projekte.schliessen();
    globaleDaten?.schliessen();
    globaleDaten = null;
  });
}
