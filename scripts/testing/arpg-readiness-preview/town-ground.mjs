import { courtyardGraphicsIssues } from './courtyard-graphics.mjs';
// Bounded ground/gate observations, independent of the production art helper.
// Pixel alpha proves coverage at five route points, not seamless visual quality.
export function townGroundIssues(gameplay) {
  const issues = [...townBoundaryIssues(gameplay), ...townBackdropIssues(gameplay)], art = gameplay?.townArt, ground = art?.ground;
  if (!art || !ground) return ['Missing actual town ground observations'];
  const plane = art.objects.filter(object => object.key === 'town_ground_plane_v1');
  const entrance = art.objects.filter(object => object.key === 'town_ruins_entrance_v1');
  if (plane.length !== 1 || entrance.length !== 1) return ['Exactly one ground plane and entrance are required'];
  const floor = plane[0], gate = entrance[0];
  if (floor.x !== 128 || floor.y !== -168 || floor.originX !== 0 || floor.originY !== 0 || floor.scaleX !== 2 || floor.scaleY !== 2 || floor.displayWidth !== 2688 || floor.displayHeight !== 1344 || floor.depth !== -161) issues.push('Ground plane transform or extent changed');
  if (ground.textureWidth !== 1344 || ground.textureHeight !== 672) issues.push('Wrong actual derived ground texture size');
  if (ground.filterMode !== 0) issues.push('Actual derived ground texture must use LINEAR filtering');
  if (ground.legacyFloorCount !== 0) issues.push('Legacy floor tiles remain visible in town');
  if (ground.largeMarkerCount !== 0) issues.push('Oversized geometric town markers remain');
  if (gate.x !== 1728 || gate.y !== 664 || gate.depth !== 684) issues.push('Entrance left its original gate contact/depth');
  if (gate.originX !== 666 / 1536 || gate.originY !== 826 / 1024 || gate.scaleX !== 110 / 780 || gate.scaleY !== 110 / 780) issues.push('Entrance measured foot anchor or scale changed');
  if (!Array.isArray(ground.samples) || ground.samples.length !== 5) return [...issues, 'Five actual hero-to-gate ground samples are required'];
  ground.samples.forEach((sample, index) => {
    const t = index / 4, x = gameplay.x + (1728 - gameplay.x) * t, y = gameplay.y + (664 - gameplay.y) * t;
    if (sample.worldX !== x || sample.worldY !== y || sample.pixelX !== Math.floor((x - floor.x) / 2) || sample.pixelY !== Math.floor((y - floor.y) / 2)) issues.push('Ground sampling position does not match the actual hero-to-gate path');
    if (!Number.isInteger(sample.alpha) || sample.alpha < 250 || sample.alpha > 255) issues.push('Town ground is missing beneath the hero-to-gate path');
  });
  return issues;
}

// The flat visual rim is observed independently from all collision geometry.
// It must sort below both the hero and its foot-contact shadow everywhere.
export function townBoundaryIssues(gameplay) {
  const ground=gameplay?.townArt?.ground, issues=[];
  if(!ground)return ['Missing actual perimeter observations'];
  if(ground.legacyWallCount!==0)issues.push('Legacy town wall sprites remain');
  if(!Array.isArray(ground.perimeter)||ground.perimeter.length!==1)return [...issues,'Exactly one owned perimeter drawing required'];
  const rim=ground.perimeter[0];
  if(!Number.isSafeInteger(rim.objectId)||rim.objectId<1||!rim.active||!rim.visible||rim.alpha!==1)issues.push('Invalid perimeter ownership or visibility');
  if(rim.depth!==-160||rim.x!==0||rim.y!==0||rim.scaleX!==1||rim.scaleY!==1||rim.rotation!==0)issues.push('Perimeter drawing transform changed');
  if(!(rim.depth<gameplay.townArt.hero.depth-25))issues.push('Perimeter drawing can cover hero feet');
  return issues;
}

// Independent field-only contract. These fixed world polygons tile the padded
// exterior rectangle outside the FULL blocked-cell diamond, not the walkable
// interior. No production art helper is imported. No roof/detail draw is allowed.
export const BACKDROP_FIELDS = [
  {color:0x172125,points:[[1152,-232],[2944,664],[3200,664],[3200,-488],[1152,-488]]},
  {color:0x141d21,points:[[2944,664],[1792,1240],[1792,1496],[3200,1496],[3200,664]]},
  {color:0x141d21,points:[[1792,1240],[0,344],[-256,344],[-256,1496],[1792,1496]]},
  {color:0x1a2427,points:[[0,344],[1152,-232],[1152,-488],[-256,-488],[-256,344]]}
];
export function expectedBackdropCommands() {
  // Phaser Graphics constructor's transparent line/fill defaults, then four
  // fillStyle/beginPath/moveTo/lineTo/closed-line/fillPath sequences.
  const result=[6,1,0,0,7,0,0];
  for(const {color,points} of BACKDROP_FIELDS) {
    result.push(7,color,1,1,5,...points[0]);
    for(const point of points.slice(1))result.push(4,...point);
    result.push(4,...points[0],8);
  }
  return result;
}
export function townBackdropIssues(gameplay) {
  const ground=gameplay?.townArt?.ground, issues=[];
  if(!ground||!Array.isArray(ground.backdrop)||ground.backdrop.length!==1)return ['Exactly one owned exterior field required'];
  if(ground.baseGraphicsCount!==2)issues.push('Town requires exactly the original rim and one exterior Graphics, without roof scenery');
  issues.push(...courtyardGraphicsIssues(gameplay));
  const field=ground.backdrop[0], expected=expectedBackdropCommands();
  if(!Number.isSafeInteger(field.objectId)||field.objectId<1||field.objectId===ground.perimeter?.[0]?.objectId||!field.active||!field.visible||field.alpha!==1)issues.push('Invalid exterior field ownership or visibility');
  if(field.depth!==-162||field.x!==0||field.y!==0||field.scaleX!==1||field.scaleY!==1||field.rotation!==0||field.scrollFactorX!==1||field.scrollFactorY!==1)issues.push('Exterior field transform/depth changed');
  if(field.commandCount!==expected.length||!Array.isArray(field.commands)||field.commands.length!==expected.length||field.commands.some((value,index)=>value!==expected[index]))issues.push('Exterior must contain exactly four fixed outside-diamond field fills, without roof/detail commands');
  return issues;
}
