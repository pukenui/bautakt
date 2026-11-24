import type { Meldungen } from '@bautakt/kern';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import path from 'node:path';
import { z } from 'zod';
import { AUFRUFE, MELDUNG_PRAEFIX, type Aufruf } from '../shared/kanaele';
import { menueErstellen } from './menue';
import { antwort, ProjektVerwaltung } from './projekt';

let fenster: BrowserWindow | null = null;

const senden = <K extends keyof Meldungen>(name: K, daten: Meldungen[K]) => {
  if (fenster && !fenster.isDestroyed()) fenster.webContents.send(MELDUNG_PRAEFIX + name, daten);
};
const projekte = new ProjektVerwaltung(() => fenster, senden);

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
  abfrage: ([daten]) =>
    antwort(() => {
      const a = abfrageSchema.parse(daten);
      return aktiveSitzung().abfrage(a.plugin, a.name, a.argumente);
    }),
};

/** Nur Aufrufe aus dem eigenen Fenster mit eigener Seite annehmen. */
function vertrauenswuerdig(e: IpcMainInvokeEvent): boolean {
  if (!fenster || e.sender !== fenster.webContents) return false;
  const url = e.senderFrame?.url ?? '';
  return (
    url.startsWith('file://') ||
    (!!process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL']))
  );
}

function ipcRegistrieren(): void {
  for (const kanal of AUFRUFE) {
    ipcMain.handle(kanal, (e, ...args: unknown[]) => {
      if (!vertrauenswuerdig(e)) throw new Error('Nicht erlaubter IPC-Aufruf.');
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
      preload: path.join(__dirname, '../preload/index.js'),
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

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) void fenster.loadURL(devUrl);
  else void fenster.loadFile(path.join(__dirname, '../renderer/index.html'));
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
    ipcRegistrieren();
    Menu.setApplicationMenu(menueErstellen(senden));
    fensterErstellen();

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
  app.on('before-quit', () => projekte.schliessen());
}
