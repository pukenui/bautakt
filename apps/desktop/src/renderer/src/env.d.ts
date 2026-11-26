import type { BautaktApi } from '@bautakt/kern/vertrag';

declare global {
  /** App-Version (aus package.json, beim Build eingesetzt). */
  const __APP_VERSION__: string;

  interface Window {
    /** Vom Preload bereitgestellte, typisierte IPC-API. */
    readonly bautakt: BautaktApi;
  }
}

export {};
