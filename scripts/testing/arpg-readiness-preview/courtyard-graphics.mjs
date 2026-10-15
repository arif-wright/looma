// Independent observation/contract for the approved D wall. Never imports the
// production geometry, collision or presentation helpers.
export const COURTYARD_NAMES = ['town-courtyard-west-foundation','town-courtyard-east-foundation',
  'town-courtyard-west-upper','town-courtyard-east-upper'];
export const COURTYARD_FOOTPRINTS = [
  [[1180.4222912360003,623.1554175279994],[1724.4222912360003,895.1554175279994],[1731.5777087639997,880.8445824720006],[1187.5777087639997,608.8445824720006]],
  [[1731.5777087639997,895.1554175279994],[2019.5777087639997,751.1554175279994],[2012.4222912360003,736.8445824720006],[1724.4222912360003,880.8445824720006]]
];
const contact=[1728,888], raise=(p,h)=>[p[0],p[1]-h];
export function courtyardFaces(name){
  const east=name.includes('-east-'),upper=name.endsWith('-upper'),p=COURTYARD_FOOTPRINTS[east?1:0];
  const low=upper?8:0,high=upper?32:8;
  const edges=east?[[p[0],p[1],0x696b60],[contact,p[0],0x50584f]]:[[p[0],p[1],0x696b60],[p[1],contact,0x555d57]];
  return [...edges.map(([a,b,color])=>({color,points:[raise(a,low),raise(b,low),raise(b,high),raise(a,high)]})),
    {color:upper?0x929383:0x646b60,points:p.map(q=>raise(q,high))}];
}
// Independent transcription of the reviewed stone-depth UV recipe. Physical
// faces above remain the collision/presentation oracle, never material cells.
// flat=true retains the exact PR18 stone/mortar partition for invariant checks.
export const COURTYARD_FILL_COUNTS = Object.freeze(Object.fromEntries(
  COURTYARD_NAMES.map((name,i)=>[name,[25,17,160,98][i]])));
export const COURTYARD_COMMAND_COUNTS = Object.freeze(Object.fromEntries(
  COURTYARD_NAMES.map(name=>[name,7+20*COURTYARD_FILL_COUNTS[name]])));
