import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function resolveBundledBinaryPath(packageRootDir: string): string {
  const candidate = join(packageRootDir, 'bin', 'saraudio-capture');
  if (existsSync(candidate)) return candidate;
  throw new Error(
    'saraudio-capture binary not found. Run build or reinstall @saraudio/capture-darwin (bin/saraudio-capture missing).',
  );
}
