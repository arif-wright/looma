export type AgentId = 'safety' | 'companion' | 'world';

export type AgentEvent = {
  id: string;
  type: string;
  scope: string;
  timestamp: string;
  payload?: Record<string, unknown> | null;
};

export type AgentCaps = {
  maxTokens: number;
  minIntervalMs: number;
  allowedScopes: string[];
};

export type AgentResult = {
  agentId: AgentId;
  handled: boolean;
  veto?: boolean;
  reason?: string;
  output?: Record<string, unknown> | null;
};

export type Agent = {
  id: AgentId;
  label: string;
  caps: AgentCaps;
  handle: (event: AgentEvent) => Promise<AgentResult> | AgentResult;
};

export type AgentRegistry = Record<AgentId, Agent>;

export type DispatchTrace = {
  event: AgentEvent;
  results: AgentResult[];
  vetoed: boolean;
  vetoReason?: string;
};
