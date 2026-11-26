import { bibliothekRenderer } from '@bautakt/plugin-bibliothek/renderer';
import { termineRenderer } from '@bautakt/plugin-termine/renderer';
import type { RendererPlugin } from '@bautakt/ui';

/** Renderer-Teile der eingebauten Plugins (Gegenstück zu src/main/plugins.ts). */
export const RENDERER_PLUGINS: readonly RendererPlugin[] = [termineRenderer, bibliothekRenderer];
