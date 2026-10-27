import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnvFiles } from '../env';

const KEYS = ['GS_TEST_A', 'GS_TEST_B', 'GS_TEST_C'];

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

describe('loadEnvFiles', () => {
  it('reads .env and .env.local, with set variables first, then .env.local, then .env', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'groww-sip-env-'));
    fs.writeFileSync(path.join(dir, '.env.local'), 'GS_TEST_A=from_local\n');
    fs.writeFileSync(path.join(dir, '.env'), 'GS_TEST_A=from_env\nGS_TEST_B=from_env\nGS_TEST_C=from_env\n');
    process.env.GS_TEST_C = 'from_ci';

    loadEnvFiles(dir);
    expect([process.env.GS_TEST_A, process.env.GS_TEST_B, process.env.GS_TEST_C]).toEqual(['from_local', 'from_env', 'from_ci']);
  });

  it('works when neither file exists', () => {
    expect(() => loadEnvFiles(fs.mkdtempSync(path.join(os.tmpdir(), 'groww-sip-empty-')))).not.toThrow();
  });
});
