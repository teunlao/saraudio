import { describe, expect, it } from 'vitest';
import { RecordingAssembler } from './recording-assembler';

const sr = 16000;
const ch = 1 as const;

const i16 = (value: number, len: number): Int16Array => new Int16Array(Array.from({ length: len }, () => value));
const f32 = (arr: number[]): Float32Array => new Float32Array(arr);

describe('RecordingAssembler', () => {
  it('accumulates full from Int16 frames and computes duration', () => {
    const ra = new RecordingAssembler({ collectFull: true });
    // 2 frames × 160 samples (10ms each at 16kHz)
    ra.onFrame({ pcm: i16(1000, 160), tsMs: 1000, sampleRate: sr, channels: ch });
    ra.onFrame({ pcm: i16(2000, 160), tsMs: 1010, sampleRate: sr, channels: ch });

    const full = ra.getFull();
    expect(full).not.toBeNull();
    expect(full?.pcm.length).toBe(320);
    // ~20ms total
    expect(Math.round(((full?.pcm.length ?? 0) / ch / sr) * 1000)).toBe(20);
  });

  it('masks silence when not in speech section', () => {
    const ra = new RecordingAssembler({ collectFull: true, collectMasked: true });
    // frame 1: silence
    ra.onFrame({ pcm: i16(1, 4), tsMs: 0, sampleRate: sr, channels: ch });
    // speech starts
    ra.onSpeechStart();
    // frame 2: speech
    ra.onFrame({ pcm: i16(2, 4), tsMs: 1, sampleRate: sr, channels: ch });
    // speech ends
    ra.onSpeechEnd();
    // frame 3: silence
    ra.onFrame({ pcm: i16(3, 4), tsMs: 2, sampleRate: sr, channels: ch });

    const masked = ra.getMasked();
    expect(masked).not.toBeNull();
    // masked = [0,0,0,0, 2,2,2,2, 0,0,0,0]
    const expected = new Int16Array([0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 0]);
    expect(Array.from(masked?.pcm ?? new Int16Array())).toEqual(Array.from(expected));
  });

  it('concatenates cleaned from segments and reports meta', () => {
    const ra = new RecordingAssembler({ collectCleaned: true });
    ra.begin(1000);
    // two segments of total 5 samples
    ra.onSegment({ id: 'a', startMs: 1100, endMs: 1110, durationMs: 10, sampleRate: sr, channels: ch, pcm: i16(5, 3) });
    ra.onSegment({ id: 'b', startMs: 1200, endMs: 1210, durationMs: 10, sampleRate: sr, channels: ch, pcm: i16(6, 2) });
    ra.end(3500);

    const cleaned = ra.getCleaned();
    expect(cleaned).not.toBeNull();
    expect(cleaned?.pcm.length).toBe(5);

    const meta = ra.meta;
    expect(meta.sessionDurationMs).toBe(2500);
    // ~5 samples at 16kHz ~ 0.3125 ms (round to 0/1)
    expect(Math.round(meta.cleanedDurationMs)).toBe(Math.round((5 / sr) * 1000));
  });

  it('converts Float32 frames to Int16 internally', () => {
    const ra = new RecordingAssembler({ collectFull: true });
    ra.onFrame({ pcm: f32([-1, -0.5, 0, 0.5, 1]), tsMs: 0, sampleRate: sr, channels: ch });
    const full = ra.getFull();
    expect(full).not.toBeNull();
    // Expected mapping: [-32768, -16384, 0, 16383, 32767]
    expect(Array.from(full?.pcm ?? new Int16Array())).toEqual([-32768, -16384, 0, 16383, 32767]);
  });

  it('clamps Float32 beyond [-1,1] range', () => {
    const ra = new RecordingAssembler({ collectFull: true });
    ra.onFrame({ pcm: f32([-2, 2]), tsMs: 0, sampleRate: sr, channels: ch });
    const full = ra.getFull();
    expect(full).not.toBeNull();
    expect(Array.from(full?.pcm ?? new Int16Array())).toEqual([-32768, 32767]);
  });

  it('keeps first seen format when later frames change sampleRate/channels', () => {
    const ra = new RecordingAssembler({ collectFull: true });
    ra.onFrame({ pcm: i16(1, 10), tsMs: 0, sampleRate: 16000, channels: 1 });
    ra.onFrame({ pcm: i16(2, 10), tsMs: 10, sampleRate: 44100, channels: 2 });
    const full = ra.getFull();
    expect(full).not.toBeNull();
    expect(full?.sampleRate).toBe(16000);
    expect(full?.channels).toBe(1);
  });

  it('meta without explicit end() uses last frame timestamp', () => {
    const ra = new RecordingAssembler({ collectFull: true });
    ra.onFrame({ pcm: i16(0, 4), tsMs: 100, sampleRate: sr, channels: ch });
    ra.onFrame({ pcm: i16(0, 4), tsMs: 140, sampleRate: sr, channels: ch });
    // no end()
    const meta = ra.meta;
    expect(meta.sessionDurationMs).toBe(40);
  });

  it('begin() earlier than first frame sets session start', () => {
    const ra = new RecordingAssembler({ collectFull: true });
    ra.begin(50);
    ra.onFrame({ pcm: i16(0, 4), tsMs: 100, sampleRate: sr, channels: ch });
    ra.onFrame({ pcm: i16(0, 4), tsMs: 130, sampleRate: sr, channels: ch });
    ra.end(200);
    const meta = ra.meta;
    expect(meta.sessionDurationMs).toBe(150); // 200 - 50
  });

  it('subsequent begin() calls do not override earliest start', () => {
    const ra = new RecordingAssembler({ collectFull: true });
    ra.begin(100);
    ra.begin(200);
    ra.onFrame({ pcm: i16(0, 2), tsMs: 300, sampleRate: sr, channels: ch });
    ra.end(400);
    expect(ra.meta.sessionDurationMs).toBe(300); // 400 - 100
  });

  it('returns null when collector is disabled', () => {
    const ra = new RecordingAssembler({ collectCleaned: false, collectFull: false, collectMasked: false });
    ra.onFrame({ pcm: i16(1, 2), tsMs: 0, sampleRate: sr, channels: ch });
    ra.onSegment({ id: 'x', startMs: 0, endMs: 10, durationMs: 10, sampleRate: sr, channels: ch, pcm: i16(2, 2) });
    expect(ra.getCleaned()).toBeNull();
    expect(ra.getFull()).toBeNull();
    expect(ra.getMasked()).toBeNull();
  });

  it('cleaned concatenates segments in correct order', () => {
    const ra = new RecordingAssembler({ collectCleaned: true });
    ra.onSegment({ id: 'a', startMs: 0, endMs: 5, durationMs: 5, sampleRate: sr, channels: ch, pcm: i16(1, 2) });
    ra.onSegment({ id: 'b', startMs: 5, endMs: 10, durationMs: 5, sampleRate: sr, channels: ch, pcm: i16(2, 3) });
    const cleaned = ra.getCleaned();
    expect(cleaned).not.toBeNull();
    expect(Array.from(cleaned?.pcm ?? new Int16Array())).toEqual([1, 1, 2, 2, 2]);
  });

  it('masked length equals full length by samples; silence becomes zeros', () => {
    const ra = new RecordingAssembler({ collectFull: true, collectMasked: true });
    ra.onFrame({ pcm: i16(9, 3), tsMs: 0, sampleRate: sr, channels: ch }); // silence
    ra.onSpeechStart();
    ra.onFrame({ pcm: i16(8, 2), tsMs: 1, sampleRate: sr, channels: ch }); // speech
    ra.onSpeechEnd();
    ra.onFrame({ pcm: i16(7, 1), tsMs: 2, sampleRate: sr, channels: ch }); // silence
    const full = ra.getFull();
    const masked = ra.getMasked();
    expect(full).not.toBeNull();
    expect(masked).not.toBeNull();
    expect(masked?.pcm.length).toBe(full?.pcm.length);
    expect(Array.from(masked?.pcm ?? new Int16Array())).toEqual([0, 0, 0, 8, 8, 0]);
  });

  it('meta.cleanedDurationMs matches cleaned PCM length', () => {
    const ra = new RecordingAssembler({ collectCleaned: true });
    ra.onSegment({ id: 's', startMs: 0, endMs: 10, durationMs: 10, sampleRate: sr, channels: ch, pcm: i16(0, 160) });
    const cleaned = ra.getCleaned();
    expect(cleaned).not.toBeNull();
    const expectedMs = ((cleaned?.pcm.length ?? 0) / sr) * 1000;
    expect(Math.round(ra.meta.cleanedDurationMs)).toBe(Math.round(expectedMs));
  });
});
