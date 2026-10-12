import type { Page } from '@playwright/test';
import { waypointStep, chordEndpointAllowed } from './plaza-navigation.mjs';
import { release, releasedFrame } from './plaza-browser';

// Dedicated native wall extension. The original acceptance/timing move remains
// literal-identical. Offline tests prove this copy differs only by its name,
// required callback parameter and one reject-only check before native key input.
export async function moveCourtyard(page: Page, x: number, y: number, guard: (position: { x: number; y: number }, pulse: ReturnType<typeof waypointStep>) => void) {
  const startedAt=Date.now();let missedPulses=0;
  const history: {key:string;delay:number;before:{x:number;y:number};after:{x:number;y:number}}[]=[];
  try {
    let p=await releasedFrame(page);
    for(;;){
      const pulse=waypointStep(p,x,y,Date.now()-startedAt,missedPulses,history);
      if(!pulse)return; // Final neutral position is checked even at the deadline.
      guard(p,pulse); // Additive courtyard checks may only reject this original pulse.
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
