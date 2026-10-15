import type {Page,TestInfo} from '@playwright/test';
import {WAYPOINT_DEADLINE_MS} from './plaza-navigation.mjs';
import {endcapRecoveryPlan,endcapStagingChord,verifyEndcapStagingFrames,verifyEndcapReturnLane} from './endcap-staging.mjs';
type Motion=NonNullable<typeof window.__arpgFixture.plazaLatestMotion>;
type History={key:string;delay:number;before:{x:number;y:number};after:{x:number;y:number}};
export async function recoverEndcapSide(page:Page,info:TestInfo,error:unknown,p:Motion,x:number,y:number,history:History[],elapsed:()=>number,releasedFrame:()=>Promise<Motion>){
 const plan=endcapRecoveryPlan(error,p,x,y,elapsed(),history);
 if(!plan)throw error;
 const record:{[key:string]:unknown}={status:'started',originalRefusal:String((error as Error).message),originalTarget:[x,y],initial:p,originalHistory:structuredClone(history),plan,elapsedBefore:elapsed(),actions:[]};
 const actions:History[]=[];let current=p,failed:unknown;
 const remaining=()=>{if(elapsed()>=WAYPOINT_DEADLINE_MS)throw new Error(`Endcap staging exhausted original ${WAYPOINT_DEADLINE_MS}ms waypoint deadline`);};
 try{
  for(let index=0;index<2;index++){
   remaining();
   const pulse=index===0?plan.north:endcapStagingChord(current,plan),before=current;
   const action:{[key:string]:unknown}={pulse,before,elapsedBefore:elapsed()};(record.actions as unknown[]).push(action);
   remaining();await page.keyboard.press(pulse.key,{delay:pulse.delay});
   current=await releasedFrame();remaining();action.after=current;
   const slice=await page.evaluate(({start,end})=>{
    const f=window.__arpgFixture;
    if(f.plazaMotionOverflow)throw new Error('Endcap staging motion overflow');
    return f.plazaMotion.filter(frame=>frame.at>start&&frame.at<=end);
   },{start:before.at,end:current.at});
   remaining();const frames=[before,...slice];action.frames=frames;
   action.validation=verifyEndcapStagingFrames(frames,before,current,plan,pulse);action.elapsedAfter=elapsed();
   actions.push({key:pulse.key,delay:pulse.delay,before:{x:before.x,y:before.y},after:{x:current.x,y:current.y}});
  }
  record.returnLane=verifyEndcapReturnLane(current,plan);
  record.status='staged-original-arrival-still-required';record.elapsedAfter=elapsed();
  return {position:current,history:actions};
 }catch(failure){failed=failure;record.status='failed';record.failure=String(failure);throw failure;}
 finally{
  try{await info.attach('endcap-side-native-staging',{body:Buffer.from(JSON.stringify(record)),contentType:'application/json'});}
  catch(attachmentError){if(failed)throw new AggregateError([failed,attachmentError],'Endcap staging and diagnostic attachment failed');throw attachmentError;}
 }
}
