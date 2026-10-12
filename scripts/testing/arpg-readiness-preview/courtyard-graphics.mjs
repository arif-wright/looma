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
export function expectedCourtyardCommands(name){
  if(!COURTYARD_NAMES.includes(name))throw Error('Unknown courtyard object');
  const commands=[6,1,0,0,7,0,0];
  for(const {color,points}of courtyardFaces(name)){
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
    commands:Array.isArray(o?.commandBuffer)&&o.commandBuffer.length<=256?[...o.commandBuffer]:null});
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
    if(o.commandCount!==expected.length||!Array.isArray(o.commands)||o.commands.length!==expected.length||o.commands.some((v,j)=>v!==expected[j]))issues.push('Wall commands differ from the exact approved union boundary/cap');
  }return issues;
}
export function courtyardOwnershipIssues(before,after,recreated){
  const a=before?.townArt?.ground?.courtyard,b=after?.townArt?.ground?.courtyard;
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==4||b.length!==4)return ['Missing courtyard ownership history'];
  return (recreated?b.every(o=>!a.some(old=>old.objectId===o.objectId)):b.every((o,i)=>o.objectId===a[i].objectId))
    ?[]:['Courtyard ownership must remain stable within town and be recreated after return'];
}
