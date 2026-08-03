export class SlidingWindowRateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  accept(now = Date.now()) {
    const cutoff = now - this.windowMs;
    while (this.timestamps[0] !== undefined && this.timestamps[0] <= cutoff) {
      this.timestamps.shift();
    }
    if (this.timestamps.length >= this.limit) return false;
    this.timestamps.push(now);
    return true;
  }
}
