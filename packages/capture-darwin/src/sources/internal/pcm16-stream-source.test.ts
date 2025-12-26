import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createPcm16StreamSource } from './pcm16-stream-source';

describe('createPcm16StreamSource', () => {
  it('rejects if the stream was destroyed before start()', async () => {
    const stream = new PassThrough();
    // Prevent an unhandled 'error' event from crashing the test process.
    stream.on('error', () => {});
    stream.destroy(new Error('boom'));

    const source = createPcm16StreamSource({ stream, sampleRate: 16_000, channels: 1 });
    await expect(source.start(() => {})).rejects.toThrow('boom');
  });
});
