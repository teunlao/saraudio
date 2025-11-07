import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserRuntime } from '../runtime';

afterEach(() => {
  delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
  delete (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode;
  delete (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer;
  delete (globalThis as { MediaStream?: unknown }).MediaStream;
  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    configurable: true,
    value: false,
  });
});

describe('createBrowserRuntime mode resolution', () => {
  it('falls back to AudioContext when worklet pipeline unsupported', () => {
    (globalThis as { SharedArrayBuffer?: unknown }).SharedArrayBuffer = undefined;
    Object.defineProperty(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: false,
    });

    class MockMediaRecorder {
      public state: 'inactive' | 'recording' | 'paused' = 'inactive';
      public ondataavailable: ((event: BlobEvent) => void) | null = null;
      public onerror: ((event: Event) => void) | null = null;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      start(_timeslice?: number) {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
      }
    }

    if (typeof MediaStream === 'undefined') {
      class MockMediaStream {
        getTracks(): MediaStreamTrack[] {
          return [];
        }
      }
      Object.defineProperty(globalThis, 'MediaStream', {
        configurable: true,
        value: MockMediaStream,
      });
    }

    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder;

    // New capability check relies on AudioContext and getUserMedia presence.
    if (typeof (globalThis as { AudioContext?: unknown }).AudioContext === 'undefined') {
      class FakeAudioContext {}
      Object.defineProperty(globalThis, 'AudioContext', {
        configurable: true,
        value: FakeAudioContext,
      });
    }
    if (typeof (globalThis as { navigator?: unknown }).navigator === 'undefined') {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
          mediaDevices: {
            getUserMedia: async () => ({ getTracks: () => [] }),
          },
        },
      });
    } else {
      const nav = (globalThis as { navigator: Navigator }).navigator;
      Object.defineProperty(nav, 'mediaDevices', {
        configurable: true,
        value: { ...(nav.mediaDevices ?? {}), getUserMedia: async () => ({ getTracks: () => [] }) },
      });
    }

    const onFallback = vi.fn();

    const runtime = createBrowserRuntime({
      mode: 'auto',
      onFallback,
    });

    const source = runtime.createMicrophoneSource();
    expect(source).toBeDefined();
    expect(onFallback).toHaveBeenCalledWith('worklet-unsupported');
  });
});
