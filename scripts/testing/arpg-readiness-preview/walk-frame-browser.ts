import type { Page, TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { test, expect, open, town, screen } from './guard';
import { WALK_MODE, WALK_POSE, WALK_LIMITS, walkViewport, walkScreenshot } from './walk-frame-contract.mjs';
import { verifyWalkCapturedPNG } from './walk-frame-capture-contract.mjs';
import type { WalkFrameController } from './walk-frame-observer';

export async function runWalkFrameVisual(page:Page,info:TestInfo,index:number){
  test.setTimeout(WALK_LIMITS.caseMs);await page.setViewportSize(walkViewport(index));
  await page.addInitScript(()=>{window.__arpgPlazaFlow=true;window.__arpgCourtyardFlow=false;window.__arpgCourtyardVisualFlow=false;window.__arpgReturnFlow=false;window.__arpgWalkFrameFlow=true;});
  const startedAt=Date.now(),driver={kind:'controlled-walking-frame-driver',evidenceMode:WALK_MODE,nativeMovementEvidence:false,controlledFrameAssignment:true,index,completed:false,elapsedMs:0,
    controller:null as ReturnType<WalkFrameController['snapshot']>|null,capture:null as {metadata:ReturnType<WalkFrameController['take']>['metadata'];pngSHA256:string;raster:ReturnType<typeof verifyWalkCapturedPNG>|null}|null};
  try{
    await open(page);await town(page);await screen(page).locator('canvas').scrollIntoViewIfNeeded();
    await page.evaluate((id:string)=>window.__arpgWalkFrame!.assign(id),WALK_POSE.id);
    await expect.poll(async()=>page.evaluate(()=>{const s=window.__arpgWalkFrame!.snapshot();if(s.errors.length)throw Error(s.errors.join('; '));return !s.pending&&s.receipt?.settled!==null;}),{timeout:15000}).toBe(true);
    const label=walkScreenshot(index),request=await page.evaluate((label:string)=>window.__arpgWalkFrame!.request(label),label);
    await expect.poll(async()=>page.evaluate(()=>{const s=window.__arpgWalkFrame!.snapshot();if(s.errors.length)throw Error(s.errors.join('; '));return s.captured;}),{timeout:15000}).toBe(true);
    const capture=await page.evaluate((id:number)=>window.__arpgWalkFrame!.take(id),request.id),png=Buffer.from(capture.base64,'base64');
    driver.capture={metadata:capture.metadata,pngSHA256:createHash('sha256').update(png).digest('hex'),raster:null};
    await info.attach(label,{body:png,contentType:'image/png'});
    driver.capture.raster=verifyWalkCapturedPNG(capture.metadata,capture.base64,index);
    driver.controller=await page.evaluate(()=>window.__arpgWalkFrame!.snapshot());
    expect(driver.controller.errors).toEqual([]);expect(driver.controller.complete).toBe(true);driver.completed=true;
  }finally{driver.elapsedMs=Date.now()-startedAt;await info.attach('courtyard-controlled-walking-frame-driver',{body:JSON.stringify(driver),contentType:'application/json'});}
}
