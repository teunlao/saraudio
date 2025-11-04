export type RecorderFrameEncoding = 'pcm16';

export interface RecorderFormatOptions {
  /** Target sample rate for normalized frames (Hz). */
  sampleRate?: number;
  /** Target channel layout. Currently mono (1) is supported. */
  channels?: 1 | 2;
  /** Output encoding for normalized frames. */
  encoding?: RecorderFrameEncoding;
}
