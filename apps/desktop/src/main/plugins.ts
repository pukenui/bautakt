import type { BautaktPlugin } from '@bautakt/kern';
import { bimPlugin } from '@bautakt/plugin-bim/main';
import { claudePlugin } from '@bautakt/plugin-claude/main';
import { bibliothekPlugin } from '@bautakt/plugin-bibliothek/main';
import { kostenPlugin } from '@bautakt/plugin-kosten/main';
import { statistikPlugin } from '@bautakt/plugin-statistik/main';
import { terminePlugin } from '@bautakt/plugin-termine/main';

/** Fest eingebaute Plugins (E-36: vorerst nur Plugins aus diesem Repo). */
export const PLUGINS: readonly BautaktPlugin[] = [
  bibliothekPlugin,
  terminePlugin,
  kostenPlugin,
  statistikPlugin,
  bimPlugin,
  claudePlugin,
];
