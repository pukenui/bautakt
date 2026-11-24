import type { BautaktApi, Meldungen } from '@bautakt/kern/vertrag';
import { contextBridge, ipcRenderer } from 'electron';
import { MELDUNG_PRAEFIX, MELDUNGEN, type Aufruf } from '../shared/kanaele';

// Sandbox-Preload: nur contextBridge/ipcRenderer, keine Node-Module.
const aufruf = (kanal: Aufruf, ...args: unknown[]) => ipcRenderer.invoke(kanal, ...args);

const api: BautaktApi = {
  projekt: {
    status: () => aufruf('projekt:status'),
    neu: () => aufruf('projekt:neu'),
    oeffnen: () => aufruf('projekt:oeffnen'),
    speichern: () => aufruf('projekt:speichern'),
    speichernUnter: () => aufruf('projekt:speichernUnter'),
    jsonExportieren: () => aufruf('projekt:jsonExportieren'),
    schliessen: () => aufruf('projekt:schliessen'),
  },
  befehl: {
    ausfuehren: (plugin, name, daten, grund) =>
      aufruf('befehl:ausfuehren', { plugin, name, daten, grund }),
    rueckgaengig: () => aufruf('befehl:rueckgaengig'),
    wiederholen: () => aufruf('befehl:wiederholen'),
  },
  abfrage: (plugin, name, argumente) => aufruf('abfrage', { plugin, name, argumente }),
  on(name, fn) {
    if (!(MELDUNGEN as readonly string[]).includes(name))
      throw new Error(`Unbekannte Meldung ${name}`);
    const kanal = MELDUNG_PRAEFIX + name;
    const handler = (_e: unknown, daten: Meldungen[typeof name]) => fn(daten);
    ipcRenderer.on(kanal, handler);
    return () => void ipcRenderer.removeListener(kanal, handler);
  },
};

contextBridge.exposeInMainWorld('bautakt', api);
