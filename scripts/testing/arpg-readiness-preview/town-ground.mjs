// Bounded ground/gate observations, independent of the production art helper.
// Pixel alpha proves coverage at five route points, not seamless visual quality.
export function townGroundIssues(gameplay) {
  const issues = [], art = gameplay?.townArt, ground = art?.ground;
  if (!art || !ground) return ['Missing actual town ground observations'];
  const plane = art.objects.filter(object => object.key === 'town_ground_plane_v1');
  const entrance = art.objects.filter(object => object.key === 'town_ruins_entrance_v1');
  if (plane.length !== 1 || entrance.length !== 1) return ['Exactly one ground plane and entrance are required'];
  const floor = plane[0], gate = entrance[0];
  if (floor.x !== 128 || floor.y !== -168 || floor.originX !== 0 || floor.originY !== 0 || floor.scaleX !== 2 || floor.scaleY !== 2 || floor.displayWidth !== 2688 || floor.displayHeight !== 1344 || floor.depth !== -161) issues.push('Ground plane transform or extent changed');
  if (ground.textureWidth !== 1344 || ground.textureHeight !== 672) issues.push('Wrong actual derived ground texture size');
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
