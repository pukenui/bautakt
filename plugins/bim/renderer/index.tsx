import type { RendererPlugin } from '@bautakt/ui';
import hilfeModell from '../hilfe/modell.md?raw';
import './bim.css';
import { ModellAnsicht } from './ModellAnsicht.js';

/** Renderer-Teil des BIM-Plugins (B1): IFC-Viewer mit Bauteilliste und Eigenschaften. */
export const bimRenderer: RendererPlugin = {
  id: 'bim',
  ansichten: [{ id: 'bim.modell', titel: 'Modell', komponente: ModellAnsicht, hilfe: hilfeModell }],
};
