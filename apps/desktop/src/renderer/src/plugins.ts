import { bimRenderer } from '@bautakt/plugin-bim/renderer';
import { bibliothekRenderer } from '@bautakt/plugin-bibliothek/renderer';
import { kostenRenderer } from '@bautakt/plugin-kosten/renderer';
import { statistikRenderer } from '@bautakt/plugin-statistik/renderer';
import { termineRenderer } from '@bautakt/plugin-termine/renderer';
import type { RendererPlugin } from '@bautakt/ui';

/** Renderer-Teile der eingebauten Plugins (Gegenstück zu src/main/plugins.ts). */
export const RENDERER_PLUGINS: readonly RendererPlugin[] = [
  termineRenderer,
  kostenRenderer,
  bimRenderer,
  bibliothekRenderer,
  statistikRenderer,
];
