import type { RendererPlugin } from '@bautakt/ui';
import hilfeKosten from '../hilfe/kosten.md?raw';
import { DruckKosten } from './druck/DruckKosten.js';
import { KostenAnsicht } from './KostenAnsicht.js';
import './kosten.css';

export const kostenRenderer: RendererPlugin = {
  id: 'kosten',
  ansichten: [
    { id: 'kosten.tabelle', titel: 'Kosten', komponente: KostenAnsicht, hilfe: hilfeKosten },
  ],
  druckansichten: [{ id: 'kosten.kostentabelle', titel: 'Kostentabelle', komponente: DruckKosten }],
};
