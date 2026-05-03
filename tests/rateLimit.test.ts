import { describe, it, expect } from 'vitest';
import { createIpThrottle } from '../server/rateLimit';

function makeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

describe('createIpThrottle', () => {
  it('allows up to maxFailures within the window', () => {
    const clock = makeClock();
    const throttle = createIpThrottle({ maxFailures: 3, windowMs: 60_000, now: clock.now });
    expect(throttle.isBlocked('1.2.3.4')).toBe(false);
    throttle.recordFailure('1.2.3.4');
    throttle.recordFailure('1.2.3.4');
    expect(throttle.isBlocked('1.2.3.4')).toBe(false);
    throttle.recordFailure('1.2.3.4');
    expect(throttle.isBlocked('1.2.3.4')).toBe(true);
  });

  it('expires failures after the window', () => {
    const clock = makeClock();
    const throttle = createIpThrottle({ maxFailures: 2, windowMs: 60_000, now: clock.now });
    throttle.recordFailure('ip');
    throttle.recordFailure('ip');
    expect(throttle.isBlocked('ip')).toBe(true);
    clock.advance(60_001);
    expect(throttle.isBlocked('ip')).toBe(false);
  });

  it('clears failures on success', () => {
    const throttle = createIpThrottle({ maxFailures: 2, windowMs: 60_000 });
    throttle.recordFailure('ip');
    throttle.recordFailure('ip');
    expect(throttle.isBlocked('ip')).toBe(true);
    throttle.recordSuccess('ip');
    expect(throttle.isBlocked('ip')).toBe(false);
  });

  it('tracks ips independently', () => {
    const throttle = createIpThrottle({ maxFailures: 1, windowMs: 60_000 });
    throttle.recordFailure('a');
    expect(throttle.isBlocked('a')).toBe(true);
    expect(throttle.isBlocked('b')).toBe(false);
  });
});
