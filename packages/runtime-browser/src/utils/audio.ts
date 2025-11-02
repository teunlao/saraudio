import type { Segment } from '@saraudio/core';

export interface AudioBufferOptionsLike {
  sampleRate: number;
  channels: number;
}

// Convert interleaved Int16 PCM to an AudioBuffer using the provided AudioContext.
export function int16InterleavedToAudioBuffer(
  ctx: AudioContext,
  pcm: Int16Array,
  opts: AudioBufferOptionsLike,
): AudioBuffer {
  const channels = Math.max(1, Math.floor(opts.channels));
  const frames = Math.floor(pcm.length / channels);
  const buffer = ctx.createBuffer(channels, frames, opts.sampleRate);

  // Deinterleave and convert to float32
  for (let ch = 0; ch < channels; ch += 1) {
    const out = buffer.getChannelData(ch);
    let i = 0;
    for (let f = ch; f < pcm.length; f += channels) {
      out[i++] = (pcm[f] ?? 0) / 32768;
    }
  }

  return buffer;
}

export function segmentToAudioBuffer(ctx: AudioContext, segment: Segment): AudioBuffer | null {
  if (!segment.pcm || segment.pcm.length === 0) return null;
  const channels = Math.max(1, Math.floor(segment.channels));
  return int16InterleavedToAudioBuffer(ctx, segment.pcm, {
    sampleRate: segment.sampleRate,
    channels,
  });
}
