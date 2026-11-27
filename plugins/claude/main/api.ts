import Anthropic from '@anthropic-ai/sdk';
import type { BetaManagedAgentsCustomToolParams } from '@anthropic-ai/sdk/resources/beta/agents/agents';

/*
 * Schmale Schicht über die Managed-Agents-API (Beta, E-99). Die Laufzeit kennt nur diese
 * Schnittstelle – so lässt sie sich mit einer simulierten Sitzung testen.
 */

/** Ereignis aus dem Sitzungsstrom (nur die Felder, die Bautakt auswertet). */
export interface Ereignis {
  id: string;
  type: string;
  /** agent.message */
  content?: { type: string; text?: string }[];
  /** agent.custom_tool_use */
  name?: string;
  input?: unknown;
  /** session.status_idle */
  stop_reason?: { type: string };
  /** session.error */
  error?: { message?: string; type?: string };
  /** session.usage */
  usage?: { list_cost?: { amount: string; currency: string } };
}

export type SendeEreignis =
  | { type: 'user.message'; content: { type: 'text'; text: string }[] }
  | {
      type: 'user.custom_tool_result';
      custom_tool_use_id: string;
      content: { type: 'text'; text: string }[];
      is_error?: boolean;
    }
  | { type: 'user.interrupt' };

export interface AgentKonfig {
  name: string;
  model: string;
  system: string;
  tools: BetaManagedAgentsCustomToolParams[];
}

export interface ClaudeApi {
  agentAnlegen(k: AgentKonfig): Promise<{ id: string; version: number }>;
  agentAktualisieren(id: string, k: AgentKonfig): Promise<{ version: number }>;
  umgebungAnlegen(name: string): Promise<{ id: string }>;
  sitzungAnlegen(a: {
    agentId: string;
    version: number;
    umgebungId: string;
    titel: string;
  }): Promise<{ id: string }>;
  sitzungLoeschen(id: string): Promise<void>;
  senden(sitzungId: string, ereignisse: SendeEreignis[]): Promise<void>;
  strom(sitzungId: string): Promise<AsyncIterable<Ereignis>>;
  verlauf(sitzungId: string): Promise<Ereignis[]>;
}

/** Echte Anbindung über das Anthropic-SDK (Managed Agents, Beta). */
export function anthropicApi(apiKey: string): ClaudeApi {
  const client = new Anthropic({ apiKey });
  return {
    async agentAnlegen(k) {
      const a = await client.beta.agents.create(k);
      return { id: a.id, version: a.version };
    },
    async agentAktualisieren(id, k) {
      const a = await client.beta.agents.update(id, k);
      return { version: a.version };
    },
    async umgebungAnlegen(name) {
      // Die Werkzeuge laufen lokal in Bautakt; der Container braucht kein Netz.
      const e = await client.beta.environments.create({
        name,
        config: { type: 'cloud', networking: { type: 'limited' } },
      });
      return { id: e.id };
    },
    async sitzungAnlegen(a) {
      const s = await client.beta.sessions.create({
        agent: { type: 'agent', id: a.agentId, version: a.version },
        environment_id: a.umgebungId,
        title: a.titel,
      });
      return { id: s.id };
    },
    async sitzungLoeschen(id) {
      await client.beta.sessions.delete(id);
    },
    async senden(sitzungId, ereignisse) {
      await client.beta.sessions.events.send(sitzungId, {
        events: ereignisse,
      });
    },
    async strom(sitzungId) {
      return (await client.beta.sessions.events.stream(
        sitzungId,
      )) as unknown as AsyncIterable<Ereignis>;
    },
    async verlauf(sitzungId) {
      const alle: Ereignis[] = [];
      for await (const e of client.beta.sessions.events.list(sitzungId))
        alle.push(e as unknown as Ereignis);
      return alle;
    },
  };
}
