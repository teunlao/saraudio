import type { TranscriptionProvider } from '@saraudio/core';
import { createRecorderStub } from '@saraudio/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTranscription } from './transcription';

describe('runtime-node/transcription', () => {
  let mockProvider: TranscriptionProvider;

  beforeEach(() => {
    mockProvider = {
      id: 'test-provider',
      capabilities: {
        partials: 'mutable',
        words: false,
        diarization: 'none',
        language: 'none',
        segments: false,
        forceEndpoint: true,
        multichannel: false,
      },
      getPreferredFormat: vi.fn(() => ({ sampleRate: 16000, encoding: 'pcm16' as const, channels: 1 as const })),
      getSupportedFormats: vi.fn(() => [{ sampleRate: 16000, encoding: 'pcm16' as const, channels: 1 as const }]),
      update: vi.fn(async () => {}),
      onUpdate: vi.fn(() => vi.fn()),
      stream: vi.fn(() => ({
        status: 'idle' as const,
        connect: vi.fn(async () => {}),
        disconnect: vi.fn(async () => {}),
        send: vi.fn(),
        forceEndpoint: vi.fn(async () => {}),
        onTranscript: vi.fn(() => vi.fn()),
        onPartial: vi.fn(() => vi.fn()),
        onError: vi.fn(() => vi.fn()),
        onStatusChange: vi.fn(() => vi.fn()),
      })),
    };
  });

  it('creates controller with provider and recorder', () => {
    const recorder = createRecorderStub();
    const controller = createTranscription({ provider: mockProvider, recorder });

    expect(controller).toBeDefined();
    expect(controller.status).toBe('idle');
  });

  it('creates controller without recorder', () => {
    const controller = createTranscription({ provider: mockProvider });

    expect(controller).toBeDefined();
    expect(controller.status).toBe('idle');
  });

  it('creates debug logger when logger: true', () => {
    const controller = createTranscription({ provider: mockProvider, logger: true });

    expect(controller).toBeDefined();
  });

  it('creates logger with specified level', () => {
    const controller = createTranscription({ provider: mockProvider, logger: 'info' });

    expect(controller).toBeDefined();
  });

  it('accepts custom logger instance', () => {
    const customLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(() => customLogger),
    };

    const controller = createTranscription({ provider: mockProvider, logger: customLogger });

    expect(controller).toBeDefined();
  });

  it('works without logger', () => {
    const controller = createTranscription({ provider: mockProvider });

    expect(controller).toBeDefined();
  });
});
