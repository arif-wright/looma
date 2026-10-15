import type { Page } from '@playwright/test';
import type { PlazaMotion } from './runtime';
import { release, releasedFrame } from './plaza-browser';
import { eastInnerSetupStep, eastInnerSetupTraceIssues } from './courtyard-east-setup.mjs';

// Read the complete native slice. Do not filter away an excursion or a bad frame.
async function setupTrace(page: Page, first: PlazaMotion, last: PlazaMotion) {
  return page.evaluate(({first,last})=>{
    const fixture=window.__arpgFixture,trace=fixture.plazaMotion;
    const matches=(a:typeof first,b:typeof first)=>JSON.stringify(a)===JSON.stringify(b);
    const start=trace.findIndex(p=>matches(p,first)),end=trace.findIndex(p=>matches(p,last));
    const scenes=fixture.scenes.filter(s=>!s.destroyed);
    if (fixture.plazaMotionOverflow || start<0 || end<start || scenes.length!==1 || scenes[0]!.pageId!==1) throw Error('Missing, overflowed or reset setup trace / scene');
    return {start,sceneId:scenes[0]!.id,motion:trace.slice(start,end+1)};
  },{first,last});
}
export async function setupEastInner(page: Page, guard: (pulse: NonNullable<ReturnType<typeof eastInnerSetupStep>>) => void) {
  const startedAt=Date.now();let missedPulses=0;
  try {
    const first=await releasedFrame(page);
    let p=first,checkedAt=first.at,expectedKey:string|undefined,identity: {start:number;sceneId:number}|undefined;
    for (;;) {
      const observed=await setupTrace(page,first,p);
      if (identity && (observed.start!==identity.start || observed.sceneId!==identity.sceneId)) throw Error('Setup trace or scene identity changed');
      identity=observed;
      const issues=eastInnerSetupTraceIssues(observed.motion);
      if (issues.length) throw Error(issues.join('; '));
      if (expectedKey && observed.motion.some(frame=>frame.at>checkedAt&&frame.intent.y!==0&&frame.intent.y!==(expectedKey==='s'?1:-1))) throw Error('Unexpected native setup direction');
      const pulse=eastInnerSetupStep(p,Date.now()-startedAt,missedPulses);
      if (!pulse) return {sceneId:identity.sceneId,before:first,after:p};
      checkedAt=p.at;expectedKey=pulse.key;
      guard(pulse); // Counts every requested pulse before native input, including failures.
      await page.keyboard.press(pulse.key,{delay:pulse.delay});
      const next=await releasedFrame(page);
      missedPulses=next.x===p.x&&next.y===p.y?missedPulses+1:0;
      p=next;
    }
  } catch (error) { await release(page);throw error; }
}
