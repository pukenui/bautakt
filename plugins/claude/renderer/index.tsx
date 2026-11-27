import type { RendererPlugin } from '@bautakt/ui';
import './claude.css';
import { ClaudeLeiste } from './ClaudeLeiste.js';

/** Renderer-Teil des Claude-Plugins: Seitenleiste „Claude“ (E-97). */
export const claudeRenderer: RendererPlugin = {
  id: 'claude',
  ansichten: [],
  seitenleiste: { id: 'claude.assistent', titel: '✦ Claude', komponente: ClaudeLeiste },
};
