import path from 'node:path';

/**
 * Reads keys from .env.local, then .env, in the project folder. Loading never overrides a variable
 * that is already set, so CI and Render settings win, then .env.local, then .env.
 */
export function loadEnvFiles(dir: string = process.cwd()): void {
  for (const file of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(path.join(dir, file));
    } catch {
      // The file is optional.
    }
  }
}
