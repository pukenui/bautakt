import {
  BautaktFehler,
  DATEIENDUNG,
  ProjektSitzung,
  type Antwort,
  type Meldungen,
  type ProjektStatus,
} from '@bautakt/kern';
import { app, dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGINS } from './plugins';

const FILTER = [{ name: 'Bautakt-Projekt', extensions: [DATEIENDUNG.slice(1)] }];

type Senden = <K extends keyof Meldungen>(name: K, daten: Meldungen[K]) => void;

/** Hält die aktuelle Projektsitzung des Fensters und kapselt Datei-Dialoge. */
export class ProjektVerwaltung {
  private sitzung: ProjektSitzung | null = null;

  constructor(
    private readonly fenster: () => BrowserWindow | null,
    private readonly senden: Senden,
  ) {}

  get aktiv(): ProjektSitzung | null {
    return this.sitzung;
  }

  status(): ProjektStatus | null {
    return this.sitzung?.status() ?? null;
  }

  private optionen() {
    return {
      appVersion: app.getVersion(),
      plugins: PLUGINS,
      fehler: (e: unknown) => this.senden('hinweis', { text: fehlerText(e), art: 'fehler' }),
    };
  }

  private uebernehmen(neu: ProjektSitzung): ProjektStatus {
    this.sitzung = neu;
    neu.ereignisse.on('befehl.ausgefuehrt', (e) => {
      const tabellen = [...new Set(e.aenderungen.map((a) => a.tabelle))];
      this.senden('datenGeaendert', { plugin: e.plugin, tabellen });
      this.statusMelden();
    });
    neu.ereignisse.on('projekt.gespeichert', (e) => {
      if (e.automatisch) this.senden('hinweis', { text: 'Automatisch gespeichert', art: 'info' });
    });
    if (neu.schreibgeschuetzt) {
      this.senden('hinweis', {
        text: `Die Datei ist bereits geöffnet (${neu.status().gesperrtVon ?? 'unbekannt'}) und wurde schreibgeschützt geöffnet.`,
        art: 'warnung',
      });
    }
    this.statusMelden();
    return neu.status();
  }

  statusMelden(): void {
    const status = this.status();
    this.senden('status', status);
    const f = this.fenster();
    if (f) {
      f.setTitle(
        status
          ? `${status.projektname} – Bautakt${status.schreibgeschuetzt ? ' [schreibgeschützt]' : ''}`
          : 'Bautakt',
      );
    }
  }

  schliessen(): void {
    this.sitzung?.schliessen();
    this.sitzung = null;
  }

  async neu(): Promise<ProjektStatus | null> {
    const f = this.fenster();
    const opts = {
      title: 'Neues Projekt anlegen',
      defaultPath: path.join(app.getPath('documents'), `Neues Projekt${DATEIENDUNG}`),
      filters: FILTER,
    };
    const r = f ? await dialog.showSaveDialog(f, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return null;
    const pfad = mitEndung(r.filePath);
    if (this.sitzung?.pfad === pfad) {
      throw new BautaktFehler('DATEI_EXISTIERT', 'Dieses Projekt ist gerade geöffnet.');
    }
    // Der Dialog hat ein evtl. Überschreiben bereits bestätigt.
    const neu = ProjektSitzung.neu(pfad, path.basename(pfad, DATEIENDUNG), {
      ...this.optionen(),
      ueberschreiben: fs.existsSync(pfad),
    });
    this.schliessen();
    return this.uebernehmen(neu);
  }

  async oeffnenDialog(): Promise<ProjektStatus | null> {
    const f = this.fenster();
    const opts = {
      title: 'Projekt öffnen',
      filters: FILTER,
      properties: ['openFile' as const],
    };
    const r = f ? await dialog.showOpenDialog(f, opts) : await dialog.showOpenDialog(opts);
    const pfad = r.filePaths[0];
    if (r.canceled || !pfad) return null;
    return this.oeffnen(pfad);
  }

  oeffnen(pfad: string): ProjektStatus {
    if (this.sitzung?.pfad === path.resolve(pfad)) return this.sitzung.status();
    this.schliessen();
    return this.uebernehmen(ProjektSitzung.oeffnen(path.resolve(pfad), this.optionen()));
  }

  speichern(): ProjektStatus | null {
    if (!this.sitzung) return null;
    this.sitzung.speichern();
    this.senden('hinweis', { text: 'Gespeichert', art: 'info' });
    return this.sitzung.status();
  }

  async speichernUnter(): Promise<ProjektStatus | null> {
    const alt = this.sitzung;
    if (!alt) return null;
    const f = this.fenster();
    const opts = { title: 'Speichern unter', defaultPath: alt.pfad, filters: FILTER };
    const r = f ? await dialog.showSaveDialog(f, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return null;
    this.sitzung = null;
    try {
      return this.uebernehmen(alt.speichernUnter(mitEndung(r.filePath)));
    } catch (e) {
      // Schlug es vor dem Umschalten fehl, bleibt die alte Sitzung offen
      if (alt.offen) this.sitzung = alt;
      this.statusMelden();
      throw e;
    }
  }

  async jsonExportieren(): Promise<string | null> {
    const s = this.sitzung;
    if (!s) return null;
    const f = this.fenster();
    const opts = {
      title: 'Projekt als JSON exportieren',
      defaultPath: s.pfad.replace(/\.bautakt$/i, '') + '.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const r = f ? await dialog.showSaveDialog(f, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, s.alsJson(), 'utf8');
    return r.filePath;
  }
}

function mitEndung(pfad: string): string {
  return pfad.toLowerCase().endsWith(DATEIENDUNG) ? pfad : pfad + DATEIENDUNG;
}

export function fehlerText(e: unknown): string {
  if (e instanceof BautaktFehler) return e.message;
  if (e instanceof Error) return `Unerwarteter Fehler: ${e.message}`;
  return 'Unerwarteter Fehler';
}

export async function antwort<T>(fn: () => T | Promise<T>): Promise<Antwort<T>> {
  try {
    return { ok: true, wert: await fn() };
  } catch (e) {
    if (!(e instanceof BautaktFehler)) console.error(e);
    return {
      ok: false,
      fehler: fehlerText(e),
      ...(e instanceof BautaktFehler ? { code: e.code } : {}),
    };
  }
}
