import { describe, expect, it } from 'vitest';
import { frameDurationMs } from './frame-duration';

describe('frameDurationMs', () => {
  it('calculates duration for mono 16kHz frame (320 samples = 20ms)', () => {
    expect(frameDurationMs(320, 16000, 1)).toBe(20);
  });

  it('calculates duration for stereo frame (accounts for channels)', () => {
    // 320 samples / 2 channels = 160 samples per channel
    expect(frameDurationMs(320, 16000, 2)).toBe(10);
  });

  it('calculates duration for 48kHz frame', () => {
    // 10ms at 48kHz
    expect(frameDurationMs(480, 48000, 1)).toBe(10);
  });

  it('returns 0 for empty frame', () => {
    expect(frameDurationMs(0, 16000, 1)).toBe(0);
  });

  it('calculates duration for single sample', () => {
    // 1/16000 * 1000
    expect(frameDurationMs(1, 16000, 1)).toBeCloseTo(0.0625, 4);
  });

  it('calculates duration for 160 samples at 16kHz (10ms)', () => {
    expect(frameDurationMs(160, 16000, 1)).toBe(10);
  });

  it('calculates duration for stereo 48kHz', () => {
    // 10ms at 48kHz stereo = 480 samples/channel * 2
    expect(frameDurationMs(960, 48000, 2)).toBe(10);
  });

  it('handles 8kHz sample rate', () => {
    // 10ms at 8kHz
    expect(frameDurationMs(80, 8000, 1)).toBe(10);
  });

  it('calculates precise duration for fractional results', () => {
    // ~20.8125ms at 16kHz
    expect(frameDurationMs(333, 16000, 1)).toBeCloseTo(20.8125, 4);
  });

  it('handles large frames', () => {
    // 1 second at 16kHz
    expect(frameDurationMs(16000, 16000, 1)).toBe(1000);
  });
});
