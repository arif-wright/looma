import { afterEach, describe, expect, it, vi } from 'vitest';
import { RUNNER_LANTERNWAY_ATLAS as ATLAS } from '$lib/games/runnerLanternwayAtlas';
import { drawRunnerLanternway, loadRunnerLanternwaySkin, RUNNER_LANTERNWAY_URLS, type RunnerLanternwayAssets, type RunnerRenderFrame } from '$lib/games/runnerLanternwaySkin';

const keys = Object.keys(RUNNER_LANTERNWAY_URLS) as Array<keyof typeof RUNNER_LANTERNWAY_URLS>;
function imageHarness() {
  const images: HTMLImageElement[] = [];
  const factory = () => {
    const key = keys[images.length];
    if (!key) throw Error('Unexpected extra image request');
    const shape = ATLAS[key];
    const image = { complete: false, naturalWidth: shape.width, naturalHeight: shape.height, onload: null, onerror: null, src: '', decode: vi.fn().mockResolvedValue(undefined), removeAttribute: vi.fn() } as unknown as HTMLImageElement;
    images.push(image); return image;
  };
  const imageAt = (index: number) => { const image = images[index]; if (!image) throw Error('Missing harness image'); return image; };
  const ready = (index: number) => { const image = imageAt(index); Object.defineProperty(image, 'complete', { value: true }); image.onload?.call(image, new Event('load')); };
  return { images, factory, ready, imageAt };
}
const fullAssets = () => Object.fromEntries(keys.map((key) => [key, { naturalWidth: ATLAS[key].width, naturalHeight: ATLAS[key].height }])) as RunnerLanternwayAssets;
function context() {
  return { clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), drawImage: vi.fn(), beginPath: vi.fn(), ellipse: vi.fn(), fill: vi.fn(), stroke: vi.fn(), save: vi.fn(), restore: vi.fn(), fillText: vi.fn(), createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })) };
}
const frame: RunnerRenderFrame = { width: 960, height: 540, groundY: 405, elapsedMs: 1080, playerX: 192, playerY: 405, playerVy: 0, hasShield: true, shieldPulse: 0, magnetTimer: 0, doubleShardsTimer: 0, slowMoTimer: 0, dashTimer: 0, dreamSurgeTimer: 0, obstacles: [{x: 500,width: 44,height: 72}], shards: [{x:400,y:355}], powerups: [{type:'shield',x:680,y:335}], shardPopups: [] };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Lanternway bounded asset loading', () => {
  it('decodes only the five local assets and releases all callbacks', async () => {
    const h = imageHarness(); const result = loadRunnerLanternwaySkin({ imageFactory: h.factory });
    expect(h.images.map(i => i.src)).toEqual(Object.values(RUNNER_LANTERNWAY_URLS));
    h.images.forEach((_,i) => h.ready(i)); expect((await result).complete).toBe(true);
    h.images.forEach(i => { expect(i.onload).toBeNull(); expect(i.onerror).toBeNull(); expect(i.decode).toHaveBeenCalledOnce(); });
  });
  it('returns no partial snapshot after any asset error', async () => {
    const h=imageHarness(), promise=loadRunnerLanternwaySkin({imageFactory:h.factory});
    h.imageAt(2).onerror?.call(h.imageAt(2),new Event('error')); [0,1,3,4].forEach(h.ready);
    expect(await promise).toEqual({assets:{},complete:false}); expect(h.images).toHaveLength(5);
  });
  it('aborts every request and ignores a late decode without empty-src assignment', async () => {
    const h=imageHarness(), controller=new AbortController(); let release!:()=>void;
    const promise=loadRunnerLanternwaySkin({imageFactory:h.factory,signal:controller.signal});
    vi.mocked(h.imageAt(0).decode).mockReturnValue(new Promise<void>(resolve=>{release=resolve;})); h.ready(0);
    controller.abort(); const result=await promise; release(); await Promise.resolve();
    expect(result).toEqual({assets:{},complete:false});
    h.images.forEach(i=>{expect(i.onload).toBeNull();expect(i.onerror).toBeNull();expect(i.src).not.toBe('');});
    h.images.slice(1).forEach(i=>expect(i.removeAttribute).toHaveBeenCalledWith('src'));
  });
  it('uses a bounded timeout and cannot mutate a settled result', async () => {
    vi.useFakeTimers(); const h=imageHarness(); const promise=loadRunnerLanternwaySkin({imageFactory:h.factory,timeoutMs:20});
    await vi.advanceTimersByTimeAsync(20); const result=await promise; expect(result).toEqual({assets:{},complete:false});
    h.images.forEach((_,i)=>h.ready(i)); await Promise.resolve(); expect(result.assets).toEqual({});
  });
  it('does not request after pre-abort and survives Image construction failure', async () => {
    const controller=new AbortController(); controller.abort(); const factory=vi.fn();
    expect(await loadRunnerLanternwaySkin({signal:controller.signal,imageFactory:factory})).toEqual({assets:{},complete:false}); expect(factory).not.toHaveBeenCalled();
    expect(await loadRunnerLanternwaySkin({imageFactory:()=>{throw Error('no Image');}})).toEqual({assets:{},complete:false});
  });
  it('rejects zero dimensions and decode failures', async () => {
    const h=imageHarness(), promise=loadRunnerLanternwaySkin({imageFactory:h.factory});
    vi.mocked(h.imageAt(0).decode).mockRejectedValue(Error('decode')); Object.defineProperty(h.imageAt(1),'naturalWidth',{value:0});
    h.images.forEach((_,i)=>h.ready(i)); expect(await promise).toEqual({assets:{},complete:false});
  });
  it('reports fallback for a nonzero but stale atlas size', async () => {
    const h=imageHarness(), promise=loadRunnerLanternwaySkin({imageFactory:h.factory});
    Object.defineProperty(h.imageAt(2),'naturalWidth',{value:512});h.images.forEach((_,i)=>h.ready(i));
    expect(await promise).toEqual({assets:{},complete:false});expect(h.imageAt(2).decode).not.toHaveBeenCalled();
  });
});

