import { join } from 'node:path';
import type { Segment } from '@saraudio/core';
import { createEnergyVadController } from '@saraudio/vad-energy';
import { describe, expect, it } from 'vitest';
import { createNodeRuntime } from '../runtime';

const fixturePath = join(__dirname, '../../testdata/galileo-16k-5s.pcm');

describe('node runtime with real PCM', () => {
  it('produces segment events for galileo sample', async () => {
    const runtime = createNodeRuntime();
    const pipeline = runtime.createPipeline({
      stages: [createEnergyVadController({ thresholdDb: -46, smoothMs: 15 })],
      segmenter: { preRollMs: 80, hangoverMs: 120 },
    });

    const events: Array<{ event: string; payload: unknown }> = [];
    pipeline.events.on('speechStart', (payload) => events.push({ event: 'speechStart', payload }));
    pipeline.events.on('speechEnd', (payload) => events.push({ event: 'speechEnd', payload }));
    pipeline.events.on('segment', (payload) => events.push({ event: 'segment', payload }));

    const source = runtime.createPcm16FileSource({
      path: fixturePath,
      sampleRate: 16000,
      channels: 1,
      frameSize: 160,
    });

    await runtime.run({ source, pipeline });
    pipeline.dispose();

    const segments = events.filter((entry) => entry.event === 'segment');
    expect(segments.length).toBeGreaterThan(0);

    const segment = segments[0]?.payload as Segment;
    expect(segment.durationMs).toBeGreaterThan(500);
    expect(segment.pcm?.length ?? 0).toBeGreaterThan(0);
  });
});
