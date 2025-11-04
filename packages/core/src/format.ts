export type RecorderFrameEncoding = 'pcm16';

// Map encoding → PCM array type. Extend this union when adding codecs.
export type PCMForEncoding<E extends RecorderFrameEncoding> = E extends 'pcm16' ? Int16Array : never;

export interface RecorderFormatOptions {
  /** Target sample rate for normalized frames (Hz). */
  sampleRate?: number;
  /** Target channel layout. Currently mono (1) is supported. */
  channels?: 1 | 2;
  /** Output encoding for normalized frames. */
  encoding?: RecorderFrameEncoding;
}

export interface NormalizedFrame<E extends RecorderFrameEncoding> {
  pcm: PCMForEncoding<E>;
  tsMs: number;
  sampleRate: number;
  channels: 1 | 2;
}

// Infer encoding type from an options-like object
export type RecorderEncodingOf<T> = T extends { format?: { encoding?: infer E } }
  ? E extends RecorderFrameEncoding
    ? E
    : 'pcm16'
  : 'pcm16';
