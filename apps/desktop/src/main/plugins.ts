import type { BautaktPlugin } from '@bautakt/kern';
import { bibliothekPlugin } from '@bautakt/plugin-bibliothek/main';
import { terminePlugin } from '@bautakt/plugin-termine/main';

/** Fest eingebaute Plugins (E-36: vorerst nur Plugins aus diesem Repo). */
export const PLUGINS: readonly BautaktPlugin[] = [bibliothekPlugin, terminePlugin];