describe('Lanternway cosmetic renderer', () => {
  it('requests fallback before drawing for missing or mismatched assets', () => {
    const ctx=context(), assets=fullAssets(); delete assets.echo;
    expect(drawRunnerLanternway(ctx as unknown as CanvasRenderingContext2D,frame,assets)).toBe(false);
    expect(ctx.clearRect).not.toHaveBeenCalled();
    const invalid=fullAssets(); invalid.props={naturalWidth:1,naturalHeight:1} as HTMLImageElement;
    expect(drawRunnerLanternway(ctx as unknown as CanvasRenderingContext2D,frame,invalid)).toBe(false);
  });
  it('draws full art inside exact obstacle and player collision bounds without randomness', () => {
    const ctx=context(), assets=fullAssets(), random=vi.spyOn(Math,'random'); const original=structuredClone(frame);
    expect(drawRunnerLanternway(ctx as unknown as CanvasRenderingContext2D,frame,assets)).toBe(true);
    expect(ctx.drawImage).toHaveBeenCalledWith(assets.props,...ATLAS.props.sprites.waystone,500,333,44,72);
    expect(ctx.fillRect).toHaveBeenCalledWith(500,333,44,72);
    expect(ctx.drawImage).toHaveBeenCalledWith(assets.adventurer,6,0,51,96,175,363,34,42);
    expect(random).not.toHaveBeenCalled(); expect(frame).toEqual(original); expect(ctx.save).toHaveBeenCalledOnce(); expect(ctx.restore).toHaveBeenCalledOnce();
  });
  it('shows the existing dash collision offset and freezes optional motion in reduced mode', () => {
    const assets=fullAssets(),ctx=context(); const input={...frame,dashTimer:500,shieldPulse:1,elapsedMs:3130};
    expect(drawRunnerLanternway(ctx as unknown as CanvasRenderingContext2D,input,assets,true)).toBe(true);
    expect(ctx.drawImage).toHaveBeenCalledWith(assets.adventurer,70,0,51,96,200,363,34,42);
    expect(ctx.drawImage.mock.calls.filter(c=>c[0]===assets.adventurer)).toHaveLength(1);
    expect(ctx.ellipse).toHaveBeenCalledWith(217,384,20,25,0,0,Math.PI*2);
    expect(ctx.drawImage.mock.calls.find(c=>c[0]===assets.ground)?.[1]).toBeCloseTo(0);
  });
  it('uses every distinct power-up source and skips collected items', () => {
    const assets=fullAssets(),ctx=context(); const types=['shield','magnet','doubleShards','slowMo','dash','dreamSurge'] as const;
    drawRunnerLanternway(ctx as unknown as CanvasRenderingContext2D,{...frame,shards:[{x:10,y:10,collected:true}],powerups:types.map((type,index)=>({type,x:100+index*60,y:300}))},assets);
    types.forEach((type,index)=>expect(ctx.drawImage).toHaveBeenCalledWith(assets.props,...ATLAS.props.sprites[type],85+index*60,283,30,34));
    expect(ctx.drawImage.mock.calls.some(c=>c[0]===assets.props && c[1]===ATLAS.props.sprites.shard[0])).toBe(false);
  });
  it('uses real accumulated world travel for decorative floor movement', () => {
    const assets=fullAssets(),ctx=context();
    drawRunnerLanternway(ctx as unknown as CanvasRenderingContext2D,{...frame,distanceMeters:75},assets);
    expect(ctx.drawImage.mock.calls.find(c=>c[0]===assets.ground)?.[1]).toBe(-75);
  });
  it('restores context state and requests fallback if drawing fails', () => {
    const ctx=context();ctx.drawImage.mockImplementation(()=>{throw Error('decode unavailable');});
    expect(drawRunnerLanternway(ctx as unknown as CanvasRenderingContext2D,frame,fullAssets())).toBe(false);expect(ctx.restore).toHaveBeenCalledOnce();
  });
  it('does not draw on invalid geometry and keeps all source crops inside the atlas', () => {
    const ctx=context(); expect(drawRunnerLanternway(ctx as unknown as CanvasRenderingContext2D,{...frame,width:NaN},fullAssets())).toBe(false);
    for(const [x,y,w,h] of Object.values(ATLAS.props.sprites)){expect(x).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(0);expect(x+w).toBeLessThanOrEqual(ATLAS.props.width);expect(y+h).toBeLessThanOrEqual(ATLAS.props.height);}
  });
});
