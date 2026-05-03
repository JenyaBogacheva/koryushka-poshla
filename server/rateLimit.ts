export type IpThrottle = {
  isBlocked(ip: string): boolean;
  recordFailure(ip: string): void;
  recordSuccess(ip: string): void;
};

export type ThrottleOptions = {
  maxFailures: number;
  windowMs: number;
  now?: () => number;
};

export function createIpThrottle(opts: ThrottleOptions): IpThrottle {
  const { maxFailures, windowMs } = opts;
  const now = opts.now ?? (() => Date.now());
  const failures = new Map<string, number[]>();

  function prune(ip: string, t: number): number[] {
    const cutoff = t - windowMs;
    const arr = (failures.get(ip) ?? []).filter((ts) => ts > cutoff);
    if (arr.length === 0) failures.delete(ip);
    else failures.set(ip, arr);
    return arr;
  }

  return {
    isBlocked(ip) {
      return prune(ip, now()).length >= maxFailures;
    },
    recordFailure(ip) {
      const t = now();
      const arr = prune(ip, t);
      arr.push(t);
      failures.set(ip, arr);
    },
    recordSuccess(ip) {
      failures.delete(ip);
    },
  };
}
