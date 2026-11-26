import type { RendererPlugin } from '@bautakt/ui';
import hilfeKosten from '../hilfe/kosten.md?raw';
import { DruckKosten } from './druck/DruckKosten.js';
import { DruckSollIst } from './druck/DruckSollIst.js';
import { KostenAnsicht } from './KostenAnsicht.js';
import './kosten.css';

export const kostenRenderer: RendererPlugin = {
  id: 'kosten',
  ansichten: [
    { id: 'kosten.tabelle', titel: 'Kosten', komponente: KostenAnsicht, hilfe: hilfeKosten },
  ],
  druckansichten: [
    { id: 'kosten.kostentabelle', titel: 'Kostentabelle', komponente: DruckKosten },
    { id: 'kosten.sollist', titel: 'Kosten Soll-Ist', komponente: DruckSollIst },
  ],
};
