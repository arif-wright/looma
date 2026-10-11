import {KIND,PHASES,EARLY_FRAMES,SETTLE_FRAMES,SETTLED_MS,FRAME_CAPACITY} from './frame-gap-plan.mjs';
export const FIELDS=['sequence','phaseId','start','end','engineTime','engineDelta','rawDelta','engineFrame','coolDown','inFocus','hidden',
  'preStart','preEnd','observerStart','observerEnd','preCalls','observerCalls','postCalls','x','y','intentX','intentY','stateValid','hookEnd'];
export class FrameGapMetrics{
  constructor({mode,runId,capacity=FRAME_CAPACITY}){
    if(!['light','detailed'].includes(mode)||!Number.isSafeInteger(runId)||runId<0||!Number.isSafeInteger(capacity)||capacity<1||capacity>FRAME_CAPACITY)throw new Error('Invalid diagnostic options');
    this.mode=mode;this.runId=runId;this.capacity=capacity;this.data=new Float64Array(capacity*FIELDS.length);
    this.count=0;this.total=0;this.overflow=false;this.invalid=0;this.phase=0;this.stable=0;this.phaseStart=-1;this.startedAt=-1;this.finishedAt=-1;this.complete=false;
    this.earlyStart=-1;this.earlyEnd=-1;this.settlingStart=-1;this.settlingEnd=-1;this.settledStart=-1;this.settledEnd=-1;
  }
  // All hot-path writes are scalar; snapshots allocate only after collection.
  record(start,end,engineTime,engineDelta,rawDelta,engineFrame,coolDown,inFocus,hidden,preStart,preEnd,observerStart,observerEnd,preCalls,observerCalls,postCalls,x,y,intentX,intentY,stateValid){
    if(this.complete)return;
    this.total++;
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||!Number.isFinite(engineTime)||!Number.isFinite(engineDelta)||!Number.isFinite(rawDelta)||!Number.isFinite(engineFrame)||!Number.isFinite(coolDown)||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(intentX)||!Number.isFinite(intentY)){this.invalid++;return;}
    if(this.startedAt<0)this.startedAt=start;
    if(this.phaseStart<0){this.phaseStart=start;if(this.phase===0)this.earlyStart=start;else if(this.phase===1)this.settlingStart=start;else this.settledStart=start;}
    if(this.count>=this.capacity){this.overflow=true;return;}
    const o=this.count*FIELDS.length,d=this.data;d[o]=this.total;d[o+1]=this.phase;d[o+2]=start;d[o+3]=end;d[o+4]=engineTime;d[o+5]=engineDelta;d[o+6]=rawDelta;d[o+7]=engineFrame;d[o+8]=coolDown;d[o+9]=inFocus?1:0;d[o+10]=hidden?1:0;
    d[o+11]=preStart;d[o+12]=preEnd;d[o+13]=observerStart;d[o+14]=observerEnd;d[o+15]=preCalls;d[o+16]=observerCalls;d[o+17]=postCalls;d[o+18]=x;d[o+19]=y;d[o+20]=intentX;d[o+21]=intentY;d[o+22]=stateValid?1:0;this.count++;
    if(this.phase===0&&this.count===EARLY_FRAMES){this.earlyEnd=end;this.phase=1;this.phaseStart=-1;}
    else if(this.phase===1){this.stable=coolDown===0&&inFocus&&!hidden?this.stable+1:0;if(this.stable>=SETTLE_FRAMES){this.settlingEnd=end;this.phase=2;this.phaseStart=-1;}}
    else if(this.phase===2&&end-this.phaseStart>=SETTLED_MS){this.settledEnd=end;this.finishedAt=end;this.complete=true;}
    return this.count-1;
  }
  markHookEnd(row,at){if(Number.isInteger(row)&&row>=0&&row<this.count)this.data[row*FIELDS.length+23]=at;}
  snapshot(){
    const frames=Array.from({length:this.count},(_,row)=>{const f=Object.fromEntries(FIELDS.map((key,col)=>[key,this.data[row*FIELDS.length+col]]));f.phase=PHASES[f.phaseId];delete f.phaseId;
      f.inFocus=Boolean(f.inFocus);f.hidden=Boolean(f.hidden);f.stateValid=Boolean(f.stateValid);for(const k of ['preStart','preEnd','observerStart','observerEnd'])if(f[k]<0)f[k]=null;return f;});
    return{kind:KIND,version:1,acceptance:false,mode:this.mode,runId:this.runId,capacity:this.capacity,count:this.count,total:this.total,overflow:this.overflow,invalid:this.invalid,complete:this.complete,
      startedAt:this.startedAt,finishedAt:this.finishedAt,windows:{early:{start:this.earlyStart,end:this.earlyEnd},settling:{start:this.settlingStart,end:this.settlingEnd},settled:{start:this.settledStart,end:this.settledEnd}},frames};
  }
}
