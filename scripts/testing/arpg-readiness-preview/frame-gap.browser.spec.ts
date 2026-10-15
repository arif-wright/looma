import {test,expect,snapshot,town,screen} from './guard';
import {RUNS,KIND} from './frame-gap-plan.mjs';
test('ARPG stationary frame gap: diagnostic only, never acceptance',async({page,browser},info)=>{
  await page.addInitScript(()=>{window.__arpgPlazaFlow=true;});const results:unknown[]=[];
  for(const run of RUNS){
    await page.goto(`/preview#frameMode=${run.mode}&frameRun=${run.id}`);
    if(run.id>1)await page.reload(); // Fragment navigation alone cannot reset modules.
    await expect.poll(async()=>(await snapshot(page)).ready).toBe(true);await town(page);await screen(page).locator('canvas').scrollIntoViewIfNeeded();
    expect(await page.evaluate(()=>({mode:window.__arpgFrameGap.mode,runId:window.__arpgFrameGap.runId}))).toEqual({mode:run.mode,runId:run.id});
    const geometry=async()=>{
      const request=await page.evaluate(()=>window.__arpgFixture.requestPlazaProbe());
      await expect.poll(()=>page.evaluate(id=>window.__arpgFixture.scenes.find(s=>!s.destroyed)?.gameplay?.plazaProbe?.id===id,request.id),{timeout:5000,intervals:[20,40,80]}).toBe(true);
      return page.evaluate(()=>{const g=window.__arpgFixture.scenes.find(s=>!s.destroyed)!.gameplay!,v=g.viewportGeometry;if(!v)throw new Error('Fresh geometry required');return{x:g.x,y:g.y,intent:g.intent,area:g.area,viewport:{canvas:v.canvas,camera:v.camera,hud:v.hud,controls:v.controls,entranceLabel:v.entranceLabel,entrancePrompt:v.entrancePrompt}};});
    };
    const before=await geometry();expect(before).toMatchObject({x:1472,y:536,intent:{x:0,y:0},area:0,viewport:{entrancePrompt:{visible:true}}});
    // One pending browser promise. No polling/probes/screenshots/keyboard calls
    // are scheduled inside either native collection window.
    let failure:string|null=null;
    try{await page.evaluate(()=>window.__arpgFrameGap.collect());}catch(error){failure=error instanceof Error?error.message:String(error);}
    const timing=await page.evaluate(()=>window.__arpgFrameGap.snapshot());
    const after=await geometry(),state=await snapshot(page);
    await page.evaluate(()=>window.__arpgFixture.unmountAll());await expect.poll(async()=>(await snapshot(page)).scenes.every(s=>s.destroyed)).toBe(true);
    const cleanup={state:await snapshot(page),timing:await page.evaluate(()=>window.__arpgFrameGap.snapshot())};
    const result={kind:KIND,acceptance:false,run,browserVersion:browser.version(),before,after,timing,state,cleanup,failure};results.push(result);
    await info.attach(`frame-gap-run-${run.id}-${run.mode}-${run.role}`,{body:JSON.stringify(result),contentType:'application/json'});
    expect(failure,'Incomplete stationary collection is not usable evidence').toBeNull();expect(after).toEqual(before);
    expect(timing.complete).toBe(true);expect(timing.context.keyEvents).toBe(0);expect(state.blocked).toEqual([]);expect(state.rewardMutations).toEqual([]);expect(state.api.some(c=>c.path==='/api/games/session/start')).toBe(false);
  }
  await info.attach('frame-gap-comparison',{body:JSON.stringify({kind:KIND,acceptance:false,ordering:RUNS,results}),contentType:'application/json'});
});
