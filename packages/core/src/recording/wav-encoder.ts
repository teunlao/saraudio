import type { Segment } from '../types';

// Minimal WAV (PCM16 LE) encoder. No floating-point support here by design.
// Produces a Uint8Array with RIFF/WAVE header followed by PCM16 interleaved data.
export interface WavEncodeOptions {
  sampleRate: number;
  channels: number; // 1 or 2 (mono supported in this project)
}

export const encodeWavPcm16 = (pcm: Int16Array, opts: WavEncodeOptions): Uint8Array => {
  const { sampleRate, channels } = opts;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  let offset = 0;

  // RIFF chunk descriptor
  writeString(view, offset, 'RIFF');
  offset += 4;
  view.setUint32(offset, totalSize - 8, true); // ChunkSize
  offset += 4;
  writeString(view, offset, 'WAVE');
  offset += 4;

  // fmt sub-chunk
  writeString(view, offset, 'fmt ');
  offset += 4;
  view.setUint32(offset, 16, true); // Subchunk1Size (PCM)
  offset += 4;
  view.setUint16(offset, 1, true); // AudioFormat = 1 (PCM)
  offset += 2;
  view.setUint16(offset, channels, true); // NumChannels
  offset += 2;
  view.setUint32(offset, sampleRate, true); // SampleRate
  offset += 4;
  view.setUint32(offset, byteRate, true); // ByteRate
  offset += 4;
  view.setUint16(offset, blockAlign, true); // BlockAlign
  offset += 2;
  view.setUint16(offset, 16, true); // BitsPerSample
  offset += 2;

  // data sub-chunk
  writeString(view, offset, 'data');
  offset += 4;
  view.setUint32(offset, dataSize, true);
  offset += 4;

  // PCM samples
  const out = new Int16Array(buffer, headerSize, pcm.length);
  out.set(pcm);

  return new Uint8Array(buffer);
};

const writeString = (view: DataView, offset: number, str: string): void => {
  for (let i = 0; i < str.length; i += 1) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
};

// Convenience: build a WAV from a Segment's PCM if present
export const segmentToWav = (segment: Segment): Uint8Array | null => {
  if (!segment.pcm) return null;
  return encodeWavPcm16(segment.pcm, { sampleRate: segment.sampleRate, channels: segment.channels });
};
