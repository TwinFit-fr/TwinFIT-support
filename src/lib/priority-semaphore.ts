/** At most `limit` holders; waiters with the lowest priority number go first. */
export function createPrioritySemaphore(limit: number) {
  let active = 0;
  const waiters: { priority: number; resolve: () => void }[] = [];
  return {
    acquire(priority: number): Promise<void> {
      if (active < limit) {
        active++;
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        waiters.push({ priority, resolve });
        waiters.sort((a, b) => a.priority - b.priority);
      });
    },
    release() {
      const next = waiters.shift();
      if (next) next.resolve();
      else active--;
    },
  };
}
