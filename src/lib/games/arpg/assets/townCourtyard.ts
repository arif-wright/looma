import type Phaser from 'phaser';
import type { Vec2 } from '../ecs/components';
import { crossesTownFootprint, townFacadePresentation } from '../townPlaza';

// Approved study D. These world-space endpoints are physical geometry, not
// decoration: the two open ends retain passages around the new courtyard bay.
export const TOWN_COURTYARD = {
  centerline: [{ x: 1184, y: 616 }, { x: 1728, y: 888 }, { x: 2016, y: 744 }],
  width: 16,
  height: 32,
  foundationHeight: 8
} as const;

type Face = { points: Vec2[]; color: number };
const raised = (point: Vec2, height: number): Vec2 => ({ x: point.x, y: point.y - height });

/** One shared definition for collision and every drawn ground-contact vertex.
 * The rectangles overlap at the elbow; neither is extended or miter-expanded.
 * Height is vertical screen/world y, retaining the existing 2:1 ground axes. */
export function townCourtyardGeometry() {
  const { centerline, width, height, foundationHeight } = TOWN_COURTYARD;
  return [0, 1].map(index => {
    const a = centerline[index]!, b = centerline[index + 1]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / length * width / 2;
    const ny = (b.x - a.x) / length * width / 2;
    const footprint = [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny },
      { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }];
    const contact = a.y > b.y ? a : b;
    const local = (p: Vec2) => ({ x: p.x - contact.x, y: p.y - contact.y });
    // Only front-facing UNION boundary edges are visible. The shared end
    // faces intersect at contact: their internal halves are inside the other
    // approved rectangle and must not paint over its cap. Keep the exact butt
    // joint's concave notch; no miter fill or collision expansion is introduced.
    const exposed = index === 0
      ? [{ a: footprint[0]!, b: footprint[1]!, color: 0x696b60 },
        { a: footprint[1]!, b: contact, color: 0x555d57 }]
      : [{ a: footprint[0]!, b: footprint[1]!, color: 0x696b60 },
        { a: contact, b: footprint[0]!, color: 0x50584f }];
    const faces = (bottom: number, top: number): Face[] => exposed.map(edge => ({
      points: [raised(edge.a, bottom), raised(edge.b, bottom), raised(edge.b, top), raised(edge.a, top)], color: edge.color
    }));
    const foundation: Face[] = [...faces(0, foundationHeight),
      { points: footprint.map(p => raised(p, foundationHeight)), color: 0x646b60 }];
    const upper: Face[] = [...faces(foundationHeight, height),
      { points: footprint.map(p => raised(p, height)), color: 0x929383 }];
    return { id: index === 0 ? 'west' : 'east', footprint, contact,
      localFootprint: footprint.map(local), foundation, upper,
      upperPolygons: upper.map(face => face.points.map(local)) };
  });
}

/** Area-owned, create-once vector art. The solid plinth stays readable when
 * the upper wall cuts away. No added texture, clock, camera or input state. */
export function createTownCourtyard(scene: Phaser.Scene, addToWorld: (object: Phaser.GameObjects.GameObject) => void) {
  const geometry = townCourtyardGeometry();
  const graphics: Phaser.GameObjects.Graphics[] = [];
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    for (const graphic of graphics) graphic.destroy();
    graphics.length = 0;
  };
  try {
    const draw = (wall: typeof geometry[number], layer: string, faces: Face[]) => {
      const graphic = scene.add.graphics();
      graphics.push(graphic);
      graphic.setName(`town-courtyard-${wall.id}-${layer}`).setDepth(wall.contact.y + (layer === 'foundation' ? 19 : 20));
      for (const face of faces) graphic.fillStyle(face.color, 1).fillPoints(face.points, true);
      addToWorld(graphic);
      return graphic;
    };
    // At equal depth both plinths precede both upper layers, including the
    // shared elbow. A later-created foundation must not paint over a cap.
    const walls = geometry.map(wall => ({ wall, foundation: draw(wall, 'foundation', wall.foundation) }));
    const layers = walls.map(entry => ({ ...entry, upper: draw(entry.wall, 'upper', entry.wall.upper) }));
    return {
      objects: Object.freeze([...graphics]),
      blocksMovement: (from: Vec2, to: Vec2, radius: number) => !destroyed &&
        geometry.some(wall => crossesTownFootprint(from, to, radius, wall.footprint)),
      updateActor: (actor: Vec2) => {
        if (destroyed) return;
        let lowestUpperDepth = Infinity;
        for (const { wall, upper } of layers) {
          const state = townFacadePresentation(actor, wall.contact, wall.localFootprint, wall.upperPolygons);
          upper.setDepth(state.depth).setAlpha(state.alpha);
          lowestUpperDepth = Math.min(lowestUpperDepth, state.depth);
        }
        // Treat the connected opaque plinth as one lower layer. Per-arm depth
        // can otherwise paint a height-8 cap OVER the neighboring upper face
        // when only that neighbor lowers its depth for a front-side actor.
        for (const { foundation } of layers) foundation.setDepth(lowestUpperDepth - 1);
      },
      destroy
    };
  } catch (error) {
    destroy();
    throw error;
  }
}
