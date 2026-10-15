import { performance as hostClock } from 'node:perf_hooks';
import { test,expect,snapshot,town,screen } from './guard';
import { runTimingPrefix } from './prompt-timing-driver';
import { RUNS,WARMUP_FRAMES,NEUTRAL_WINDOW_MS,MAX_INPUT_CALLS,PREFIX_TIMEOUT_MS,DIAGNOSTIC_KIND,isNavigationGuardRejection } from './prompt-timing-plan.mjs';

type InputCall={sequence:number;method:string;key:string;requestedDelay:number|null;hostStart:number;hostEnd:number|null;error:string|null};

test('ARPG prompt timing: diagnostic only, never acceptance',async({page,browser},info)=>{
  await page.addInitScript(()=>{window.__arpgPlazaFlow=true;});
  const results:unknown[]=[];
  for(const run of RUNS){
    // A fresh real page/scene establishes the same home transform and neutral
    // keyboard state. No teleport, renderer/camera edit or game clock override.
    await page.goto(`/preview#promptMode=${run.mode}&promptRun=${run.id}`);
    // Subsequent targets differ only in fragment, which is same-document
    // navigation. Explicit reload is essential to rerun init scripts/modules
    // and create a fresh scene with this run's mode after prior real cleanup.
    if(run.id>1)await page.reload();
    await expect.poll(async()=>(await snapshot(page)).ready).toBe(true);
    await town(page);await screen(page).locator('canvas').scrollIntoViewIfNeeded();
    await expect.poll(()=>page.evaluate(()=>window.__arpgPromptTiming.frameCount),{timeout:30_000,intervals:[100,200]}).toBeGreaterThanOrEqual(WARMUP_FRAMES);
    const initial=await page.evaluate(()=>({game:window.__arpgFixture.plazaLatestMotion,timing:window.__arpgPromptTiming.snapshot()}));
    expect(initial.timing).toMatchObject({mode:run.mode,runId:run.id,counterfactual:run.mode==='bypass',counts:{activeScenes:1,maxActiveScenes:1}});
    expect(initial.game).toMatchObject({area:0,x:1472,y:536,intent:{x:0,y:0}});
    // Clock samples give an offset interval, not fabricated one-way latency.
    const sync=async()=>{const hostBefore=hostClock.now();const browserNow=await page.evaluate(()=>performance.now());return{hostBefore,browserNow,hostAfter:hostClock.now()};};
    const beforeSync=await sync();
    const readFreshGeometry=async()=>{
      const request=await page.evaluate(()=>window.__arpgFixture.requestPlazaProbe());
      await expect.poll(()=>page.evaluate(id=>window.__arpgFixture.scenes.find(scene=>!scene.destroyed)?.gameplay?.plazaProbe?.id===id,request.id),{timeout:5000,intervals:[20,40,80]}).toBe(true);
      return page.evaluate(()=>{const g=window.__arpgFixture.scenes.find(scene=>!scene.destroyed)!.gameplay!,v=g.viewportGeometry;if(!v)throw new Error('Missing neutral viewport geometry');return{x:g.x,y:g.y,intent:g.intent,viewport:{canvas:v.canvas,camera:v.camera,hud:v.hud,controls:v.controls,entranceLabel:v.entranceLabel,entrancePrompt:v.entrancePrompt}};});
    };
    await page.evaluate(()=>window.__arpgPromptTiming.setStage('checkpoint'));
    const neutralBefore=await readFreshGeometry();
    expect(neutralBefore).toMatchObject({x:1472,y:536,intent:{x:0,y:0},viewport:{entrancePrompt:{visible:true}}});
    const neutralStart=await page.evaluate(()=>window.__arpgPromptTiming.setStage('neutral'));
    await page.waitForTimeout(NEUTRAL_WINDOW_MS);
    const neutralEnd=await page.evaluate(()=>window.__arpgPromptTiming.setStage('checkpoint'));
    const neutralAfter=await readFreshGeometry();
    expect(neutralAfter).toEqual(neutralBefore);
    const neutral={startAt:neutralStart,endAt:neutralEnd,before:neutralBefore,after:neutralAfter};
    const inputCalls:InputCall[]=[];let droppedInputCalls=0;
    const keyboard=page.keyboard, originals={down:keyboard.down.bind(keyboard),up:keyboard.up.bind(keyboard),press:keyboard.press.bind(keyboard)};
    const timed=async(method:string,key:string,requestedDelay:number|null,call:()=>Promise<void>)=>{
      const entry:InputCall={sequence:inputCalls.length+droppedInputCalls,method,key,requestedDelay,hostStart:hostClock.now(),hostEnd:null,error:null};
      if(inputCalls.length<MAX_INPUT_CALLS)inputCalls.push(entry);else droppedInputCalls++;
      try{return await call();}catch(error){entry.error=String(error);throw error;}finally{entry.hostEnd=hostClock.now();}
    };
    keyboard.down=async key=>timed('down',key,null,()=>originals.down(key));
    keyboard.up=async key=>timed('up',key,null,()=>originals.up(key));
    keyboard.press=async(key,options)=>timed('press',key,options?.delay??null,()=>originals.press(key,options));
    let outcome='completed',failure:string|null=null;
    try{
      await page.evaluate(()=>window.__arpgPromptTiming.setStage('motion'));
      await test.step(`diagnostic prefix ${run.id} ${run.mode}`,()=>runTimingPrefix(page,info,run.id),{timeout:PREFIX_TIMEOUT_MS});
    }catch(error){
      failure=error instanceof Error?error.message:String(error);
      outcome=isNavigationGuardRejection(failure)?'navigation_guard_rejected':'unexpected_error';
    }finally{
      keyboard.down=originals.down;keyboard.up=originals.up;keyboard.press=originals.press;
      await page.evaluate(()=>window.__arpgPromptTiming.setStage('done'));
    }
    const afterSync=await sync();
    const timing=await page.evaluate(()=>window.__arpgPromptTiming.snapshot());
    const state=await snapshot(page);
    await page.evaluate(()=>window.__arpgFixture.unmountAll());
    await expect.poll(async()=>(await snapshot(page)).scenes.every(scene=>scene.destroyed)).toBe(true);
    const cleanup={state:await snapshot(page),timing:await page.evaluate(()=>window.__arpgPromptTiming.snapshot())};
    const result={kind:DIAGNOSTIC_KIND,acceptance:false,browserVersion:browser.version(),run,outcome,failure,
      warning:'Bypass omits prompt calculation and changes label visibility/render work; total frame differences do not isolate callback compute.',
      clockSync:{before:beforeSync,after:afterSync},neutral,inputCalls,droppedInputCalls,timing,state,cleanup};
    results.push(result);
    await info.attach(`prompt-timing-run-${run.id}-${run.mode}-${run.role}`,{body:JSON.stringify(result),contentType:'application/json'});
    expect(droppedInputCalls,'Input timing buffer must not overflow').toBe(0);
    expect(state.blocked).toEqual([]);expect(state.rewardMutations).toEqual([]);
    expect(state.api.filter(call=>call.path==='/api/games/session/start')).toHaveLength(0);
    expect(outcome,'Unexpected errors invalidate the diagnostic').not.toBe('unexpected_error');
    // Every block already unmounted normally above; the unchanged guard also
    // validates final cleanup and network/service isolation.
  }
  await info.attach('prompt-timing-comparison',{body:JSON.stringify({kind:DIAGNOSTIC_KIND,acceptance:false,ordering:RUNS,results}),contentType:'application/json'});
});
