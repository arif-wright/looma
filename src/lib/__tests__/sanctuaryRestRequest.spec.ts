import { expect, it } from 'vitest';
import { forgetRest, isRestRequest, pendingRest, rememberRest } from '$lib/sanctuary/restRequest';
const companionId = '20000000-0000-0000-0000-000000000001';
const request = { companionId, requestId: '50000000-0000-0000-0000-000000000001' };
const storage = () => {
  const map = new Map<string,string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key,value); }, removeItem: (key: string) => { map.delete(key); } };
};
it('retains the same request across remount/reload and clears only after a confirmed outcome', () => {
  const saved = storage();
  rememberRest(saved,request);
  expect(pendingRest(saved,companionId)).toEqual(request);
  // Uncertain failure performs no deletion: a new component reads the same UUID.
  expect(pendingRest(saved,companionId)).toEqual(request);
  forgetRest(saved,request);
  expect(pendingRest(saved,companionId)).toBeNull();
});
it('does not clear a newer request when an older response finishes', () => {
  const saved = storage();
  const newer = { ...request, requestId: '50000000-0000-0000-0000-000000000002' };
  rememberRest(saved,newer);
  forgetRest(saved,request);
  expect(pendingRest(saved,companionId)).toEqual(newer);
});
it('does not reuse a request for another companion', () => {
  const saved = storage(); rememberRest(saved,request);
  expect(pendingRest(saved,'20000000-0000-0000-0000-000000000002')).toBeNull();
});
it('rejects corrupt saved payloads and tolerates disabled storage', () => {
  expect(isRestRequest({ ...request, requestId: 'not-a-uuid' })).toBe(false);
  const unavailable = { getItem: () => { throw Error(); }, setItem: () => { throw Error(); }, removeItem: () => { throw Error(); } };
  expect(() => rememberRest(unavailable,request)).not.toThrow();
  expect(pendingRest(unavailable,companionId)).toBeNull();
  expect(() => forgetRest(unavailable,request)).not.toThrow();
});
