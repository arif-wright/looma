// Independent screen-space invariants, shared by browser assertions and the
// artifact gate. The input comes from real post-render camera/object bounds;
// no production layout function or desired-position values are used here.
export function phoneGeometryIssues(geometry) {
  const issues = [];
  if (!geometry) return ['Missing rendered viewport geometry'];
  const finite = value => Number.isFinite(value);
  const validRect = rect => rect && ['x', 'y', 'width', 'height'].every(key => finite(rect[key])) && rect.width > 0 && rect.height > 0;
  const canvas = { x: 0, y: 0, ...geometry.canvas };
  if (!validRect(canvas) || !validRect(geometry.hud) || !validRect(geometry.controls) || !validRect(geometry.shop) || !validRect(geometry.entrance) || !validRect(geometry.entranceLabel)) return ['Missing or invalid canvas, HUD, control, shop, entrance or gate-label bounds'];
  const camera = geometry.camera;
  if (!camera || !['x', 'y', 'width', 'height', 'zoom', 'scrollX', 'scrollY'].every(key => finite(camera[key])) || camera.width <= 0 || camera.height <= 0 || camera.zoom <= 0 || !Array.isArray(camera.matrix) || camera.matrix.length !== 6 || !camera.matrix.every(finite)) return ['Missing actual camera transform'];
  const inside = (inner, outer, tolerance = 1) => inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance && inner.x + inner.width <= outer.x + outer.width + tolerance && inner.y + inner.height <= outer.y + outer.height + tolerance;
  if (!inside(geometry.hud, canvas)) issues.push('HUD panel extends outside canvas');
  if (!inside(geometry.controls, canvas)) issues.push('Control panel extends outside canvas');
  for (const [items, required, panel, label] of [[geometry.hudItems, ['score', 'hp', 'area'], geometry.hud, 'HUD'], [geometry.controlItems, ['status', 'primary'], geometry.controls, 'Control']]) {
    if (!Array.isArray(items) || !required.every(name => items.some(item => item.name === name))) { issues.push(`Missing visible ${label} text bounds`); continue; }
    for (const item of items) if (!validRect(item.bounds) || !inside(item.bounds, panel) || !inside(item.bounds, canvas)) issues.push(`${label} text ${item.name} extends outside its panel or canvas`);
  }
  // The unobstructed art band is inferred from actual rendered panel edges.
  const band = { x: 0, y: geometry.hud.y + geometry.hud.height, width: canvas.width, height: geometry.controls.y - (geometry.hud.y + geometry.hud.height) };
  if (band.height <= 0) issues.push('HUD and controls leave no art band');
  const hero = geometry.heroGround;
  if (!hero || !finite(hero.x) || !finite(hero.y) || hero.x < 0 || hero.x > canvas.width || hero.y <= band.y || hero.y >= band.y + band.height) issues.push('Hero ground point is outside the unobstructed art band');
  if (!inside(geometry.shop, band, 1)) issues.push('Full shop bounds are clipped or obstructed by HUD or controls');
  if (!inside(geometry.entrance, band, 1)) issues.push('Full entrance bounds are clipped or obstructed by HUD or controls');
  if (!inside(geometry.entranceLabel, band, 1)) issues.push('Entrance label is clipped or obstructed by HUD or controls');
  return issues;
}
