export type TrailPoint = { x: number; z: number };

export class CompanionTrail {
  private points: TrailPoint[] = [];
  constructor(private readonly followDistance = 1.35, private readonly maxPoints = 45) {}

  push(point: TrailPoint) {
    const last = this.points.at(-1);
    if (!last || Math.hypot(point.x - last.x, point.z - last.z) >= 0.08) this.points.push({ ...point });
    if (this.points.length > this.maxPoints) this.points.splice(0, this.points.length - this.maxPoints);
  }

  target(fallback: TrailPoint): TrailPoint {
    if (this.points.length === 0) return fallback;
    const latest = this.points.at(-1)!;
    for (let index = this.points.length - 2; index >= 0; index -= 1) {
      const point = this.points[index]!;
      if (Math.hypot(latest.x - point.x, latest.z - point.z) >= this.followDistance) return point;
    }
    return fallback;
  }
}
