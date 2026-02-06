import type { AgentEvent, DispatchTrace } from './types';

export const exampleEvent: AgentEvent = {
  id: 'evt_001',
  type: 'companion_tick',
  scope: 'companion',
  timestamp: new Date('2026-02-06T18:30:00.000Z').toISOString(),
  payload: {
    trigger: 'idle',
    moodHint: 'calm'
  }
};

export const exampleTrace: DispatchTrace = {
  event: exampleEvent,
  results: [
    { agentId: 'safety', handled: true },
    {
      agentId: 'companion',
      handled: true,
      output: { mood: 'steady', note: 'Muse acknowledges the event.' }
    },
    { agentId: 'world', handled: false }
  ],
  vetoed: false
};
