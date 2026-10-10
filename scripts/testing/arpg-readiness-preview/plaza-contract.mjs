// Independent acceptance geometry, transcribed from the approved layout.
// Never imports production collision, camera, cutaway or asset helpers.
export const FOOTPRINTS = {
  rear: [[1240,304],[1304,272],[1560,400],[1496,432]],
  endcap: [[1728,376],[1984,248],[1920,216],[1664,344]],
  shop: [[1558,524],[1663,474],[1769,517],[1664,568]]
};
export const PLAZA_KEYS = ['rear','endcap'].flatMap(id => ['foundation','upper'].map(layer => `town_plaza_${id}_${layer}_v1`));
export const PLAZA_CHECKPOINTS = ['plaza-home','rear-front-ready','rear-front-walk-blocked','rear-front-dash-blocked','rear-side-ready','rear-side-dash-blocked','rear-back-cutaway','rear-front-restored','endcap-front-ready','endcap-front-walk-blocked','endcap-side-ready','endcap-side-dash-blocked','endcap-roof-cutaway','endcap-front-restored','gate-east-approach','gate-south-approach','gate-arrived','plaza-departed','plaza-returned-owned'];
export const DASH_ATTEMPTS = [
  {before:'rear-front-walk-blocked',after:'rear-front-dash-blocked',target:'rear',direction:[0,-1]},
  {before:'rear-side-ready',after:'rear-side-dash-blocked',target:'rear',direction:[1,0]},
  {before:'endcap-side-ready',after:'endcap-side-dash-blocked',target:'endcap',direction:[Math.SQRT1_2,Math.SQRT1_2]}
];
const edgeDistance = (p,a,b) => { const dx=b[0]-a[0],dy=b[1]-a[1];if(dx===0&&dy===0)return Math.hypot(p[0]-a[0],p[1]-a[1]);const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy))); return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy); };
const side = (a,b,p) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const inside = (p,poly) => { const s=poly.map((a,i)=>side(a,poly[(i+1)%poly.length],p)); return s.every(x=>x>=0)||s.every(x=>x<=0); };
const intersects = (a,b,c,d) => Math.max(a[0],b[0])>=Math.min(c[0],d[0])&&Math.max(c[0],d[0])>=Math.min(a[0],b[0])&&Math.max(a[1],b[1])>=Math.min(c[1],d[1])&&Math.max(c[1],d[1])>=Math.min(a[1],b[1])&&side(a,b,c)*side(a,b,d)<=0&&side(c,d,a)*side(c,d,b)<=0;
export function sweptDistance(a,b,poly) {
  if (inside(a,poly)||inside(b,poly)) return 0;
  return Math.min(...poly.map((c,i)=>{const d=poly[(i+1)%poly.length];return intersects(a,b,c,d)?0:Math.min(edgeDistance(a,c,d),edgeDistance(b,c,d),edgeDistance(c,a,b),edgeDistance(d,a,b));}));
}
export function roomAllows(p) {
  return [[0,0],[38,0],[-38,0],[0,38],[0,-38]].every(([dx,dy])=>{
    const x=p[0]+dx-1152,y=p[1]+dy+200;
    const tx=Math.round((x/64+y/32)/2),ty=Math.round((y/32-x/64)/2);
    return tx>=1&&tx<=26&&ty>=1&&ty<=16;
  });
}
export function plazaGeometryIssues(g, gate=false) {
  const errors=[], v=g?.viewportGeometry;
  const rect=r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0;
  const within=(r,c,pad=0)=>rect(r)&&r.x>=c.x+pad-1&&r.y>=c.y+pad-1&&r.x+r.width<=c.x+c.width-pad+1&&r.y+r.height<=c.y+c.height-pad+1;
  const overlaps=(a,b,pad=0)=>a.x<b.x+b.width+pad&&a.x+a.width>b.x-pad&&a.y<b.y+b.height+pad&&a.y+a.height>b.y-pad;
  if(!v||!rect({x:0,y:0,...v.canvas})||!rect(v.hud)||!rect(v.controls))return['Missing actual viewport geometry'];
  const canvas={x:0,y:0,...v.canvas};
  for(const [items,panel,names] of [[v.hudItems,v.hud,['score','hp','area']],[v.controlItems,v.controls,['status','primary']]]) {
    if(!within(panel,canvas)||!Array.isArray(items)||!names.every(n=>items.some(i=>i.name===n)))errors.push('Missing or clipped UI');
    for(const item of items??[])if(!within(item.bounds,panel)||!within(item.bounds,canvas))errors.push('UI text outside panel');
  }
  const visibility=g.plazaVisibility;
  if(!visibility||!Number.isInteger(visibility.samples)||visibility.samples<20||!Number.isInteger(visibility.readable)||visibility.readable<visibility.samples/2||visibility.readable>visibility.samples||!Number.isFinite(visibility.meanTransmission)||visibility.meanTransmission<.4||visibility.meanTransmission>1||!Array.isArray(visibility.occluders))errors.push('Opaque foreground hides the measured hero');
  const hero=v.heroVisible;
  if(!hero||hero.alphaThreshold!==32||!rect(hero.sourceBounds)||hero.sourceBounds.opaquePixels<=0||!rect(hero.screenBounds)||hero.screenBounds.width<12||hero.screenBounds.height<24)errors.push('Hero measured silhouette too small or missing');
  else {
    if(!within(hero.screenBounds,canvas,24))errors.push('Hero silhouette lacks canvas edge clearance');
    if([v.hud,v.controls].some(p=>overlaps(hero.screenBounds,p,12)))errors.push('Hero silhouette intersects UI clearance');
  }
  if(gate)for(const r of [v.entrance,v.entranceLabel,v.entranceVisible?.screenBounds]){
    if(!within(r,canvas,11))errors.push('Approach entrance or prompt clipped');
    else if([v.hud,v.controls].some(p=>overlaps(r,p,11)))errors.push('Approach entrance or prompt intersects UI clearance');
  }
  return errors;
}
export function plazaObjectsIssues(g) {
  const issues=[], objects=g?.plaza;
  const expected=['town-plaza-shop',...['rear','endcap'].flatMap(id=>['foundation','upper'].map(l=>`town-plaza-${id}-${l}`))].sort();
  if(!Array.isArray(objects)||JSON.stringify(objects.map(o=>o.name).sort())!==JSON.stringify(expected))return['Exactly five owned plaza images required'];
  if(new Set(objects.map(o=>o.objectId)).size!==5||objects.some(o=>!Number.isSafeInteger(o.objectId)||o.objectId<1))issues.push('Distinct observed object ownership required');
  for(const o of objects){
    if(!o.active||!o.visible||!Number.isFinite(o.alpha)||!Number.isFinite(o.depth))issues.push('Inactive or invalid plaza layer');
    if(o.name==='town-plaza-shop') { if(o.key!=='town_corner_shop_v1'||o.x!==1664||o.y!==568)issues.push('Shop placement changed');continue; }
    const rear=o.name.includes('-rear-'), foundation=o.name.endsWith('-foundation');
    const key=`town_plaza_${rear?'rear':'endcap'}_${foundation?'foundation':'upper'}_v1`;
    if(o.key!==key||o.x!==(rear?1496:1728)||o.y!==(rear?432:376)||o.originX!==(rear?520:136)/656||o.originY!==(rear?536/544:472/480)||o.scaleX!==.5||o.scaleY!==.5||o.displayWidth!==328||o.displayHeight!==(rear?272:240))issues.push('Facade transform differs from exact projection contract');
    if(foundation&&o.alpha!==1)issues.push('Solid foundation became translucent');
    if(!foundation&&![1,.28].includes(o.alpha))issues.push('Unexpected upper opacity');
    if(o.depth>o.y+20)issues.push('Facade raised above static contact depth');
  }
  for(const id of ['rear','endcap'])if(objects.find(o=>o.name===`town-plaza-${id}-foundation`).depth!==objects.find(o=>o.name===`town-plaza-${id}-upper`).depth)issues.push('Foundation and upper depth diverged');
  if(g.townArt?.hero.scaleX!==1||g.townArt?.hero.scaleY!==1||g.townArt?.hero.depth!==g.y+20)issues.push('Hero scale or contact depth changed');
  return issues;
}
