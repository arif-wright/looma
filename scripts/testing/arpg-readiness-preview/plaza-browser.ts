import { waypointKeys, NAVIGATION_PHASES } from './plaza-navigation.mjs';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect, open, town, gameplay, expedition, screen, snapshot, clickControl } from './guard';
import { plazaGeometryIssues, plazaObjectsIssues } from './plaza-contract.mjs';
import { plazaScreenshot } from './screenshots.mjs';

// All movement is native keyboard input. The observer only reads post-render
// state. No teleport, scene callback, collision helper, clock or input setter.
async function release(page: Page) { for (const key of ['w','a','s','d','Space']) await page.keyboard.up(key); }
async function position(page: Page) {
  return page.evaluate(() => { const g=window.__arpgFixture.scenes.find(s=>!s.destroyed)?.gameplay; if(!g)throw new Error('Missing real gameplay'); return {x:g.x,y:g.y,at:g.at}; });
}
async function move(page: Page, x: number, y: number) {
  const deadline=Date.now()+6500, held=new Set<string>();
  try {
    while(Date.now()<deadline){
      const p=await position(page), wanted=new Set<string>(waypointKeys(p,x,y));
      if(wanted.size===0)return;
      for(const k of held)if(!wanted.has(k)){await page.keyboard.up(k);held.delete(k);}
      for(const k of wanted)if(!held.has(k)){await page.keyboard.down(k);held.add(k);}
      await page.waitForTimeout(16);
    }
    throw new Error(`Native route stalled before ${x},${y}: ${JSON.stringify(await position(page))}`);
  } finally { for(const k of held)await page.keyboard.up(k); }
}
async function route(page: Page, points: number[][]) { for(const [x,y] of points)await move(page,x!,y!); }
async function walkInto(page: Page, key: string) {
  await page.keyboard.down(key);
  try { await page.waitForTimeout(700); } finally { await page.keyboard.up(key); }
}
async function dashInto(page: Page, keys: string[]) {
  await expect.poll(async()=> (await gameplay(page)).dash?.cd).toBe(0);
  for(const key of keys)await page.keyboard.down(key);
  try { await page.keyboard.press('Space',{delay:40});await page.waitForTimeout(220); }
  finally { await release(page); }
}
async function checkpoint(page: Page, info: TestInfo, index: number, label: string, view?: string) {
  await expect.poll(async()=>plazaObjectsIssues(await gameplay(page))).toEqual([]);
  await expect.poll(async()=>plazaGeometryIssues(await gameplay(page),label.startsWith('gate-'))).toEqual([]);
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
    await expect.poll(async()=> (await gameplay(page)).plaza.find(o=>o.name==='town-plaza-rear-upper')?.alpha).toBe(.28);
    await save('rear-back-cutaway','rear-back-cutaway');
    await route(page,NAVIGATION_PHASES.rearRestore);await save('rear-front-restored');
    await route(page,NAVIGATION_PHASES.endcapFront);
    await save('endcap-front-ready');await walkInto(page,'w');await save('endcap-front-walk-blocked');
    await route(page,NAVIGATION_PHASES.endcapSide);await save('endcap-side-ready');
    await dashInto(page,['d','s']);await save('endcap-side-dash-blocked');
    await route(page,NAVIGATION_PHASES.endcapRoof);
    await expect.poll(async()=> (await gameplay(page)).plaza.find(o=>o.name==='town-plaza-endcap-upper')?.alpha).toBe(.28);
    await save('endcap-roof-cutaway','endcap-side-cutaway');
    await route(page,NAVIGATION_PHASES.endcapRestore);await save('endcap-front-restored');
    await route(page,NAVIGATION_PHASES.gateEast);await save('gate-east-approach','gate-east-approach');
    await route(page,NAVIGATION_PHASES.gateSouth);await save('gate-south-approach');
    await move(page,1728,664);await save('gate-arrived');
    await page.keyboard.press('e');await expedition(page);
    await page.evaluate(()=>window.__arpgFixture.record('plaza-departed'));
    await page.waitForTimeout(1100);
    await clickControl(page,'secondary',index===13?'Retreat':'Return to town');
    await expect(screen(page).locator('.game-status')).toHaveText('Result saved. Town is untimed; depart again whenever you’re ready.');
    await expect.poll(async()=> (await snapshot(page)).rewardMutations.length).toBe(2);
    await expect.poll(()=>gameplay(page)).toMatchObject({area:0,expeditionActive:false,returned:true,outcome:'retreated'});
    await save('plaza-returned-owned','returned-owned');
  } finally { await release(page); }
}
