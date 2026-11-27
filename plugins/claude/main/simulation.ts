import type { AgentKonfig, ClaudeApi, Ereignis, SendeEreignis } from './api.js';

/*
 * Simulierte Sitzung (nur Tests und Entwicklung, z. B. BAUTAKT_TEST_CLAUDE=simulation): spielt
 * einen festen Ablauf mit echten Werkzeugaufrufen, ohne Anthropic zu kontaktieren.
 *
 * Ablauf je Nachricht: projekt_ueberblick → bei „kritisch“ oder „Vorschlag“ plan_lesen des ersten
 * Plans → bei „Vorschlag“ ein Änderungsvorschlag (Anmerkung des ersten Vorgangs) → Antworttext.
 */
export function simulierteApi(): ClaudeApi & {
  gesendet: SendeEreignis[];
  agentKonfig: AgentKonfig[];
} {
  let n = 0;
  const id = (p: string) => `${p}_sim_${++n}`;
  const gesendet: SendeEreignis[] = [];
  const agentKonfig: AgentKonfig[] = [];
  let warteschlange: Ereignis[] = [];
  let wecken: (() => void) | null = null;
  let nachricht = '';
  let schritt = 0;
  let ergebnisse: string[] = [];

  const emit = (...e: Ereignis[]) => {
    warteschlange.push(...e);
    wecken?.();
  };
  const werkzeug = (name: string, input: unknown) =>
    emit(
      { id: id('sevt'), type: 'agent.custom_tool_use', name, input },
      { id: id('sevt'), type: 'session.status_idle', stop_reason: { type: 'requires_action' } },
    );
  const fertig = (text: string) =>
    emit(
      { id: id('sevt'), type: 'agent.message', content: [{ type: 'text', text }] },
      {
        id: id('sevt'),
        type: 'session.usage',
        usage: { list_cost: { amount: '12', currency: 'USD' } },
      },
      { id: id('sevt'), type: 'session.status_idle', stop_reason: { type: 'end_turn' } },
    );

  const weiter = () => {
    schritt++;
    const vorschlag = /vorschlag/i.test(nachricht);
    const kritisch = /kritisch/i.test(nachricht);
    if (schritt === 1) return werkzeug('projekt_ueberblick', {});
    if (schritt === 2 && (vorschlag || kritisch)) {
      const ueberblick = JSON.parse(ergebnisse[0] ?? '{}') as { terminplaene?: { id: string }[] };
      const plan = ueberblick.terminplaene?.[0]?.id;
      if (plan) return werkzeug('plan_lesen', { plan_id: plan });
    }
    if (schritt === 3 && vorschlag) {
      const plan = JSON.parse(ergebnisse[1] ?? '{}') as { vorgaenge?: { id: string }[] };
      const v = plan.vorgaenge?.find(Boolean);
      if (v)
        return werkzeug('aenderung_vorschlagen', {
          plugin: 'termine',
          befehl: 'vorgang.aendern',
          daten: { id: v.id, felder: { anmerkung: 'Dauer mit dem Lieferanten abstimmen.' } },
          beschreibung: 'Anmerkung zum ersten Vorgang ergänzen.',
        });
    }
    const plan = ergebnisse[1]
      ? (JSON.parse(ergebnisse[1]) as { vorgaenge?: { kritisch?: boolean; name: string }[] })
      : null;
    const kritische = plan?.vorgaenge?.filter((v) => v.kritisch).map((v) => v.name) ?? [];
    return fertig(
      kritisch && plan
        ? `Simulation: ${kritische.length} kritische Vorgänge – ${kritische.join(', ')}.`
        : `Simulation: Projekt gelesen (${ergebnisse[0]?.length ?? 0} Zeichen).`,
    );
  };

  return {
    gesendet,
    agentKonfig,
    async agentAnlegen(k) {
      agentKonfig.push(k);
      return { id: 'agent_sim', version: 1 };
    },
    async agentAktualisieren(_id, k) {
      agentKonfig.push(k);
      return { version: agentKonfig.length };
    },
    async umgebungAnlegen() {
      return { id: 'env_sim' };
    },
    async sitzungAnlegen() {
      return { id: id('sesn') };
    },
    async sitzungLoeschen() {},
    async senden(_s, ereignisse) {
      gesendet.push(...ereignisse);
      for (const e of ereignisse) {
        if (e.type === 'user.message') {
          nachricht = e.content.map((c) => c.text).join(' ');
          schritt = 0;
          ergebnisse = [];
          emit({ id: id('sevt'), type: 'session.status_running' });
          weiter();
        } else if (e.type === 'user.custom_tool_result') {
          ergebnisse.push(e.content.map((c) => c.text).join(''));
          weiter();
        } else if (e.type === 'user.interrupt') {
          emit({ id: id('sevt'), type: 'session.status_idle', stop_reason: { type: 'end_turn' } });
        }
      }
    },
    async strom() {
      warteschlange = [];
      return {
        async *[Symbol.asyncIterator]() {
          for (;;) {
            while (warteschlange.length) {
              const e = warteschlange.shift() as Ereignis;
              yield e;
              if (e.type === 'session.status_idle' && e.stop_reason?.type !== 'requires_action')
                return;
            }
            await new Promise<void>((r) => (wecken = r));
            wecken = null;
          }
        },
      };
    },
    async verlauf() {
      return [];
    },
  };
}
