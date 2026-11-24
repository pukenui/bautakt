import { v7 } from 'uuid';

/** Neue ID (UUID v7, zeitlich sortierbar). */
export function neueId(): string {
  return v7();
}

/** Aktueller Zeitpunkt in UTC (ISO 8601). */
export function jetztUtc(): string {
  return new Date().toISOString();
}
