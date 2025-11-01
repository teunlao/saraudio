import { describe, expect, it } from 'vitest';
import { encodeWavPcm16, segmentToWav } from './wav-encoder';

const dv = (buf: ArrayBufferLike) => new DataView(buf);

describe('encodeWavPcm16', () => {
  it('encodes minimal PCM16 mono with correct RIFF/WAVE header', () => {
    const pcm = new Int16Array([0, 1, -1, 32767, -32768]);
    const sr = 16000;
    const ch = 1;

    const bytes = encodeWavPcm16(pcm, { sampleRate: sr, channels: ch });
    expect(bytes.byteLength).toBe(44 + pcm.length * 2);

    const view = dv(bytes.buffer);
    // RIFF
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe('WAVE');
    // fmt chunk
    expect(String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15))).toBe(
      'fmt ',
    );
    expect(view.getUint32(16, true)).toBe(16); // PCM
    expect(view.getUint16(20, true)).toBe(1); // AudioFormat PCM
    expect(view.getUint16(22, true)).toBe(ch);
    expect(view.getUint32(24, true)).toBe(sr);
    const blockAlign = view.getUint16(32, true);
    expect(blockAlign).toBe(ch * 2);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    // data
    expect(String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39))).toBe(
      'data',
    );
    expect(view.getUint32(40, true)).toBe(pcm.length * 2);

    // Verify sample payload (little-endian 16-bit)
    const base = 44;
    const decoded: number[] = [];
    for (let i = 0; i < pcm.length; i += 1) {
      decoded.push(view.getInt16(base + i * 2, true));
    }
    expect(decoded).toEqual(Array.from(pcm));
  });

  it('segmentToWav returns null when segment.pcm missing', () => {
    const wav = segmentToWav({
      id: 'x',
      startMs: 0,
      endMs: 10,
      durationMs: 10,
      sampleRate: 16000,
      channels: 1,
      // pcm: undefined
    } as const);
    expect(wav).toBeNull();
  });

  it('handles zero-length PCM (header only, data size 0)', () => {
    const empty = new Int16Array([]);
    const bytes = encodeWavPcm16(empty, { sampleRate: 16000, channels: 1 });
    const view = dv(bytes.buffer);
    expect(view.getUint32(40, true)).toBe(0);
    expect(bytes.byteLength).toBe(44);
  });

  it('writes correct header for stereo (channels=2)', () => {
    const pcm = new Int16Array(8); // 4 stereo frames
    const sr = 44100;
    const bytes = encodeWavPcm16(pcm, { sampleRate: sr, channels: 2 });
    const view = dv(bytes.buffer);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint16(32, true)).toBe(4); // blockAlign = 4 (2ch * 2 bytes)
    expect(view.getUint32(28, true)).toBe(sr * 4); // byteRate = sr * blockAlign
  });

  it('chunk size equals totalSize - 8', () => {
    const pcm = new Int16Array(10);
    const bytes = encodeWavPcm16(pcm, { sampleRate: 16000, channels: 1 });
    const view = dv(bytes.buffer);
    const chunkSize = view.getUint32(4, true);
    expect(chunkSize).toBe(bytes.byteLength - 8);
  });

  it('"fmt " and "data" markers are ASCII correct', () => {
    const pcm = new Int16Array(2);
    const bytes = encodeWavPcm16(pcm, { sampleRate: 22050, channels: 1 });
    const view = dv(bytes.buffer);
    const fmt = [12, 13, 14, 15].map((i) => String.fromCharCode(view.getUint8(i))).join('');
    const data = [36, 37, 38, 39].map((i) => String.fromCharCode(view.getUint8(i))).join('');
    expect(fmt).toBe('fmt ');
    expect(data).toBe('data');
  });

  it('data length equals pcm.length * 2 bytes', () => {
    const pcm = new Int16Array(123);
    const bytes = encodeWavPcm16(pcm, { sampleRate: 48000, channels: 1 });
    const view = dv(bytes.buffer);
    expect(view.getUint32(40, true)).toBe(123 * 2);
    expect(bytes.byteLength).toBe(44 + 123 * 2);
  });

  it('respects provided sampleRate and channels from segmentToWav', () => {
    const wav = segmentToWav({
      id: 's1',
      startMs: 0,
      endMs: 10,
      durationMs: 10,
      sampleRate: 48000,
      channels: 2,
      pcm: new Int16Array(20),
    });
    expect(wav).not.toBeNull();
    const view = dv((wav as Uint8Array).buffer);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(22, true)).toBe(2);
  });

  it('bits per sample must be 16 and AudioFormat PCM=1', () => {
    const wav = encodeWavPcm16(new Int16Array(4), { sampleRate: 16000, channels: 1 });
    const view = dv(wav.buffer);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
  });

  it('header size always 44 bytes', () => {
    const wav1 = encodeWavPcm16(new Int16Array(0), { sampleRate: 16000, channels: 1 });
    const wav2 = encodeWavPcm16(new Int16Array(100), { sampleRate: 16000, channels: 1 });
    expect(wav1.byteLength - 0).toBe(44);
    expect(wav2.byteLength - 200).toBe(44);
  });
});
