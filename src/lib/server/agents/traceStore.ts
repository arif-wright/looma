import type { DispatchTrace } from '$lib/agents/types';

const MAX_TRACES = 50;
const traces: DispatchTrace[] = [];

export const addTrace = (trace: DispatchTrace) => {
  traces.push(trace);
  if (traces.length > MAX_TRACES) {
    traces.splice(0, traces.length - MAX_TRACES);
  }
};

export const listTraces = (limit = 20): DispatchTrace[] => {
  return traces.slice(Math.max(0, traces.length - limit));
};
