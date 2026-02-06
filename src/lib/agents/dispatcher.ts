import type { Agent, AgentEvent, AgentRegistry, DispatchTrace, AgentResult } from './types';

const estimateTokens = (value: unknown) => {
  if (!value) return 0;
  try {
    const json = JSON.stringify(value);
    return Math.ceil(json.length / 4);
  } catch {
    return 0;
  }
};

const shouldRunAgent = (agent: Agent, event: AgentEvent, now: number, lastRun: number | undefined) => {
  if (!agent.caps.allowedScopes.includes(event.scope)) return false;
  if (typeof lastRun === 'number' && now - lastRun < agent.caps.minIntervalMs) return false;
  const tokens = estimateTokens(event.payload ?? {});
  return tokens <= agent.caps.maxTokens;
};

export type DispatchOptions = {
  registry?: AgentRegistry;
  lastRun?: Map<string, number>;
};

export const dispatchEvent = async (
  event: AgentEvent,
  options: DispatchOptions = {}
): Promise<DispatchTrace> => {
  const registry = options.registry ?? ({} as AgentRegistry);
  const lastRun = options.lastRun ?? new Map<string, number>();
  const now = Date.now();

  const results: AgentResult[] = [];

  const safety = registry.safety;
  if (safety) {
    const safetyResult = shouldRunAgent(safety, event, now, lastRun.get(safety.id))
      ? await safety.handle(event)
      : { agentId: safety.id, handled: false, reason: 'caps_exceeded_or_scope_mismatch' };
    results.push(safetyResult);
    lastRun.set(safety.id, now);

    if (safetyResult.veto) {
      return {
        event,
        results,
        vetoed: true,
        vetoReason: safetyResult.reason ?? 'vetoed'
      };
    }
  }

  const otherAgents = Object.values(registry).filter((agent) => agent.id !== 'safety');
  for (const agent of otherAgents) {
    const eligible = shouldRunAgent(agent, event, now, lastRun.get(agent.id));
    if (!eligible) {
      results.push({ agentId: agent.id, handled: false, reason: 'caps_exceeded_or_scope_mismatch' });
      continue;
    }
    const result = await agent.handle(event);
    results.push(result);
    lastRun.set(agent.id, now);
  }

  return { event, results, vetoed: false };
};
