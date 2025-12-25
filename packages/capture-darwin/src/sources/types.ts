import type { Logger } from '@saraudio/utils';

export interface BaseCaptureSourceOptions {
  /**
   * Override path to the packaged capture binary.
   * Intended for development/testing only.
   */
  binaryPath?: string;
  /**
   * Frame size in samples (per channel). Default: 160 (10ms @ 16kHz).
   */
  frameSize?: number;
  /**
   * Optional logger.
   */
  logger?: Logger;
}

export type SystemAudioSourceOptions = BaseCaptureSourceOptions;

export type MicrophoneSourceOptions = BaseCaptureSourceOptions;
