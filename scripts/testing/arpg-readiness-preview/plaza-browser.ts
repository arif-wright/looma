import { waypointStep, NAVIGATION_PHASES } from './plaza-navigation.mjs';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect, open, town, gameplay, expedition, screen, snapshot, clickControl } from './guard';
import { plazaGeometryIssues, plazaObjectsIssues } from './plaza-contract.mjs';
import { plazaScreenshot } from './screenshots.mjs';

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
  try {
    let p=await releasedFrame(page);
    for(;;){
      const pulse=waypointStep(p,x,y,Date.now()-startedAt,missedPulses);
      if(!pulse)return; // Final neutral position is checked even at the deadline.
      await page.keyboard.press(pulse.key,{delay:pulse.delay});
      const next=await releasedFrame(page);
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
async function checkpoint(page: Page, info: TestInfo, index: number, label: string, view?: string) {
  await releasedFrame(page);
  const current=await freshGameplay(page);
  expect(plazaObjectsIssues(current)).toEqual([]);
  expect(plazaGeometryIssues(current,label.startsWith('gate-'))).toEqual([]);
  if(label==='rear-back-cutaway'||label==='endcap-roof-cutaway')expect(current.plaza.find(o=>o.name===`town-plaza-${label.startsWith('rear')?'rear':'endcap'}-upper`)?.alpha).toBe(.28);
  const screenshotLabel=view?plazaScreenshot(index,view):null;
  await page.evaluate(({label,screenshotLabel})=>{
    window.__arpgFixture.record(label);
    if(screenshotLabel)window.__arpgFixture.recordVisual(screenshotLabel);
  },{label,screenshotLabel});
  if(screenshotLabel)await info.attach(screenshotLabel,{body:await page.screenshot({fullPage:false}),contentType:'image/png'});
}
export async function runPlazaExploration(page: Page, info: TestInfo, index: number) {
  test.setTimeout(180_000);
  if(index===13)await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{window.__arpgReturnFlow=true;window.__arpgPlazaFlow=true;});
  await open(page);await town(page);await screen(page).locator('canvas').scrollIntoViewIfNeeded();
  const save=(label:string,view?:string)=>checkpoint(page,info,index,label,view);
  try {
    await save('plaza-home');
    await route(page,NAVIGATION_PHASES.rearFront);await save('rear-front-ready','rear-front');
    await walkInto(page,'w');await save('rear-front-walk-blocked');
    await dashInto(page,['w']);await save('rear-front-dash-blocked');
    await route(page,NAVIGATION_PHASES.rearSide);await save('rear-side-ready');
    await dashInto(page,['d']);await save('rear-side-dash-blocked');
    await route(page,NAVIGATION_PHASES.rearBack);
    await save('rear-back-cutaway','rear-back-cutaway');
    await route(page,NAVIGATION_PHASES.perimeter);await save('perimeter-ready');
    await walkInto(page,'w');await save('perimeter-wall-blocked','perimeter-edge-feet');
    await route(page,NAVIGATION_PHASES.perimeterReturn);
    await route(page,NAVIGATION_PHASES.rearRestore);await save('rear-front-restored');
    await route(page,NAVIGATION_PHASES.endcapFront);
    await save('endcap-front-ready');await walkInto(page,'w');await save('endcap-front-walk-blocked');
    await route(page,NAVIGATION_PHASES.endcapSide);await save('endcap-side-ready');
    await dashInto(page,['d','s']);await save('endcap-side-dash-blocked');
    await route(page,NAVIGATION_PHASES.endcapRoof);
    await save('endcap-roof-cutaway','endcap-side-cutaway');
    await route(page,NAVIGATION_PHASES.endcapRestore);await save('endcap-front-restored');
    await route(page,NAVIGATION_PHASES.gateEast);await save('gate-east-approach','gate-east-approach');
    await route(page,NAVIGATION_PHASES.gateSouth);await save('gate-south-approach');
    await move(page,1728,664);await save('gate-arrived','gate-arrived');
    await page.keyboard.press('e');await expedition(page);
    await freshGameplay(page);
    await page.evaluate(()=>window.__arpgFixture.record('plaza-departed'));
    await page.waitForTimeout(1100);
    await clickControl(page,'secondary',index===13?'Retreat':'Return to town');
    await expect(screen(page).locator('.game-status')).toHaveText('Result saved. Town is untimed; depart again whenever you’re ready.');
    await expect.poll(async()=> (await snapshot(page)).rewardMutations.length).toBe(2);
    await expect.poll(()=>gameplay(page)).toMatchObject({area:0,expeditionActive:false,returned:true,outcome:'retreated'});
    await save('plaza-returned-owned','returned-owned');
  } finally { await release(page); }
}
