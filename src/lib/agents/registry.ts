import type { Agent, AgentRegistry } from './types';
import { dev } from '$app/environment';

const safetyAgent: Agent = {
  id: 'safety',
  label: 'Safety Agent',
  caps: {
    maxTokens: 256,
    minIntervalMs: 100,
    allowedScopes: ['app', 'companion', 'world', 'system']
  },
  handle: (event) => {
    if (event.type === 'unsafe_action') {
      return {
        agentId: 'safety',
        handled: true,
        veto: true,
        reason: 'Unsafe action blocked by Safety Agent.'
      };
    }

    return { agentId: 'safety', handled: true };
  }
};

const companionAgent: Agent = {
  id: 'companion',
  label: 'Companion Persona Agent (Muse)',
  caps: {
    maxTokens: 512,
    minIntervalMs: 250,
    allowedScopes: ['companion', 'app']
  },
  handle: (event) => {
    if (!['session.start', 'session.return', 'game.complete'].includes(event.type)) {
      return { agentId: 'companion', handled: false };
    }

    const payload = (event.payload ?? {}) as Record<string, any>;
    const suppress = Boolean(payload?.suppressReactions === true || event.meta?.suppressReactions === true);

    if (suppress) {
      return {
        agentId: 'companion',
        handled: true,
        output: { suppressed: true, mood: 'steady', note: 'Muse acknowledges the event.' }
      };
    }

    const tone = String((event.context as any)?.portableState?.tone ?? 'warm');
    const isDirect = tone === 'direct';

    let text = '';
    if (event.type === 'session.start') {
      text = isDirect ? 'You are back. Ready when you are.' : 'Welcome back. I am here if you need me.';
    } else if (event.type === 'session.return') {
      text = isDirect ? 'Welcome back.' : 'Welcome back. Want to pick up where we left off?';
    } else if (event.type === 'game.complete') {
      const score = typeof payload?.score === 'number' ? payload.score : null;
      text = isDirect
        ? 'Nice work. Session logged.'
        : score !== null
          ? `Nice work. Score: ${score}.`
          : 'Nice work. I saw that run.';
    }

    const reaction = {
      text,
      kind: event.type,
      ttlMs: 3500
    };

    if (dev) {
      console.debug('[agent:companion] reaction', reaction);
    }

    return {
      agentId: 'companion',
      handled: true,
      output: { reaction, mood: 'steady', note: 'Muse acknowledges the event.' }
    };
  }
};

const worldAgent: Agent = {
  id: 'world',
  label: 'World State Agent',
  caps: {
    maxTokens: 384,
    minIntervalMs: 300,
    allowedScopes: ['world', 'app']
  },
  handle: (event) => {
    if (event.type !== 'world_tick') {
      return { agentId: 'world', handled: false };
    }

    return {
      agentId: 'world',
      handled: true,
      output: {
        timeOfDay: 'dusk',
        ambient: 'calm'
      }
    };
  }
};

export const agentRegistry: AgentRegistry = {
  safety: safetyAgent,
  companion: companionAgent,
  world: worldAgent
};
