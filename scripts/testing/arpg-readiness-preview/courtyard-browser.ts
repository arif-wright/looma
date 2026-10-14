import { createHash } from 'node:crypto';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect, open, town, gameplay, screen, snapshot, clickControl } from './guard';
import { release, releasedFrame, position, walkInto, dashInto } from './plaza-browser';
import { moveCourtyard } from './courtyard-navigation';
import { setupWestInner } from './courtyard-setup';
import { departCourtyard } from './courtyard-departure';
import { COURTYARD_ACTIONS, COURTYARD_LIMITS, courtyardChordAllowed, courtyardScreenshot } from './courtyard-contract.mjs';
import { courtyardGraphicsIssues } from './courtyard-graphics.mjs';
import { plazaGeometryIssues, plazaObjectsIssues } from './plaza-contract.mjs';

export async function runCourtyard(page: Page, info: TestInfo, index: number) {
  test.setTimeout(COURTYARD_LIMITS.caseMs);
  if(index===1)await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{window.__arpgReturnFlow=true;window.__arpgPlazaFlow=true;window.__arpgCourtyardFlow=true;});
  const receipt={kind:'native-courtyard-driver',index,legs:0,pulses:0,completed:false,completedActions:[] as string[],setups:[] as Array<{label:string}&Awaited<ReturnType<typeof setupWestInner>>>,captures:[] as Array<{label:string;probeId:number;nativeFrame:number;pngSHA256:string}>};
  const guardedMove=async(x:number,y:number)=>{
    if(++receipt.legs>COURTYARD_LIMITS.legs)throw Error('Courtyard waypoint budget exceeded');
    await moveCourtyard(page,x,y,(_position,pulse)=>{
      if(++receipt.pulses>COURTYARD_LIMITS.pulses)throw Error('Courtyard native pulse budget exceeded');
      if(!courtyardChordAllowed(pulse))throw Error('Original native chord refused by additional courtyard solids');
    });
  };
  const guardedSetup=async(label:string)=>{
    if(++receipt.legs>COURTYARD_LIMITS.legs)throw Error('Courtyard waypoint budget exceeded');
    const setup=await setupWestInner(page,()=>{
      if(++receipt.pulses>COURTYARD_LIMITS.pulses)throw Error('Courtyard native pulse budget exceeded');
    });
    receipt.setups.push({label,...setup});
  };
  const save=async(label:string,view?:string)=>{
    await expect.poll(async()=> (await position(page)).dash?.timer).toBe(0);
    await releasedFrame(page);
    const screenshotLabel=view?courtyardScreenshot(index,view):null;
    const request=await page.evaluate((label:string|null)=>window.__arpgCourtyardCapture.request(label),screenshotLabel);
    await expect.poll(async()=>{const g=await gameplay(page);return g.plazaProbe?.id===request.id&&g.plazaProbe.requestedAt===request.requestedAt&&g.plazaProbe.respondedAt===g.at&&g.at>=request.requestedAt;},{timeout:5000,intervals:[20,40,80]}).toBe(true);
    const current=await gameplay(page);
    expect(current.intent).toEqual({x:0,y:0});
    if(current.area===0){
      expect(courtyardGraphicsIssues(current)).toEqual([]);
      expect(plazaObjectsIssues(current)).toEqual([]);
      expect(plazaGeometryIssues(current,label.startsWith('gate-'))).toEqual([]);
      expect(current.courtyardVisibility?.valid).toBe(true);
      expect(current.courtyardVisibility?.issues).toEqual([]);
      expect(current.courtyardVisibility?.samples).toBeGreaterThanOrEqual(20);
      expect(current.courtyardVisibility!.readable).toBeGreaterThanOrEqual(current.courtyardVisibility!.samples/2);
      expect(current.courtyardVisibility!.meanTransmission).toBeGreaterThanOrEqual(.4);
    }
    await page.evaluate(({label,screenshotLabel}:{label:string;screenshotLabel:string|null})=>{
      window.__arpgFixture.record(label);
      if(screenshotLabel)window.__arpgFixture.recordVisual(screenshotLabel);
    },{label,screenshotLabel});
    if(screenshotLabel){
      const capture=await page.evaluate((id:number)=>window.__arpgCourtyardCapture.take(id),request.id);
      expect(capture.metadata.gameplay).toEqual(current);
      const png=Buffer.from(capture.base64,'base64');
      receipt.captures.push({label:screenshotLabel,probeId:capture.metadata.probeId,nativeFrame:capture.metadata.nativeFrame,pngSHA256:createHash('sha256').update(png).digest('hex')});
      await info.attach(screenshotLabel,{body:png,contentType:'image/png'});
    }
  };
  try{
    await open(page);await town(page);await screen(page).locator('canvas').scrollIntoViewIfNeeded();
    for(const action of COURTYARD_ACTIONS){
      if(action.kind==='move')for(const[x,y]of action.points)await guardedMove(x,y);
      else if(action.kind==='setup'){
        for(const[x,y]of action.points??[])await guardedMove(x,y);
        await guardedSetup(action.label);
      }
      else if(action.kind==='walk')await walkInto(page,action.key);
      else if(action.kind==='dash')await dashInto(page,[action.key]);
      else if(action.kind==='depart'){
        await departCourtyard(page, async remaining => {
          await expect(screen(page).locator('.game-status')).toHaveText('Expedition in progress. Return to town to save your result.', { timeout: remaining() });
          await expect.poll(async () => {
            remaining();
            const scene = (await snapshot(page)).scenes.find(scene => scene.pageId === 1 && !scene.destroyed);
            remaining();
            return scene?.gameplay?.area === 1 && scene.gameplay.expeditionActive;
          }, { timeout: remaining() }).toBe(true);
        });
      }else if(action.kind==='return'){
        await page.waitForTimeout(1100);
        await clickControl(page,'secondary',index===1?'Retreat':'Return to town');
        await expect(screen(page).locator('.game-status')).toHaveText('Result saved. Town is untimed; depart again whenever you’re ready.');
        await expect.poll(async()=> (await snapshot(page)).rewardMutations.length).toBe(2);
        await expect.poll(()=>gameplay(page)).toMatchObject({area:0,expeditionActive:false,returned:true,outcome:'retreated'});
      }
      await save(action.label,action.view);
      receipt.completedActions.push(action.label);
    }
    receipt.completed=true;
  }finally{
    await release(page);
    const captures=await page.evaluate(()=>window.__arpgCourtyardCapture?.snapshot()??null);
    await info.attach('courtyard-native-captures',{body:JSON.stringify(captures),contentType:'application/json'});
    await info.attach('courtyard-native-driver',{body:JSON.stringify(receipt),contentType:'application/json'});
  }
}
