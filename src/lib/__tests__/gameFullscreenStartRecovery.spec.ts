import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
const deferred = () => {
  let resolve!: () => void; let reject!: (err: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
let doc: { body: { style: { overflow: string } }; fullscreenElement: unknown; exitFullscreen: Mock<[], Promise<void>> };
let fullscreen: typeof import('$lib/games/fullscreen');
const target = (request?: () => Promise<void>) => ({
  style: { position: '', inset: '', width: '', height: '', touchAction: '' },
  requestFullscreen: request
}) as unknown as HTMLElement;

beforeEach(async () => {
  vi.resetModules();
  doc = { body: { style: { overflow: 'auto' } }, fullscreenElement: null,
    exitFullscreen: vi.fn(async () => { doc.fullscreenElement = null; }) };
  vi.stubGlobal('document', doc); vi.stubGlobal('navigator', { userAgent: 'local-test' });
  fullscreen = await import('$lib/games/fullscreen');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('optional fullscreen start ownership', () => {
  it('does nothing for a pre-cancelled attempt', async () => {
    const request = vi.fn(); const controller = new AbortController(); controller.abort();
    await fullscreen.enterFullscreen(target(request), { signal: controller.signal });
    expect(request).not.toHaveBeenCalled(); expect(doc.body.style.overflow).toBe('auto');
  });

  it('never activates fallback after a cancelled native request rejects late', async () => {
    const gate = deferred(); const controller = new AbortController(); const old = target(() => gate.promise);
    const entry = fullscreen.enterFullscreen(old, { signal: controller.signal });
    controller.abort(); gate.reject(new Error('late browser rejection')); await entry;
    expect(doc.body.style.overflow).toBe('auto'); expect(old.style.position).toBe('');
    expect(fullscreen.isFullscreen()).toBe(false);
  });

  it('exits a late native success only when that old target is still fullscreen', async () => {
    const gate = deferred(); const controller = new AbortController(); const old = target(() => gate.promise);
    const entry = fullscreen.enterFullscreen(old, { signal: controller.signal });
    controller.abort(); doc.fullscreenElement = old; gate.resolve(); await entry;
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(doc.fullscreenElement).toBeNull();
  });

  it('does not exit a newer target when an old native request succeeds late', async () => {
    const gate = deferred(); const controller = new AbortController(); const old = target(() => gate.promise);
    const entry = fullscreen.enterFullscreen(old, { signal: controller.signal });
    controller.abort(); const next = target(); doc.fullscreenElement = next;
    gate.resolve(); await entry;
    expect(doc.exitFullscreen).not.toHaveBeenCalled(); expect(doc.fullscreenElement).toBe(next);
  });

  it('old cancellation/rejection cannot release a newer fallback or leak body overflow', async () => {
    const gate = deferred(); const oldController = new AbortController(); const old = target(() => gate.promise);
    const oldEntry = fullscreen.enterFullscreen(old, { signal: oldController.signal });
    const nextController = new AbortController(); const next = target();
    await fullscreen.enterFullscreen(next, { signal: nextController.signal });
    oldController.abort(); gate.reject(new Error('late rejection')); await oldEntry;
    expect(doc.body.style.overflow).toBe('hidden'); expect(next.style.position).toBe('fixed');
    expect(old.style.position).toBe('');
    nextController.abort(); expect(doc.body.style.overflow).toBe('auto'); expect(next.style.position).toBe('');
  });

  it('replacing fallback targets restores the original body style after the newer one exits', async () => {
    const firstController = new AbortController(); const first = target();
    await fullscreen.enterFullscreen(first, { signal: firstController.signal });
    const nextController = new AbortController(); const next = target();
    await fullscreen.enterFullscreen(next, { signal: nextController.signal });
    firstController.abort(); expect(doc.body.style.overflow).toBe('hidden');
    expect(first.style.position).toBe(''); expect(next.style.position).toBe('fixed');
    nextController.abort(); expect(doc.body.style.overflow).toBe('auto');
  });

  it('old cancellation cannot release a newer attempt using the same target', async () => {
    const el = target(); const firstController = new AbortController(); const nextController = new AbortController();
    await fullscreen.enterFullscreen(el, { signal: firstController.signal });
    await fullscreen.enterFullscreen(el, { signal: nextController.signal });
    firstController.abort(); expect(doc.body.style.overflow).toBe('hidden');
    nextController.abort(); expect(doc.body.style.overflow).toBe('auto');
  });

  it('cleans a late old native success after both same-target attempts were cancelled', async () => {
    const oldGate = deferred(); const nextGate = deferred();
    const request = vi.fn().mockReturnValueOnce(oldGate.promise).mockReturnValueOnce(nextGate.promise);
    const el = target(request); const oldController = new AbortController(); const nextController = new AbortController();
    const oldEntry = fullscreen.enterFullscreen(el, { signal: oldController.signal });
    oldController.abort();
    const nextEntry = fullscreen.enterFullscreen(el, { signal: nextController.signal });
    nextController.abort();
    doc.fullscreenElement = el; oldGate.resolve(); await oldEntry;
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1); expect(doc.fullscreenElement).toBeNull();
    nextGate.resolve(); await nextEntry;
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('preserves a newer live same-target native attempt when the old one settles', async () => {
    const oldGate = deferred(); const nextGate = deferred();
    const request = vi.fn().mockReturnValueOnce(oldGate.promise).mockReturnValueOnce(nextGate.promise);
    const el = target(request); const oldController = new AbortController(); const nextController = new AbortController();
    const oldEntry = fullscreen.enterFullscreen(el, { signal: oldController.signal });
    oldController.abort();
    const nextEntry = fullscreen.enterFullscreen(el, { signal: nextController.signal });
    doc.fullscreenElement = el; oldGate.resolve(); await oldEntry;
    expect(doc.exitFullscreen).not.toHaveBeenCalled();
    nextGate.resolve(); await nextEntry; nextController.abort();
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('preserves the existing signal-free fallback and exit API', async () => {
    const el = target(); await fullscreen.enterFullscreen(el);
    expect(fullscreen.isFullscreen()).toBe(true); expect(doc.body.style.overflow).toBe('hidden');
    await fullscreen.exitFullscreen(); expect(fullscreen.isFullscreen()).toBe(false);
    expect(doc.body.style.overflow).toBe('auto');
  });
});


describe('optional orientation start ownership', () => {
  const orientation = () => {
    const lock = vi.fn<[string], Promise<void>>();
    const unlock = vi.fn();
    vi.stubGlobal('navigator', { userAgent: 'Android local-test' });
    vi.stubGlobal('window', { screen: { orientation: { lock, unlock } } });
    return { lock, unlock };
  };

  it('does not request a lock for a pre-cancelled attempt', async () => {
    const api = orientation(); const controller = new AbortController(); controller.abort();
    await fullscreen.requestLandscape({ signal: controller.signal });
    expect(api.lock).not.toHaveBeenCalled(); expect(api.unlock).not.toHaveBeenCalled();
  });

  it('releases an old lock that succeeds after cancellation', async () => {
    const api = orientation(); const gate = deferred(); api.lock.mockReturnValueOnce(gate.promise);
    const controller = new AbortController();
    const pending = fullscreen.requestLandscape({ signal: controller.signal });
    controller.abort(); api.unlock.mockClear();
    gate.resolve(); await pending;
    expect(api.unlock).toHaveBeenCalledTimes(1);
  });

  it('does not unlock a newer live orientation attempt when the old one succeeds late', async () => {
    const api = orientation(); const oldGate = deferred(); const nextGate = deferred();
    api.lock.mockReturnValueOnce(oldGate.promise).mockReturnValueOnce(nextGate.promise);
    const oldController = new AbortController(); const nextController = new AbortController();
    const old = fullscreen.requestLandscape({ signal: oldController.signal });
    oldController.abort();
    const next = fullscreen.requestLandscape({ signal: nextController.signal });
    api.unlock.mockClear(); oldGate.resolve(); await old;
    expect(api.unlock).not.toHaveBeenCalled();
    nextGate.resolve(); await next; nextController.abort();
    expect(api.unlock).toHaveBeenCalledTimes(1);
  });

  it('releases late old success after both orientation attempts were cancelled', async () => {
    const api = orientation(); const oldGate = deferred(); const nextGate = deferred();
    api.lock.mockReturnValueOnce(oldGate.promise).mockReturnValueOnce(nextGate.promise);
    const oldController = new AbortController(); const nextController = new AbortController();
    const old = fullscreen.requestLandscape({ signal: oldController.signal }); oldController.abort();
    const next = fullscreen.requestLandscape({ signal: nextController.signal }); nextController.abort();
    api.unlock.mockClear(); oldGate.resolve(); await old;
    expect(api.unlock).toHaveBeenCalledTimes(1);
    nextGate.resolve(); await next;
    expect(api.unlock).toHaveBeenCalledTimes(2);
  });

  it('does not let a newer failed attempt block cleanup of cancelled old success', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const api = orientation(); const oldGate = deferred();
    api.lock.mockReturnValueOnce(oldGate.promise).mockRejectedValueOnce(new Error('new lock unavailable'));
    const oldController = new AbortController();
    const old = fullscreen.requestLandscape({ signal: oldController.signal }); oldController.abort();
    await fullscreen.requestLandscape(); api.unlock.mockClear();
    oldGate.resolve(); await old; expect(api.unlock).toHaveBeenCalledTimes(1);
  });

  it('drains deferred old-lock cleanup when the newer pending lock rejects afterward', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const api = orientation(); const oldGate = deferred(); const nextGate = deferred();
    api.lock.mockReturnValueOnce(oldGate.promise).mockReturnValueOnce(nextGate.promise);
    const oldController = new AbortController();
    const old = fullscreen.requestLandscape({ signal: oldController.signal }); oldController.abort();
    const next = fullscreen.requestLandscape(); api.unlock.mockClear();
    oldGate.resolve(); await old; expect(api.unlock).not.toHaveBeenCalled();
    nextGate.reject(new Error('new lock failed after old success')); await next;
    expect(api.unlock).toHaveBeenCalledTimes(1);
  });

  it('keeps deferred cleanup from unlocking a still newer live attempt', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const api = orientation(); const oldGate = deferred(); const nextGate = deferred(); const newestGate = deferred();
    api.lock.mockReturnValueOnce(oldGate.promise).mockReturnValueOnce(nextGate.promise).mockReturnValueOnce(newestGate.promise);
    const oldController = new AbortController(); const newestController = new AbortController();
    const old = fullscreen.requestLandscape({ signal: oldController.signal }); oldController.abort();
    const next = fullscreen.requestLandscape(); api.unlock.mockClear();
    oldGate.resolve(); await old;
    const newest = fullscreen.requestLandscape({ signal: newestController.signal });
    nextGate.reject(new Error('middle lock failed')); await next;
    expect(api.unlock).not.toHaveBeenCalled();
    newestGate.resolve(); await newest; expect(api.unlock).not.toHaveBeenCalled();
    newestController.abort(); expect(api.unlock).toHaveBeenCalledTimes(1);
  });

  it('preserves signal-free successful landscape requests', async () => {
    const api = orientation(); api.lock.mockResolvedValueOnce(undefined);
    await fullscreen.requestLandscape();
    expect(api.lock).toHaveBeenCalledWith('landscape'); expect(api.unlock).not.toHaveBeenCalled();
  });
});
