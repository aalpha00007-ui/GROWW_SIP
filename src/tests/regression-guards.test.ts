// The regression suite's clock and database must be impossible to reach on the live site.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/api/e2e/clock/route';
import { setTestClock, todayInIndia } from '../pipeline/loading/dates';

const post = (today: unknown) => POST(new Request('http://x/api/e2e/clock', { method: 'POST', body: JSON.stringify({ today }) }));

afterEach(() => {
  vi.unstubAllEnvs();
  (globalThis as { growwSipTestToday?: string }).growwSipTestToday = undefined;
});

describe('The test clock', () => {
  it('does not exist unless the server was started with E2E_CLOCK=1', async () => {
    vi.stubEnv('E2E_CLOCK', '');
    const real = todayInIndia();
    expect((await post('2030-01-01')).status).toBe(404);
    expect(todayInIndia()).toBe(real);
  });

  it('moves the demo date on the regression server, and takes only a real date', async () => {
    vi.stubEnv('E2E_CLOCK', '1');
    expect((await post('2026-13-40')).status).toBe(400);
    expect((await post('2030-01-01')).status).toBe(200);
    expect(todayInIndia()).toBe('2030-01-01');
  });

  it('never changes a date worked out from a given moment', () => {
    setTestClock('2030-01-01');
    expect(todayInIndia(new Date('2026-11-06T06:00:00Z'))).toBe('2026-11-06');
  });

  it('is never switched on by the deploy', () => {
    const render = readFileSync('render.yaml', 'utf8');
    expect(render).not.toMatch(/E2E_/);
  });
});
