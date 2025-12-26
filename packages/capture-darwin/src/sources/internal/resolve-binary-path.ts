import { accessSync, chmodSync, constants, existsSync } from 'node:fs';
import { join } from 'node:path';

export function resolveBundledBinaryPath(packageRootDir: string): string {
  const candidate = join(packageRootDir, 'bin', 'saraudio-capture');
  if (existsSync(candidate)) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // npm sometimes drops the executable bit when extracting tarballs.
      // Ensure the bundled binary is runnable.
      try {
        chmodSync(candidate, 0o755);
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(
          `saraudio-capture is present but not executable (${candidate}). ` +
            `Try reinstalling @saraudio/capture-darwin or run chmod +x on the file. ` +
            `Underlying error: ${errorMessage}`,
        );
      }
    }
  }
  throw new Error(
    'saraudio-capture binary not found. Run build or reinstall @saraudio/capture-darwin (bin/saraudio-capture missing).',
  );
}
