import type { Page } from '@playwright/test';
import type { PlazaMotion } from './runtime';
import { release, releasedFrame } from './plaza-browser';
import { perimeterSetupStep, perimeterTraceIssues } from './perimeter-contract.mjs';

// Bounded native-input setup. One clock starts before any reads; it never
// resets. The same released-frame primitive, pulse sizing and cleanup apply.
export async function setupPerimeter(page: Page) {
  const startedAt=Date.now();let missedPulses=0;
  try {
    const first=await releasedFrame(page);
    let p=first,identity:{start:number;sceneId:number}|undefined;
    for(;;){
      const observed=await page.evaluate(({first,last}:{first:PlazaMotion;last:PlazaMotion})=>{
        const fixture=window.__arpgFixture,trace=fixture.plazaMotion;
        const matches=(a:PlazaMotion,b:PlazaMotion)=>JSON.stringify(a)===JSON.stringify(b);
        const start=trace.findIndex(t=>matches(t,first)),end=trace.findIndex(t=>matches(t,last));
        const scenes=fixture.scenes.filter(s=>!s.destroyed);
        if(fixture.plazaMotionOverflow||start<0||end<start||scenes.length!==1||scenes[0]!.pageId!==1)throw Error('Missing, overflowed or reset perimeter setup trace / scene');
        return {start,sceneId:scenes[0]!.id,motion:trace.slice(start,end+1)};
      },{first,last:p});
      if(identity&&(observed.start!==identity.start||observed.sceneId!==identity.sceneId))throw Error('Perimeter setup trace or scene identity changed');
      identity=observed;
      const issues=perimeterTraceIssues(observed.motion,{setup:true});
      if(issues.length)throw Error(issues.join('; '));
      const pulse=perimeterSetupStep(p,Date.now()-startedAt,missedPulses);
      if(!pulse)return;
      await page.keyboard.press(pulse.key,{delay:pulse.delay});
      const next=await releasedFrame(page);
      missedPulses=next.x===p.x&&next.y===p.y?missedPulses+1:0;p=next;
    }
  }catch(error){await release(page);throw error;}
}
