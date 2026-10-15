import { waypointStep, chordEndpointAllowed, NAVIGATION_PHASES } from './plaza-navigation.mjs';
import type { Page, TestInfo } from '@playwright/test';
import { expect, gameplay } from './guard';

// All movement is native keyboard input. The observer only reads post-render
// state. No teleport, scene callback, collision helper, clock or input setter.
async function release(page: Page) { for (const key of ['w','a','s','d','Space']) await page.keyboard.up(key); }
async function position(page: Page) {
  return page.evaluate(() => { const g=window.__arpgFixture.plazaLatestMotion; if(!g)throw new Error('Missing native post-render motion'); return g; });
}
async function releasedFrame(page: Page) {
  // One read-only browser request, rather than three traced round trips. The
  // promise resolves only from a new real POST_RENDER observation after entry.
  // RAF/timers are native and never replaced or advanced by this fixture.
  return page.evaluate(() => new Promise<NonNullable<typeof window.__arpgFixture.plazaLatestMotion>>((resolve,reject)=>{
    const requestedAt=performance.now();let frame=0;
    const timer=setTimeout(()=>{cancelAnimationFrame(frame);reject(new Error('No fresh neutral native frame within 3000 ms'));},3000);
    const read=()=>{
      const p=window.__arpgFixture.plazaLatestMotion;
      if(p&&p.at>requestedAt&&p.intent.x===0&&p.intent.y===0){clearTimeout(timer);resolve(p);return;}
      frame=requestAnimationFrame(read);
    };
    frame=requestAnimationFrame(read);
  }));
}
async function freshGameplay(page: Page) {
  const request=await page.evaluate(()=>window.__arpgFixture.requestPlazaProbe());
  await expect.poll(async()=>{
    const g=await gameplay(page);return g.plazaProbe?.id===request.id&&g.plazaProbe.requestedAt===request.requestedAt&&g.plazaProbe.respondedAt===g.at&&g.at>=request.requestedAt;
  },{timeout:5000,intervals:[20,40,80]}).toBe(true);
  return gameplay(page);
}
async function move(page: Page, x: number, y: number) {
  const startedAt=Date.now();let missedPulses=0;
  const history: {key:string;delay:number;before:{x:number;y:number};after:{x:number;y:number}}[]=[];
  try {
    let p=await releasedFrame(page);
    for(;;){
      const pulse=waypointStep(p,x,y,Date.now()-startedAt,missedPulses,history);
      if(!pulse)return; // Final neutral position is checked even at the deadline.
      await page.keyboard.press(pulse.key,{delay:pulse.delay});
      const next=await releasedFrame(page);
      if(!chordEndpointAllowed(next,pulse))throw new Error(`Native chord exceeded its independently safe envelope: ${JSON.stringify(next)}`);
      history.push({key:pulse.key,delay:pulse.delay,before:{x:p.x,y:p.y},after:{x:next.x,y:next.y}});
      if(history.length>2)history.shift();
      missedPulses=next.x===p.x&&next.y===p.y?missedPulses+1:0;
      p=next;
    }
  } catch(error) { await release(page);throw error; }
  // keyboard.press has already released its key and releasedFrame confirmed
  // neutral intent. Five redundant key-up calls per successful leg add no
  // coverage; exceptional paths and the outer case retain exhaustive cleanup.

}
async function route(page: Page, points: number[][]) { for(const [x,y] of points)await move(page,x!,y!); }
async function walkInto(page: Page, key: string) {
  await page.keyboard.down(key);
  try { await page.waitForTimeout(700); } finally { await page.keyboard.up(key); }
}
async function dashInto(page: Page, keys: string[]) {
  await expect.poll(async()=> (await position(page)).dash?.cd).toBe(0);
  for(const key of keys)await page.keyboard.down(key);
  try { await page.keyboard.press('Space',{delay:40});await page.waitForTimeout(220); }
  finally { await release(page); }
}
// Diagnostic-only prefix of the published desktop workload. Native move,
// release, walk, dash and feedback code above is byte-identical to plaza-browser.
// We intentionally do not apply prompt visibility acceptance to the bypass arm.
// Original acceptance files, geometry assertions and 14 cases are untouched.
async function diagnosticCheckpoint(page: Page, info: TestInfo, run: number, label: string, view?: string) {
  await page.evaluate(() => window.__arpgPromptTiming.setStage('checkpoint'));
  await releasedFrame(page);
  await freshGameplay(page);
  await page.evaluate(label => window.__arpgFixture.record(label), label);
  if(view) await info.attach(`timing-${run}-${view}`, {body:await page.screenshot({fullPage:false}),contentType:'image/png'});
  await page.evaluate(() => window.__arpgPromptTiming.setStage('motion'));
}
export async function runTimingPrefix(page: Page, info: TestInfo, run: number) {
  const save=(label:string,view?:string)=>diagnosticCheckpoint(page,info,run,label,view);
  try {
    await save('plaza-home');
    await route(page,NAVIGATION_PHASES.rearFront);await save('rear-front-ready','rear-front');
    await walkInto(page,'w');await save('rear-front-walk-blocked');
    await dashInto(page,['w']);await save('rear-front-dash-blocked');
    await route(page,NAVIGATION_PHASES.rearSide);await save('rear-side-ready');
    await dashInto(page,['d']);await save('rear-side-dash-blocked');
    await route(page,NAVIGATION_PHASES.rearBack);await save('rear-back-cutaway','rear-back-cutaway');
    await route(page,NAVIGATION_PHASES.perimeter);await save('perimeter-ready');
    await walkInto(page,'w');await save('perimeter-wall-blocked','perimeter-edge-feet');
    await route(page,NAVIGATION_PHASES.perimeterReturn);
    await route(page,NAVIGATION_PHASES.rearRestore);await save('rear-front-restored');
    await route(page,NAVIGATION_PHASES.endcapFront);await save('endcap-front-ready');
  } finally { await release(page); }
}
