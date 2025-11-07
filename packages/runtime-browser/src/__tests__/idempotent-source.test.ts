import { noopLogger } from '@saraudio/utils';
import { describe, expect, it, vi } from 'vitest';
import { createAudioContextSource } from '../sources/audio-context-source';

// Type definitions for test stubs
interface FakeAudioBuffer {
  length: number;
  numberOfChannels: number;
  getChannelData: (channel: number) => Float32Array;
}

interface FakeAudioProcessingEvent {
  inputBuffer: FakeAudioBuffer;
  playbackTime: number;
}

interface FakeMediaStreamTrack {
  label: string;
  getSettings: () => { channelCount: number; sampleRate: number };
  stop: () => void;
}

interface FakeMediaStream {
  getAudioTracks: () => FakeMediaStreamTrack[];
  getTracks: () => Array<{ stop: () => void }>;
}

// Minimal stubs for browser APIs
class FakeScriptProcessorNode {
  onaudioprocess: ((event: FakeAudioProcessingEvent) => void) | null = null;
  constructor(
    public readonly bufferSize: number,
    public readonly inputChannels: number,
    public readonly outputChannels: number,
  ) {}
  connect() {}
  disconnect() {}
  emitFrame(sample: number = 0) {
    const length = this.bufferSize;
    const numberOfChannels = this.inputChannels;
    const channels: Float32Array[] = Array.from({ length: numberOfChannels }, () =>
      new Float32Array(length).fill(sample),
    );
    const inputBuffer: FakeAudioBuffer = {
      length,
      numberOfChannels,
      getChannelData: (i: number) => {
        const channel = channels[i];
        if (!channel) throw new Error(`Channel ${i} not found`);
        return channel;
      },
    };
    this.onaudioprocess?.({ inputBuffer, playbackTime: 0 });
  }
}

class FakeMediaStreamAudioSourceNode {
  constructor(
    public readonly context: FakeAudioContext,
    public channelCount: number,
  ) {}
  connect() {}
  disconnect() {}
}

class FakeGainNode {
  public gain = { value: 0 } as const;
  connect() {}
  disconnect() {}
}

declare global {
  var __lastAudioContext: FakeAudioContext | undefined;
}

class FakeAudioContext {
  public state: 'running' | 'suspended' = 'running';
  public sampleRate = 16000;
  public destination = {};
  public lastProcessor: FakeScriptProcessorNode | null = null;
  constructor() {
    globalThis.__lastAudioContext = this;
  }
  async resume() {}
  async close() {}
  createMediaStreamSource(_stream: FakeMediaStream) {
    return new FakeMediaStreamAudioSourceNode(this, 2);
  }
  createScriptProcessor(frameSize: number, input: number, output: number) {
    const node = new FakeScriptProcessorNode(frameSize, input, output);
    this.lastProcessor = node;
    return node as unknown as ScriptProcessorNode;
  }
  createGain() {
    return new FakeGainNode() as unknown as GainNode;
  }
}

// assign globals for test environment
(globalThis as unknown as { AudioContext: typeof FakeAudioContext }).AudioContext = FakeAudioContext;

// navigator.mediaDevices stub (minimal, but with required members)
(globalThis as unknown as { navigator: Navigator }).navigator = {
  mediaDevices: {
    async getUserMedia() {
      return {
        getAudioTracks: () => [
          {
            label: 'Fake Mic',
            getSettings: () => ({ channelCount: 2, sampleRate: 16000 }),
            stop: vi.fn(),
          },
        ],
        getTracks: () => [
          {
            stop: vi.fn(),
          },
        ],
      } as FakeMediaStream;
    },
    async enumerateDevices() {
      return [] as MediaDeviceInfo[];
    },
    getSupportedConstraints() {
      return {} as MediaTrackSupportedConstraints;
    },
    addEventListener() {},
    removeEventListener() {},
    async getDisplayMedia() {
      return {} as MediaStream;
    },
  } as unknown as MediaDevices,
} as unknown as Navigator;

describe('audio-context-source idempotent start/stop', () => {
  it('start() and stop() are idempotent and ignore late frames', async () => {
    const source = createAudioContextSource({ logger: noopLogger });

    // First start should succeed
    await expect(source.start(() => void 0)).resolves.toBeUndefined();

    // Second start should not throw (idempotent)
    await expect(source.start(() => void 0)).resolves.toBeUndefined();

    // First stop should succeed
    await expect(source.stop()).resolves.toBeUndefined();

    // Second stop should not throw (idempotent)
    await expect(source.stop()).resolves.toBeUndefined();

    // After stop, emit frame from last processor — should be ignored without throwing
    const ac = globalThis.__lastAudioContext;
    expect(() => ac?.lastProcessor?.emitFrame(0.1)).not.toThrow();
  });
});
