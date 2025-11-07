import confetti from 'canvas-confetti';

export function celebrateWalletCredit() {
  // fire two bursts for depth
  confetti({
    particleCount: 80,
    startVelocity: 35,
    spread: 60,
    ticks: 200,
    scalar: 0.9,
    origin: { x: 0.2, y: 0.3 }
  });
  confetti({
    particleCount: 120,
    startVelocity: 45,
    spread: 80,
    ticks: 180,
    scalar: 1.1,
    origin: { x: 0.8, y: 0.35 }
  });
}
