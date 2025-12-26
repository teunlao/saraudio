import type { Readable } from 'node:stream';
import type { Frame } from '@saraudio/core';
import type { NodeFrameSource } from '../../types';

const PCM_BYTES_PER_SAMPLE = 2;

type PcmBuffer = ReturnType<typeof Buffer.alloc>;

const toInt16Frame = (buffer: PcmBuffer, sampleCount: number): Int16Array => {
  const output = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    output[i] = buffer.readInt16LE(i * PCM_BYTES_PER_SAMPLE);
  }
  return output;
};

const mergeBuffers = (existing: PcmBuffer, incoming: PcmBuffer): PcmBuffer => {
  if (existing.length === 0) return Buffer.from(incoming);
  return Buffer.from(Buffer.concat([existing, incoming]));
};

export interface Pcm16StreamSourceOptions {
  stream: Readable;
  sampleRate: number;
  channels: 1 | 2;
  frameSize?: number;
}

export const createPcm16StreamSource = (options: Pcm16StreamSourceOptions): NodeFrameSource => {
  const { stream, sampleRate, channels, frameSize = Math.floor(sampleRate / 100) } = options;

  if (frameSize <= 0) {
    throw new Error('frameSize must be greater than zero');
  }

  const frameSamples = frameSize * channels;
  const frameBytes = frameSamples * PCM_BYTES_PER_SAMPLE;
  const frameDurationMs = (frameSize / sampleRate) * 1000;

  let leftover: PcmBuffer = Buffer.alloc(0);
  let timestampMs = 0;
  let active = false;
  let resolveStart: (() => void) | null = null;
  let rejectStart: ((reason: Error) => void) | null = null;

  const cleanup = () => {
    stream.removeListener('data', handleData);
    stream.removeListener('end', handleEnd);
    stream.removeListener('close', handleClose);
    stream.removeListener('error', handleError);
  };

  const finalize = () => {
    if (!active) return;
    if (onFrameCallback) {
      const trailing = Buffer.alloc(frameBytes);
      const trailingFrames = 30;
      for (let i = 0; i < trailingFrames; i += 1) {
        emitFrame(trailing, onFrameCallback);
      }
    }
    active = false;
    cleanup();
    leftover = Buffer.alloc(0);
    onFrameCallback = null;
    resolveStart?.();
    resolveStart = null;
    rejectStart = null;
  };

  const fail = (error: Error) => {
    if (!active) return;
    active = false;
    cleanup();
    rejectStart?.(error);
    resolveStart = null;
    rejectStart = null;
  };

  const emitFrame = (chunk: PcmBuffer, onFrame: (frame: Frame) => void) => {
    const pcm = toInt16Frame(chunk, frameSamples);
    const frame: Frame = {
      pcm,
      tsMs: timestampMs,
      sampleRate,
      channels,
    };
    onFrame(frame);
    timestampMs += frameDurationMs;
  };

  const flushLeftover = (onFrame: (frame: Frame) => void) => {
    if (leftover.length === 0) return;
    const padded = Buffer.alloc(frameBytes);
    leftover.copy(padded);
    leftover = Buffer.alloc(0);
    emitFrame(padded, onFrame);
  };

  let onFrameCallback: ((frame: Frame) => void) | null = null;

  const handleData = (chunk: Buffer) => {
    if (!active || onFrameCallback === null) return;
    const normalizedChunk: PcmBuffer = Buffer.from(chunk);
    leftover = mergeBuffers(leftover, normalizedChunk);
    while (leftover.length >= frameBytes) {
      const frameBuffer: PcmBuffer = Buffer.from(leftover.slice(0, frameBytes));
      leftover = Buffer.from(leftover.slice(frameBytes));
      emitFrame(frameBuffer, onFrameCallback);
    }
  };

  const handleEnd = () => {
    if (onFrameCallback) {
      flushLeftover(onFrameCallback);
    }
    finalize();
  };

  const handleClose = () => {
    if (onFrameCallback) {
      flushLeftover(onFrameCallback);
    }
    finalize();
  };

  const handleError = (error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    fail(err);
  };

  return {
    async start(onFrame) {
      if (active) {
        throw new Error('PCM16 stream source already started');
      }
      active = true;
      leftover = Buffer.alloc(0);
      timestampMs = 0;
      onFrameCallback = onFrame;

      return new Promise<void>((resolve, reject) => {
        resolveStart = resolve;
        rejectStart = reject;

        stream.on('data', handleData);
        stream.once('end', handleEnd);
        stream.once('close', handleClose);
        stream.once('error', handleError);

        // If the underlying stream is already closed/errored (e.g. capture process exited
        // before we attached listeners), avoid hanging forever.
        if (stream.destroyed || stream.readableEnded) {
          const maybeError = stream.errored;
          if (maybeError instanceof Error) {
            handleError(maybeError);
            return;
          }
          handleError(new Error('PCM16 stream was closed before it could start'));
          return;
        }

        stream.resume();
      });
    },
    async stop() {
      if (!active) {
        cleanup();
        return;
      }
      active = false;
      cleanup();
      onFrameCallback = null;
      stream.pause();
      leftover = Buffer.alloc(0);
      resolveStart?.();
      resolveStart = null;
      rejectStart = null;
    },
  };
};
