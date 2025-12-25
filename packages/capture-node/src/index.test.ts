import { describe, expect, it } from 'vitest';
import { createMicrophoneSource } from './index';

describe('@saraudio/capture-node', () => {
  it('stop() before start() is ok', async () => {
    const source = createMicrophoneSource();
    await expect(source.stop()).resolves.toBeUndefined();
  });

  if (process.platform !== 'darwin') {
    it('rejects start() on unsupported platforms', async () => {
      const source = createMicrophoneSource();
      await expect(source.start(() => undefined)).rejects.toThrow(/not supported/i);
    });
  }
});
