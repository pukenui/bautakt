import type { BautaktPlugin } from '@bautakt/kern';
import { terminePlugin } from '@bautakt/plugin-termine/main';

/** Fest eingebaute Plugins (E-36: vorerst nur Plugins aus diesem Repo). */
export const PLUGINS: readonly BautaktPlugin[] = [terminePlugin];
