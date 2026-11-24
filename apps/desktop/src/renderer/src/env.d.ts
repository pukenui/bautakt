import type { BautaktApi } from '@bautakt/kern/vertrag';

declare global {
  interface Window {
    /** Vom Preload bereitgestellte, typisierte IPC-API. */
    readonly bautakt: BautaktApi;
  }
}

export {};
