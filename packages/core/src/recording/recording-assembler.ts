import { float32ToInt16 } from '@saraudio/utils';
import type { Frame, Segment } from '../types';

// Simple PCM16 chunk accumulator with duration helpers
class PCM16Assembler {
  private readonly chunks: Int16Array[] = [];
  private samples = 0;
  private _sampleRate = 0;
  private _channels = 0;

  ensureFormat(sampleRate: number, channels: number): void {
    if (this._sampleRate === 0) this._sampleRate = sampleRate;
    if (this._channels === 0) this._channels = channels;
    // Defensive: if format changes mid-stream, prefer first seen values
  }

  append(samples: Int16Array): void {
    this.chunks.push(new Int16Array(samples));
    this.samples += samples.length;
  }

  appendSilence(length: number): void {
    if (length <= 0) return;
    this.chunks.push(new Int16Array(length));
    this.samples += length;
  }

  get totalSamples(): number {
    return this.samples;
  }

  get sampleRate(): number {
    return this._sampleRate;
  }

  get channels(): number {
    return this._channels;
  }

  get durationMs(): number {
    if (this._sampleRate === 0 || this._channels === 0) return 0;
    const frames = this.samples / this._channels;
    return (frames / this._sampleRate) * 1000;
  }

  toInt16(): Int16Array {
    if (this.chunks.length === 1) return new Int16Array(this.chunks[0]);
    const out = new Int16Array(this.samples);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

export interface RecordingAssemblerOptions {
  // When true, accumulate the full stream (raw frames)
  collectFull?: boolean;
  // When true, accumulate speech-masked stream (frame-length zeros in silence)
  collectMasked?: boolean;
  // When true, concatenate emitted segments into cleaned stream
  collectCleaned?: boolean;
}

export interface RecordingMeta {
  sessionDurationMs: number;
  cleanedDurationMs: number;
}

export class RecordingAssembler {
  private readonly full?: PCM16Assembler;
  private readonly masked?: PCM16Assembler;
  private readonly cleaned?: PCM16Assembler;

  private sessionStartMs: number | null = null;
  private sessionEndMs: number | null = null;
  private segmentActive = false;

  constructor(opts: RecordingAssemblerOptions = {}) {
    this.full = opts.collectFull ? new PCM16Assembler() : undefined;
    this.masked = opts.collectMasked ? new PCM16Assembler() : undefined;
    this.cleaned = opts.collectCleaned ? new PCM16Assembler() : undefined;
  }

  begin(startMs: number): void {
    if (this.sessionStartMs === null) this.sessionStartMs = startMs;
  }

  end(endMs: number): void {
    this.sessionEndMs = endMs;
  }

  onSpeechStart(): void {
    this.segmentActive = true;
  }

  onSpeechEnd(): void {
    this.segmentActive = false;
  }

  onSegment(segment: Segment): void {
    if (!this.cleaned || !segment.pcm) return;
    this.cleaned.ensureFormat(segment.sampleRate, segment.channels);
    this.cleaned.append(segment.pcm);
  }

  onFrame(frame: Frame): void {
    const pcm = frame.pcm instanceof Int16Array ? frame.pcm : float32ToInt16(frame.pcm);

    // Track session bounds
    if (this.sessionStartMs === null) this.sessionStartMs = frame.tsMs;
    this.sessionEndMs = frame.tsMs;

    if (this.full) {
      this.full.ensureFormat(frame.sampleRate, frame.channels);
      this.full.append(pcm);
    }
    if (this.masked) {
      this.masked.ensureFormat(frame.sampleRate, frame.channels);
      if (this.segmentActive) {
        this.masked.append(pcm);
      } else {
        this.masked.appendSilence(pcm.length);
      }
    }
  }

  get meta(): RecordingMeta {
    const sessionDurationMs =
      this.sessionStartMs !== null && this.sessionEndMs !== null
        ? Math.max(0, this.sessionEndMs - this.sessionStartMs)
        : 0;
    const cleanedDurationMs = this.cleaned?.durationMs ?? 0;
    return { sessionDurationMs, cleanedDurationMs };
  }

  getCleaned(): { pcm: Int16Array; sampleRate: number; channels: number } | null {
    if (!this.cleaned) return null;
    return {
      pcm: this.cleaned.toInt16(),
      sampleRate: this.cleaned.sampleRate,
      channels: this.cleaned.channels,
    };
  }

  getFull(): { pcm: Int16Array; sampleRate: number; channels: number } | null {
    if (!this.full) return null;
    return {
      pcm: this.full.toInt16(),
      sampleRate: this.full.sampleRate,
      channels: this.full.channels,
    };
  }

  getMasked(): { pcm: Int16Array; sampleRate: number; channels: number } | null {
    if (!this.masked) return null;
    return {
      pcm: this.masked.toInt16(),
      sampleRate: this.masked.sampleRate,
      channels: this.masked.channels,
    };
  }
}
