import { BautaktFehler, jetztUtc } from '@bautakt/kern';
import type { Eintrag, Verlauf, Vorschlag } from '../gemeinsam/typen.js';
import { AGENT_KONFIG, KONFIG_HASH } from './agent.js';
import type { ClaudeApi, Ereignis, SendeEreignis } from './api.js';
import { apiSchluessel, fingerabdruck, holeHost, speicherAendern, speicherLesen } from './host.js';
import { werkzeugAusfuehren, type WerkzeugUmgebung } from './werkzeuge.js';

/*
 * Ein Gespräch je Projekt (E-99): Sitzung bei Anthropic, Ereignisstrom, Werkzeugaufrufe lokal,
 * Vorschläge zur Bestätigung. Der Verlauf für die Anzeige liegt im Speicher der App.
 */

const TEXT_GESPRAECH_ENDE =
  'Die Sitzung wurde beendet; die nächste Nachricht beginnt ein neues Gespräch.';

/** Agent und Umgebung einmal je API-Schlüssel anlegen, bei geänderter Konfiguration aktualisieren. */
async function agentSicherstellen(api: ClaudeApi, schluessel: string) {
  const f = fingerabdruck(schluessel);
  const a = speicherLesen().agent;
  if (a && a.fingerabdruck === f) {
    if (a.konfigHash === KONFIG_HASH) return a;
    const { version } = await api.agentAktualisieren(a.agentId, AGENT_KONFIG);
    const neu = { ...a, version, konfigHash: KONFIG_HASH };
    speicherAendern((s) => {
      s.agent = neu;
    });
    return neu;
  }
  const agent = await api.agentAnlegen(AGENT_KONFIG);
  const umgebung = await api.umgebungAnlegen('Bautakt');
  const neu = {
    fingerabdruck: f,
    agentId: agent.id,
    version: agent.version,
    konfigHash: KONFIG_HASH,
    umgebungId: umgebung.id,
  };
  speicherAendern((s) => {
    s.agent = neu;
  });
  return neu;
}

export class Gespraech {
  private eintraege: Eintrag[] = [];
  private naechste = 1;
  private naechsterVorschlag = 1;
  private laeuftJetzt = false;
  /** Rückmeldungen zu Vorschlägen, die mit der nächsten Nachricht an Claude gehen */
  private rueckmeldungen: string[] = [];
  kosten: string | null = null;

  constructor(
    readonly projektId: string,
    private umgebung: () => WerkzeugUmgebung,
  ) {}

  /** Zugriff auf das (ggf. neu geöffnete) Projekt setzen. */
  umgebungSetzen(u: () => WerkzeugUmgebung): void {
    this.umgebung = u;
  }

  get laeuft(): boolean {
    return this.laeuftJetzt;
  }

  private neu(e: Omit<Eintrag, 'nr' | 'zeit'>): Eintrag {
    const eintrag = { ...e, nr: this.naechste++, zeit: jetztUtc() };
    this.eintraege.push(eintrag);
    return eintrag;
  }

  verlauf(seit = 0): Verlauf {
    return { eintraege: this.eintraege.filter((e) => e.nr > seit), laeuft: this.laeuftJetzt };
  }

  /** Alle Einträge (auch geänderte Vorschläge) neu liefern. */
  alles(): Verlauf {
    return { eintraege: [...this.eintraege], laeuft: this.laeuftJetzt };
  }

  private sitzungId(): string | undefined {
    return speicherLesen().projekte[this.projektId]?.sitzungId;
  }

  private api(): ClaudeApi {
    const schluessel = apiSchluessel();
    if (!schluessel)
      throw new BautaktFehler('PLUGIN', 'Es ist noch kein API-Schlüssel eingetragen.');
    return holeHost().api(schluessel);
  }

