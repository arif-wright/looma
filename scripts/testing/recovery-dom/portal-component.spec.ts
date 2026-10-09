/** Local DOM proof only: real compiled component/session/connection, synthetic renderer adapters and transport. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, tick } from 'svelte';
import WorldGameMount from '../../../src/lib/game/WorldGameMount.svelte';
import { fixture } from '../moonberry-gather-preview/fake-colyseus';
import { getWorldArea, portalAtPosition } from '../../../src/lib/game/areas';
import { areaInteraction } from '../../../src/lib/game/renderers/three/areaPresentation';
import { MOONBERRY_INTERACTION } from '../../../src/lib/game/traversal';

const renderers = vi.hoisted(() => ({ selected: [] as string[], enter: null as (() => void) | null }));
function adapter(kind: string, _host: HTMLElement, options: any) {
  renderers.selected.push(kind);
  let local: any; let area: string | undefined;
  const enterPortal = () => {
    const portal = local && portalAtPosition(local.mapId, local);
    if (portal) options.session.enterPortal(portal.id);
  };
  renderers.enter = enterPortal;
  options.session.setSnapshotConsumer((snapshot: any) => {
    local = snapshot.players.get(snapshot.localPlayerId);
    if (local && local.mapId !== area) {
      area = local.mapId; options.onAreaChange(getWorldArea(area));
    }
    const interaction = areaInteraction(local, options.session.connectionStatus);
    options.onPortalPrompt(interaction.portal);
    options.onGatherPrompt(interaction.gather);
  });
  return { resize() {}, pause() {}, resume() {}, setTouchDirection() {},
    interact() { options.session.gatherMoonberry(); }, enterPortal,
    destroy() { options.session.setSnapshotConsumer(null); renderers.enter = null; } };
}
vi.mock('../../../src/lib/game/worldGame', () => ({ createWorldGame: (...args: any[]) => adapter('phaser', ...args as [HTMLElement, any]) }));
vi.mock('../../../src/lib/game/renderers/three/threeWorld', () => ({ createThreeWorld: (...args: any[]) => adapter('three', ...args as [HTMLElement, any]) }));
let component: ReturnType<typeof mount> | undefined;
const message = () => document.querySelector('.portal-result')?.textContent;
const portals = () => fixture.sent.filter(m => m.type === 'portal');
const button = () => document.querySelector('.portal-prompt button') as HTMLButtonElement;
const start = async () => { button().click(); await tick(); return String(portals().at(-1)!.payload.requestId); };
const settle = async () => { await tick(); await Promise.resolve(); await tick(); };
const arrive = async () => { fixture.current.transition('wilds-town', 160, 270); await settle(); };
const fail = async (id: string, kind: string) => {
  if (kind === 'timeout') await vi.advanceTimersByTimeAsync(10_050);
  else if (kind === 'drop') fixture.current.drop();
  else fixture.current.portalResult(id, kind);
  await settle();
};
beforeEach(() => {
  fixture.rooms.length = 0; fixture.sent.length = 0; fixture.tickets = 0; renderers.selected.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ticket: 'local-synthetic-ticket-not-a-credential', expiresAt: Date.now() + 60000 }), { status: 200 })));
  document.body.innerHTML = '<div id="target"></div>';
});
afterEach(async () => { if (component) await unmount(component); component = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
for (const renderer of ['phaser', 'three'] as const) describe(renderer, () => {
  beforeEach(async () => {
    component = mount(WorldGameMount, { target: document.querySelector('#target')!, props: { serverUrl: 'ws://synthetic-moonberry.invalid', renderer } });
    await vi.waitFor(() => expect(fixture.rooms.length).toBe(1));
    fixture.current.snapshot(880, 270); await settle();
    expect(renderers.selected).toEqual([renderer]);
  });
  for (const kind of ['timeout', 'drop', 'unavailable', 'failure', 'out_of_range', 'cooldown']) {
    for (const order of ['failure-first', 'destination-first']) it(`${kind} ${order}: only the matching destination supersedes feedback`, async () => {
      vi.useFakeTimers();
      const id = await start();
      if (order === 'destination-first') await arrive();
      await fail(id, kind);
      if (order === 'failure-first') {
        expect(message()).toBeTruthy();
        if (kind === 'drop') fixture.current.reconnect();
        await arrive();
      }
      expect(document.querySelector('[data-testid="world-area"]')?.textContent).toContain('Lantern Hollow');
      expect(message()).toBeUndefined(); expect(portals()).toHaveLength(1);
      fixture.current.portalResult(id, 'success', 'wilds-town');
      await vi.advanceTimersByTimeAsync(10_050); await settle();
      expect(message()).toBeUndefined(); expect(portals()).toHaveLength(1);
    });
    it(`${kind}: same-area observations retain useful guidance`, async () => {
      vi.useFakeTimers();
      const id = await start(); await fail(id, kind);
      if (kind === 'drop') fixture.current.reconnect();
      fixture.current.snapshot(880, 270); await settle();
      expect(message()).toBeTruthy(); expect(portals()).toHaveLength(1);
    });
  }
  it('retains same-area guidance, then isolates a fresh attempt from old results and timeout', async () => {
    vi.useFakeTimers();
    const old = await start(); await vi.advanceTimersByTimeAsync(5000);
    fixture.current.drop(); fixture.current.reconnect(); fixture.current.snapshot(880, 270); await settle();
    expect(message()).toContain('temporarily unavailable');
    const fresh = await start(); expect(fresh).not.toBe(old); expect(message()).toBeUndefined();
    fixture.current.portalResult(old, 'success', 'wilds-town');
    fixture.current.portalResult(old, 'failure');
    await vi.advanceTimersByTimeAsync(5050); await settle();
    expect(message()).toBeUndefined(); expect(button().disabled).toBe(true);
    fixture.current.portalResult(fresh, 'cooldown'); await settle();
    expect(message()).toContain('portal is settling'); expect(portals()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10_050); await settle();
    expect(message()).toContain('portal is settling');
  });
  for (const order of ['result-first', 'snapshot-first']) it(`preserves confirmed success ${order}`, async () => {
    vi.useFakeTimers();
    const id = await start();
    if (order === 'result-first') fixture.current.portalResult(id, 'success', 'wilds-town');
    await arrive();
    if (order === 'snapshot-first') fixture.current.portalResult(id, 'success', 'wilds-town');
    await vi.advanceTimersByTimeAsync(10_050); await settle();
    expect(message()).toBe('Arrived in Lantern Hollow.'); expect(portals()).toHaveLength(1);
  });
  it('duplicate renderer starts at the destination keep the original attempt target and send once', async () => {
    vi.useFakeTimers();
    await start(); await arrive(); fixture.current.snapshot(80, 270); await settle();
    // Simulate renderer/keyboard entry independently of the disabled HUD button.
    renderers.enter!(); renderers.enter!(); button().dispatchEvent(new MouseEvent('click'));
    await settle(); expect(portals()).toHaveLength(1); expect(button().disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(10_050); await settle();
    expect(message()).toBeUndefined(); expect(button().disabled).toBe(false); expect(portals()).toHaveLength(1);
  });
  it('arrival in an earlier attempt does not hide a new return-attempt failure', async () => {
    vi.useFakeTimers();
    const first = await start(); await arrive(); await vi.advanceTimersByTimeAsync(10_050); await settle();
    expect(message()).toBeUndefined();
    fixture.current.snapshot(80, 270); await settle();
    const second = await start(); expect(second).not.toBe(first);
    expect(portals()[1]!.payload.portalId).toBe('hollow-to-grove');
    fixture.current.portalResult(first, 'success', 'wilds-town'); await settle(); expect(button().disabled).toBe(true);
    fixture.current.portalResult(second, 'failure'); await settle(); expect(message()).toContain('temporarily unavailable');
    fixture.current.snapshot(160, 270); await settle(); expect(message()).toContain('temporarily unavailable');
    fixture.current.transition('wilds-exploration', 880, 270); await settle(); expect(message()).toBeUndefined();
    const third = await start(); fixture.current.portalResult(second, 'cooldown'); await settle(); expect(message()).toBeUndefined();
    fixture.current.portalResult(third, 'out_of_range'); await settle(); expect(message()).toContain('Move closer'); expect(portals()).toHaveLength(3);
  });
  it('visiting then leaving the destination does not suppress a later failure', async () => {
    const id = await start(); await arrive();
    fixture.current.transition('wilds-exploration', 880, 270); await settle();
    fixture.current.portalResult(id, 'failure'); await settle();
    expect(message()).toContain('temporarily unavailable'); expect(portals()).toHaveLength(1);
  });
  it('portal reconciliation does not change pending gather or its unconfirmed guidance', async () => {
    fixture.current.snapshot(MOONBERRY_INTERACTION.x, MOONBERRY_INTERACTION.y); await settle();
    (document.querySelector('.interaction-prompt button') as HTMLButtonElement).click(); await settle();
    const gatherId = String(fixture.gathers[0]!.payload.requestId);
    fixture.current.snapshot(880, 270); await settle(); await start(); await arrive();
    fixture.current.drop(); await settle();
    expect(message()).toBeUndefined();
    expect(document.querySelector('.gather-result')?.textContent).toContain('Check your Keepsakes');
    fixture.current.result(gatherId); fixture.current.reconnect(); await settle();
    expect(document.querySelector('.gather-result')?.textContent).toContain('Check your Keepsakes');
    expect(fixture.gathers).toHaveLength(1); expect(portals()).toHaveLength(1);
  });
  it('teardown rejects stale results and timers; remount begins without feedback', async () => {
    vi.useFakeTimers(); const id = await start(); await arrive();
    const oldRoom = fixture.current;
    await unmount(component!); component = undefined;
    oldRoom.portalResult(id, 'failure'); oldRoom.drop();
    await vi.advanceTimersByTimeAsync(10_050); await settle(); expect(message()).toBeUndefined();
    vi.useRealTimers();
    component = mount(WorldGameMount, { target: document.querySelector('#target')!, props: { serverUrl: 'ws://synthetic-moonberry.invalid', renderer } });
    await vi.waitFor(() => expect(fixture.rooms.length).toBe(2)); await settle();
    oldRoom.portalResult(id, 'success', 'wilds-town'); await settle();
    expect(message()).toBeUndefined(); expect(portals()).toHaveLength(1);
    expect(document.querySelector('[data-testid="world-area"]')?.textContent).toContain(getWorldArea().name);
  });
});
