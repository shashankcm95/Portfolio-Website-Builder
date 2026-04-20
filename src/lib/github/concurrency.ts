/**
 * Tiny semaphore that caps in-flight promises.
 *
 * Usage:
 *   const limit = pLimit(4);
 *   const results = await Promise.all(tasks.map((t) => limit(() => t())));
 *
 * GitHub's secondary abuse limit trips on high concurrent fan-out against
 * the same repo. Capping at 4 keeps us well-behaved even when we add more
 * signal fetchers later.
 */
export function pLimit(max: number) {
  if (max < 1 || !Number.isFinite(max)) {
    throw new Error(`pLimit: max must be a positive finite number, got ${max}`);
  }

  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= max) return;
    const run = queue.shift();
    if (run) {
      active++;
      run();
    }
  };

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task = () => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      };
      queue.push(task);
      next();
    });
  };
}
