import type { Meldungen } from '@bautakt/kern';
import { app, Menu, type MenuItemConstructorOptions } from 'electron';

type Senden = <K extends keyof Meldungen>(name: K, daten: Meldungen[K]) => void;

/**
 * Anwendungsmenü. Menüpunkte lösen im Renderer eine Aktion aus (Meldung „menue“), damit Tastenkürzel in Eingabefeldern weiter normal wirken:
 * Die Kürzel werden nicht global registriert (`registerAccelerator: false`), sondern im
 * Renderer behandelt.
 */
export function menueErstellen(senden: Senden): Menu {
  const aktion = (name: Meldungen['menue']) => () => senden('menue', name);
  const punkt = (
    label: string,
    name: Meldungen['menue'],
    accelerator?: string,
  ): MenuItemConstructorOptions => ({
    label,
    click: aktion(name),
    ...(accelerator ? { accelerator, registerAccelerator: false } : {}),
  });

  const vorlage: MenuItemConstructorOptions[] = [
    {
      label: '&Datei',
      submenu: [
        punkt('&Neues Projekt …', 'neu', 'CmdOrCtrl+N'),
        punkt('Ö&ffnen …', 'oeffnen', 'CmdOrCtrl+O'),
        { type: 'separator' },
        punkt('&Speichern', 'speichern', 'CmdOrCtrl+S'),
        punkt('Speichern &unter …', 'speichernUnter', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        punkt('Als &JSON exportieren …', 'jsonExportieren'),
        { type: 'separator' },
        punkt('Projekt s&chließen', 'schliessen'),
        { label: '&Beenden', click: () => app.quit() },
      ],
    },
    {
      label: '&Bearbeiten',
      submenu: [
        punkt('&Rückgängig', 'rueckgaengig', 'CmdOrCtrl+Z'),
        punkt('&Wiederholen', 'wiederholen', 'CmdOrCtrl+Y'),
        { type: 'separator' },
        { label: '&Ausschneiden', role: 'cut' },
        { label: '&Kopieren', role: 'copy' },
        { label: '&Einfügen', role: 'paste' },
        { label: 'Alles &markieren', role: 'selectAll' },
      ],
    },
    {
      label: '&Ansicht',
      submenu: [
        { label: 'Vergrößern', role: 'zoomIn' },
        { label: 'Verkleinern', role: 'zoomOut' },
        { label: 'Originalgröße', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Vollbild', role: 'togglefullscreen' },
        ...(app.isPackaged
          ? []
          : ([
              { type: 'separator' },
              { label: 'Entwicklertools', role: 'toggleDevTools' },
              { label: 'Neu laden', role: 'reload' },
            ] satisfies MenuItemConstructorOptions[])),
      ],
    },
    {
      label: '&Hilfe',
      submenu: [punkt('Hilfe zur Ansicht', 'hilfe', 'F1')],
    },
  ];
  return Menu.buildFromTemplate(vorlage);
}
