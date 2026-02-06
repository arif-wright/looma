import type { Agent, AgentRegistry } from './types';

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
    if (event.type !== 'companion_tick') {
      return { agentId: 'companion', handled: false };
    }

    return {
      agentId: 'companion',
      handled: true,
      output: {
        mood: 'steady',
        note: 'Muse acknowledges the event.'
      }
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