  /** Nachricht senden; die Antwort läuft im Hintergrund ein (Abfrage „verlauf“). */
  senden(text: string): void {
    const t = text.trim();
    if (!t) return;
    if (this.laeuftJetzt)
      throw new BautaktFehler('PLUGIN', 'Claude arbeitet noch an der letzten Nachricht.');
    const api = this.api();
    if (!speicherLesen().projekte[this.projektId]?.zustimmung)
      throw new BautaktFehler(
        'PLUGIN',
        'Für dieses Projekt fehlt die Zustimmung zur Übertragung an Anthropic.',
      );
    this.neu({ art: 'nutzer', text: t });
    const vorspann = this.rueckmeldungen.splice(0);
    const inhalt = vorspann.length ? `[${vorspann.join(' ')}]\n\n${t}` : t;
    this.laeuftJetzt = true;
    void this.lauf(api, inhalt).finally(() => {
      this.laeuftJetzt = false;
    });
  }

  private async lauf(api: ClaudeApi, inhalt: string): Promise<void> {
    try {
      const schluessel = apiSchluessel() ?? '';
      let sitzung = this.sitzungId();
      if (!sitzung) {
        const a = await agentSicherstellen(api, schluessel);
        const titel = this.umgebung().projektName() || 'Bautakt';
        sitzung = (
          await api.sitzungAnlegen({
            agentId: a.agentId,
            version: a.version,
            umgebungId: a.umgebungId,
            titel,
          })
        ).id;
        const id = sitzung;
        speicherAendern((s) => {
          s.projekte[this.projektId] = {
            ...(s.projekte[this.projektId] ?? { zustimmung: true }),
            sitzungId: id,
          };
        });
      }
      // Strom zuerst öffnen, dann senden (sonst gehen frühe Ereignisse verloren)
      const strom = await api.strom(sitzung);
      await api.senden(sitzung, [
        { type: 'user.message', content: [{ type: 'text', text: inhalt }] },
      ]);
      await this.ereignisseVerarbeiten(api, sitzung, strom);
    } catch (e) {
      this.neu({ art: 'fehler', text: fehlerText(e) });
    }
  }

  private async ereignisseVerarbeiten(
    api: ClaudeApi,
    sitzung: string,
    strom: AsyncIterable<Ereignis>,
  ) {
    for await (const ev of strom) {
      switch (ev.type) {
        case 'agent.message': {
          const text = (ev.content ?? [])
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join('');
          if (text.trim()) this.neu({ art: 'claude', text });
          break;
        }
        case 'agent.custom_tool_use': {
          const name = ev.name ?? '';
          if (name !== 'aenderung_vorschlagen')
            this.neu({ art: 'werkzeug', text: WERKZEUG_TEXT[name] ?? name });
          const r = await werkzeugAusfuehren(name, ev.input, this.umgebung());
          const antwort: SendeEreignis = {
            type: 'user.custom_tool_result',
            custom_tool_use_id: ev.id,
            content: [{ type: 'text', text: r.text }],
            ...(r.fehler ? { is_error: true } : {}),
          };
          await api.senden(sitzung, [antwort]);
          break;
        }
        case 'session.usage': {
          const c = ev.usage?.list_cost;
          if (c)
            this.kosten = `${(Number(c.amount) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} ${c.currency}`;
          break;
        }
        case 'session.error':
          this.neu({ art: 'fehler', text: ev.error?.message ?? 'Fehler in der Sitzung.' });
          break;
        case 'session.status_terminated':
          speicherAendern((s) => {
            const p = s.projekte[this.projektId];
            if (p) delete p.sitzungId;
          });
          this.neu({ art: 'hinweis', text: TEXT_GESPRAECH_ENDE });
          return;
        case 'session.status_idle':
          // requires_action: wartet auf ein Werkzeugergebnis – weiterlesen
          if (ev.stop_reason?.type === 'requires_action') break;
          if (ev.stop_reason?.type === 'retries_exhausted')
            this.neu({
              art: 'fehler',
              text: 'Claude konnte die Anfrage nicht abschließen (Wiederholungen erschöpft).',
            });
          return;
      }
    }
  }

