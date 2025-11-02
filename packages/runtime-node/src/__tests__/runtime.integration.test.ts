import { Readable } from 'node:stream';
import type { Segment } from '@saraudio/core';
import { createEnergyVadController } from '@saraudio/vad-energy';
import { describe, expect, it } from 'vitest';
import { createNodeRuntime } from '../runtime';

const toFrameBuffer = (value: number, samples: number): Buffer => {
  const buffer = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    buffer.writeInt16LE(value, i * 2);
  }
  return buffer;
};

describe('createNodeRuntime', () => {
  it('processes PCM stream through VAD and segmenter', async () => {
    const sampleRate = 16000;
    const channels = 1;
    const frameSize = 160; // 10 ms frames
    const frameSamples = frameSize * channels;

    const buffers = [
      toFrameBuffer(0, frameSamples),
      toFrameBuffer(0, frameSamples),
      toFrameBuffer(12000, frameSamples),
      toFrameBuffer(11000, frameSamples),
      toFrameBuffer(9000, frameSamples),
      toFrameBuffer(0, frameSamples),
      toFrameBuffer(0, frameSamples),
      toFrameBuffer(0, frameSamples),
    ];

    const stream = Readable.from(buffers);

    const runtime = createNodeRuntime();
    const vadController = createEnergyVadController({ thresholdDb: -45, smoothMs: 5 });
    const pipeline = runtime.createPipeline({
      stages: [vadController],
      segmenter: { preRollMs: 40, hangoverMs: 40 },
    });

    const events: Array<{ event: string; payload: unknown }> = [];
    pipeline.events.on('speechStart', (payload) => events.push({ event: 'speechStart', payload }));
    pipeline.events.on('speechEnd', (payload) => events.push({ event: 'speechEnd', payload }));
    pipeline.events.on('segment', (payload) => events.push({ event: 'segment', payload }));

    const source = runtime.createPcm16StreamSource({
      stream,
      sampleRate,
      channels,
      frameSize,
    });

    await runtime.run({ source, pipeline });
    pipeline.dispose();

    const segments = events.filter((entry) => entry.event === 'segment');
    expect(segments).toHaveLength(1);

    const segment = segments[0]?.payload as Segment;
    expect(segment.durationMs).toBeGreaterThan(0);
    expect(segment.pcm?.length).toBeGreaterThan(0);
  });
});