export function expectedCourtyardMaterial(name, flat = false){
  if(!COURTYARD_NAMES.includes(name))throw Error('Unknown courtyard object');
  const wi=name.includes('-east-')?1:0,foundation=name.endsWith('-foundation'),out=[];
  for(const [faceIndex,{points}]of courtyardFaces(name).entries()){
    const [a,b,,d]=points,cap=faceIndex===2,end=faceIndex===1;
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),extent=Math.hypot(d[0]-a[0],d[1]-a[1]);
    const base=foundation?(cap?0x746c5c:0x514c42):(cap?0x6b6252:0x554f44);
    const palette=foundation?[0x6e6655,0x746b59,0x696353,0x776e5b]:end?[0x776d5b,0x7a705d]:
      cap?[0x978b72,0xa09277,0x92866f,0x9c8f75,0x988d77]:[0x7c715e,0x877a65,0x786e5c,0x817461,0x897b65,0x7d7461];
    const map=(u,v)=>{
      if((u===0||u===1)&&(v===0||v===1))return [...points[v===0?(u===0?0:1):(u===0?3:2)]];
      return a.map((n,k)=>n+(b[k]-n)*u+(d[k]-n)*v);
    };
    const paint=(u0,u1,v0,v1,color,stamp)=>{
      if(!(u1>u0&&v1>v0))return;
      const corners=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]],outer=corners.map(([u,v])=>map(u,v));
      if(stamp===undefined||flat||foundation||faceIndex!==0||(u1-u0)*length<24){out.push({color,points:outer});return;}
      const sizes=[(u1-u0)*length,(v1-v0)*extent];
      const inner=corners.map(([u,v],corner)=>map(...[u,v].map((q,axis)=>{
        const inset=Math.min(sizes[axis]*.23,(axis?.8:1.1)+((stamp*7+corner*3)%5)*.16);
        const positive=axis?corner<2:corner===0||corner===3;
        return positive?(axis?q+inset/extent:q):q-inset/(axis?extent:length);
      })));
      const offsets=cap?[-12,-7,17,7]:[-19,-9,24,9];
      const shade=offset=>[16,8,0].reduce((result,bits)=>result|(Math.max(0,Math.min(255,((color>>bits)&255)+offset))<<bits),0);
      for(let edge=0;edge<3;edge++){const next=(edge+1)%4;out.push({color:shade(offsets[edge]),points:[outer[edge],outer[next],inner[next],inner[edge]]});}
      out.push({color:shade((stamp%5)-2),points:inner});
    };
    if(foundation&&cap){paint(0,1,0,1,base);continue;}
    const rows=cap||foundation?1:2,widths=foundation?[70,88,76,94,82]:[44,56,48,52,60,46,54];
    let previousV=0;
    for(let row=0;row<rows;row++){
      const v0=row/rows+(row===0?.32:.7)/extent,v1=(row+1)/rows-(row===rows-1?.32:.7)/extent;
      paint(0,1,previousV,v0,base);
      let previousU=0,start=row?-25:0,i=0;
      while(start<length){
        const stop=end?length:Math.min(length,start+widths[(i+wi*2+(cap?1:0)+row*2)%widths.length]);
        const u0=(Math.max(0,end?0:start)+(end||start<=0?.32:.7))/length,u1=(stop-(stop>=length?.32:.7))/length;
        if(u1>u0){
          paint(previousU,u0,v0,v1,base);
          paint(u0,u1,v0,v1,palette[(i+row*3+wi)%palette.length],i+row*11+wi*19+faceIndex*7);
          previousU=u1;
        }
        if(end)break;
        start+=widths[(i+wi*2+(cap?1:0)+row*2)%widths.length];i++;
      }
      paint(previousU,1,v0,v1,base);previousV=v1;
    }
    paint(0,1,previousV,1,base);
  }
  if(out.length!==(flat?[25,17,91,59][COURTYARD_NAMES.indexOf(name)]:COURTYARD_FILL_COUNTS[name]))throw Error('Independent courtyard material count mismatch');
  return out;
}
export function expectedCourtyardCommands(name){
  if(!COURTYARD_NAMES.includes(name))throw Error('Unknown courtyard object');
  const commands=[6,1,0,0,7,0,0];
  for(const {color,points}of expectedCourtyardMaterial(name)){
    commands.push(7,color,1,1,5,...points[0]);for(const p of points.slice(1))commands.push(4,...p);
    commands.push(4,...points[0],8);
  }return commands;
}
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const inside=(p,poly)=>{const s=poly.map((a,i)=>cross(a,poly[(i+1)%poly.length],p));return s.every(n=>n>=0)||s.every(n=>n<=0);};
const intersect=(a,b,c,d)=>Math.max(a[0],b[0])>=Math.min(c[0],d[0])&&Math.max(c[0],d[0])>=Math.min(a[0],b[0])&&Math.max(a[1],b[1])>=Math.min(c[1],d[1])&&Math.max(c[1],d[1])>=Math.min(a[1],b[1])&&cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;
const overlaps=(a,b)=>a.some(p=>inside(p,b))||b.some(p=>inside(p,a))||a.some((p,i)=>b.some((q,j)=>intersect(p,a[(i+1)%a.length],q,b[(j+1)%b.length])));
export function expectedCourtyardPresentation(name,actor){
  if(name.endsWith('-foundation')){
    const west=expectedCourtyardPresentation('town-courtyard-west-upper',actor);
    const east=expectedCourtyardPresentation('town-courtyard-east-upper',actor);
    return {depth:Math.min(west.depth,east.depth)-1,alpha:1};
  }
  const poly=COURTYARD_FOOTPRINTS[name.includes('-east-')?1:0];
  const x=Math.max(Math.min(...poly.map(p=>p[0])),Math.min(Math.max(...poly.map(p=>p[0])),actor.x));
  let front=-Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];if(x<Math.min(a[0],b[0])||x>Math.max(a[0],b[0]))continue;
    front=Math.max(front,a[0]===b[0]?Math.max(a[1],b[1]):a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]));}
  const behind=actor.y<front,envelope=[[actor.x-64,actor.y-96],[actor.x+64,actor.y-96],[actor.x+64,actor.y+24],[actor.x-64,actor.y+24]];
  const upperName=name.replace('-foundation','-upper'),touches=courtyardFaces(upperName).some(f=>overlaps(f.points,envelope));
  return {depth:!behind&&touches?Math.min(908,actor.y+19):908,alpha:name.endsWith('-upper')&&behind&&touches ? .28 : 1};
}

/** Read actual object identity, type and command buffers. Names alone cannot
 * claim ownership: all six references must be exactly the current area owner's
 * distinct objects, each present once, with no seventh Graphics in the world. */
