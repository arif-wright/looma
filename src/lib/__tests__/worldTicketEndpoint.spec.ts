import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../routes/api/world/ticket/+server';

const state = vi.hoisted(() => ({ privateEnv: { WORLD_JOIN_SECRET: 'synthetic-world-test-secret-more-than-32-characters' }, publicEnv: { PUBLIC_WORLD_ENABLED: 'true' } }));
vi.mock('$env/dynamic/private', () => ({ env: state.privateEnv }));
vi.mock('$env/dynamic/public', () => ({ env: state.publicEnv }));
const USER = '11111111-1111-4111-8111-111111111111';
const request = async (protocol: string | null, user: unknown = { id: USER }) => {
  const profile = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: USER, display_name: 'Synthetic Explorer', player_body: 'female' }, error: null }) };
  const companions = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
  const from = vi.fn((table) => table === 'profiles' ? profile : companions);
  const headers = new Headers({ origin: 'https://memvoya.test' }); if (protocol !== null) headers.set('x-world-protocol', protocol);
  const response = await POST({ locals: { user, supabase: { from } }, request: new Request('https://memvoya.test/api/world/ticket', { method: 'POST', headers }), url: new URL('https://memvoya.test/api/world/ticket') } as never);
  return { response, from };
};
beforeEach(() => { state.publicEnv.PUBLIC_WORLD_ENABLED = 'true'; });
describe('World ticket protocol negotiation', () => {
  it.each([null, '1', '3', '02', '2,1'])('does not mint a credential for missing/mismatched client version %s', async (protocol) => {
    const { response, from } = await request(protocol);
    expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: 'client_refresh_required' });
    expect(from).not.toHaveBeenCalled(); expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('mints version two only after authentication and an exact client version', async () => {
    const { response } = await request('2'); expect(response.status).toBe(200);
    const { ticket } = await response.json();
    const claims = JSON.parse(Buffer.from(ticket.split('.')[1], 'base64url').toString());
    expect(claims).toMatchObject({ protocol: 2, sub: USER, playerBody: 'female' });
  });
  it('retains auth and disabled-world gates before protocol negotiation', async () => {
    expect((await request('2', null)).response.status).toBe(401);
    state.publicEnv.PUBLIC_WORLD_ENABLED = 'false'; expect((await request('2')).response.status).toBe(404);
  });
});