  /** Vorschlag anlegen (Werkzeug „aenderung_vorschlagen“). */
  vorschlagen(v: Omit<Vorschlag, 'nr' | 'zustand'>): number {
    const nr = this.naechsterVorschlag++;
    const vorschlag: Vorschlag = { ...v, nr, zustand: 'offen' };
    this.neu({ art: 'vorschlag', text: v.beschreibung, vorschlag });
    return nr;
  }

  /** Nutzer hat einen Vorschlag ausgeführt oder verworfen; Claude erfährt es mit der nächsten Nachricht. */
  vorschlagErledigt(nr: number, zustand: 'ausgefuehrt' | 'verworfen', fehler?: string): void {
    const e = this.eintraege.find((x) => x.vorschlag?.nr === nr);
    if (!e?.vorschlag || e.vorschlag.zustand !== 'offen') return;
    e.vorschlag = { ...e.vorschlag, zustand };
    this.rueckmeldungen.push(
      zustand === 'ausgefuehrt'
        ? `Vorschlag ${nr} wurde ausgeführt.`
        : `Vorschlag ${nr} wurde verworfen${fehler ? ` (${fehler})` : ''}.`,
    );
  }

  /** Laufende Antwort abbrechen. */
  async abbrechen(): Promise<void> {
    const s = this.sitzungId();
    if (!s || !this.laeuftJetzt) return;
    await this.api().senden(s, [{ type: 'user.interrupt' }]);
  }

  /** Neues Gespräch: die alte Sitzung bleibt bei Anthropic, wird hier aber nicht mehr fortgesetzt. */
  neuBeginnen(): void {
    if (this.laeuftJetzt) throw new BautaktFehler('PLUGIN', 'Claude arbeitet noch.');
    speicherAendern((s) => {
      const p = s.projekte[this.projektId];
      if (p) delete p.sitzungId;
    });
    this.eintraege = [];
    this.rueckmeldungen = [];
    this.kosten = null;
  }

  /** Verlauf löschen: Sitzung bei Anthropic löschen (E-99). */
  async loeschen(): Promise<void> {
    if (this.laeuftJetzt) throw new BautaktFehler('PLUGIN', 'Claude arbeitet noch.');
    const s = this.sitzungId();
    if (s) await this.api().sitzungLoeschen(s);
    this.neuBeginnen();
  }
}

const WERKZEUG_TEXT: Record<string, string> = {
  projekt_ueberblick: 'liest den Projektüberblick',
  plan_lesen: 'liest den Terminplan',
  kosten_lesen: 'liest die Kostenplanung',
  sollist_lesen: 'liest das Kosten-Soll-Ist',
  modell_lesen: 'liest die IFC-Modelle',
  befehle_beschreiben: 'sieht die verfügbaren Befehle nach',
};

function fehlerText(e: unknown): string {
  const m = (e as { status?: number; message?: string })?.message ?? String(e);
  const status = (e as { status?: number })?.status;
  if (status === 401)
    return 'Der API-Schlüssel wurde abgelehnt (401). Bitte in den Einstellungen prüfen.';
  if (status === 429)
    return 'Zu viele Anfragen oder Guthaben aufgebraucht (429). Bitte später erneut versuchen.';
  return `Verbindung zu Claude fehlgeschlagen: ${m}`;
}

/** Gespräche je Projekt (bleiben beim Reiterwechsel erhalten). */
const gespraeche = new Map<string, Gespraech>();

export function gespraech(projektId: string, umgebung: () => WerkzeugUmgebung): Gespraech {
  let g = gespraeche.get(projektId);
  if (!g) {
    g = new Gespraech(projektId, umgebung);
    gespraeche.set(projektId, g);
  } else g.umgebungSetzen(umgebung);
  return g;
}

/** Für Tests: alle Gespräche vergessen. */
export function gespraecheZuruecksetzen(): void {
  gespraeche.clear();
}