export function readTownGraphics(world,owned,Graphics,id){
  const all=world.filter(o=>o instanceof Graphics);
  const refs=[owned?.perimeter,owned?.backdrop,...(Array.isArray(owned?.courtyard)?owned.courtyard:[])];
  const names=['town-perimeter-rim','town-exterior-backdrop',...COURTYARD_NAMES];
  const valid=refs.length===6&&new Set(refs).size===6&&refs.every((o,i)=>o instanceof Graphics&&o.name===names[i]&&world.filter(v=>v===o).length===1);
  const original=refs.slice(0,2),walls=refs.slice(2);
  const read=o=>({name:o?.name??null,objectId:o&&typeof o==='object'?id(o):null,isGraphics:o instanceof Graphics,inWorld:world.filter(v=>v===o).length,
    depth:o?.depth,x:o?.x,y:o?.y,scaleX:o?.scaleX,scaleY:o?.scaleY,rotation:o?.rotation,alpha:o?.alpha,active:o?.active,visible:o?.visible,
    scrollFactorX:o?.scrollFactorX,scrollFactorY:o?.scrollFactorY,commandCount:Array.isArray(o?.commandBuffer)?o.commandBuffer.length:-1,
    commands:Array.isArray(o?.commandBuffer)&&o.commandBuffer.length===COURTYARD_COMMAND_COUNTS[o?.name]?[...o.commandBuffer]:null});
  return {worldGraphicsCount:all.length,baseGraphicsCount:all.filter(o=>original.includes(o)).length,
    graphicsOwnershipValid:valid,originalGraphicsIds:original.map(o=>o&&typeof o==='object'?id(o):null),
    unknownGraphicsIds:all.filter(o=>!refs.includes(o)).map(id),courtyard:walls.map(read)};
}
export function courtyardGraphicsIssues(gameplay){
  const g=gameplay?.townArt?.ground,issues=[];
  if(!g||g.graphicsOwnershipValid!==true||g.baseGraphicsCount!==2||g.worldGraphicsCount!==6||!Array.isArray(g.unknownGraphicsIds)||g.unknownGraphicsIds.length)issues.push('Exact owned two-original plus four-wall Graphics partition required');
  if(!Array.isArray(g?.courtyard)||g.courtyard.length!==4)return [...issues,'Exactly four owned courtyard Graphics required'];
  const ids=[...(g.originalGraphicsIds??[]),...g.courtyard.map(o=>o.objectId)];
  if(ids.length!==6||new Set(ids).size!==6||ids.some(id=>!Number.isSafeInteger(id)||id<1)||g.originalGraphicsIds?.[0]!==g.perimeter?.[0]?.objectId||g.originalGraphicsIds?.[1]!==g.backdrop?.[0]?.objectId)issues.push('Graphics owner identities disagree with original perimeter/backdrop');
  if(!Number.isFinite(gameplay.x)||!Number.isFinite(gameplay.y))return [...issues,'Finite actor position required for wall presentation'];
  for(let i=0;i<4;i++){
    const o=g.courtyard[i],name=COURTYARD_NAMES[i],expected=expectedCourtyardCommands(name),state=expectedCourtyardPresentation(name,gameplay);
    if(o.name!==name||o.isGraphics!==true||o.inWorld!==1||o.active!==true||o.visible!==true)issues.push('Missing, swapped, mistyped or inactive wall object');
    if(o.x!==0||o.y!==0||o.scaleX!==1||o.scaleY!==1||o.rotation!==0||o.scrollFactorX!==1||o.scrollFactorY!==1)issues.push('Wall transform changed');
    if(o.alpha!==state.alpha||o.depth!==state.depth)issues.push('Wall depth/cutaway or opaque foundation changed');
    if(o.commandCount!==expected.length||!Array.isArray(o.commands)||o.commands.length!==expected.length||o.commands.some((v,j)=>v!==expected[j]))issues.push('Wall commands differ from the exact approved stone/mortar partition');
  }return issues;
}
export function courtyardOwnershipIssues(before,after,recreated){
  const a=before?.townArt?.ground?.courtyard,b=after?.townArt?.ground?.courtyard;
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==4||b.length!==4)return ['Missing courtyard ownership history'];
  return (recreated?b.every(o=>!a.some(old=>old.objectId===o.objectId)):b.every((o,i)=>o.objectId===a[i].objectId))
    ?[]:['Courtyard ownership must remain stable within town and be recreated after return'];
}
