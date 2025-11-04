/**
 * Calculate frame duration in milliseconds.
 *
 * Formula: (samples / (sampleRate * channels)) * 1000
 *
 * @param samples - Number of samples in the buffer
 * @param sampleRate - Sample rate in Hz
 * @param channels - Number of channels (1 = mono, 2 = stereo)
 * @returns Duration in milliseconds
 *
 * @example
 * ```ts
 * frameDurationMs(320, 16000, 1); // 20ms (mono)
 * frameDurationMs(320, 16000, 2); // 10ms (stereo, 320 samples = 160 per channel)
 * ```
 */
export function frameDurationMs(samples: number, sampleRate: number, channels: number): number {
  const duration = (samples / (sampleRate * channels)) * 1000;
  return duration;
}
