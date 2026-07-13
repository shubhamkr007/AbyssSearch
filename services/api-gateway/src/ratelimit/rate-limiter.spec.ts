import { InMemoryRateLimiter } from './rate-limiter';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('InMemoryRateLimiter', () => {
  it('allows up to the limit then blocks', async () => {
    const limiter = new InMemoryRateLimiter();
    const first = await limiter.hit('t1', 2);
    const second = await limiter.hit('t1', 2);
    const third = await limiter.hit('t1', 2);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.allowed).toBe(false);
  });

  it('isolates counters per key', async () => {
    const limiter = new InMemoryRateLimiter();
    await limiter.hit('a', 1);
    const other = await limiter.hit('b', 1);
    expect(other.allowed).toBe(true);
  });

  it('resets after the window elapses', async () => {
    const limiter = new InMemoryRateLimiter(50);
    await limiter.hit('t', 1);
    expect((await limiter.hit('t', 1)).allowed).toBe(false);
    await sleep(60);
    expect((await limiter.hit('t', 1)).allowed).toBe(true);
  });
});
