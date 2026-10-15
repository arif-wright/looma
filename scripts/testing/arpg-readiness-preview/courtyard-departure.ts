import type { Page } from '@playwright/test';

// Native exploration departure: one E edge stays held until the existing departure
// acknowledgment. Key delivery and both assertions share the original 15s cap.
export async function departCourtyard(page: Page, acknowledge: (remaining: () => number) => Promise<void>) {
  const deadline = performance.now() + 15_000;
  const timeoutError = new Error('Native courtyard departure acknowledgment exceeded 15000ms');
  let stopped = false, failed = false;
  let failure: unknown;
  const remaining = () => {
    const ms = deadline - performance.now();
    if (stopped || ms <= 0) throw timeoutError;
    return ms;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { stopped = true; reject(timeoutError); }, remaining());
  });
  try {
    await Promise.race([
      (async () => {
        await page.keyboard.down('e');
        remaining(); // A late key acknowledgment must not start another wait.
        await acknowledge(remaining);
        remaining(); // A late departure is still a failed first attempt.
      })(),
      timeout
    ]);
  } catch (error) {
    failed = true;
    failure = error;
    throw error;
  } finally {
    stopped = true;
    clearTimeout(timer);
    try {
      await page.keyboard.up('e');
    } catch (releaseError) {
      if (failed) throw new AggregateError([failure, releaseError], 'Native courtyard departure and E-key release failed');
      throw releaseError;
    }
  }
}
