import type { NodeFrameSource } from '../../types';
import type { MicrophoneSourceOptions, SystemAudioSourceOptions } from '../types';
import { loadCaptureDarwin } from './load-capture-darwin';

type SourceKind = 'mic' | 'system';

const createUnsupportedSource = (kind: SourceKind): NodeFrameSource => {
  return {
    async start(): Promise<void> {
      throw new Error(`@saraudio/capture-node: ${kind} capture is not supported on ${process.platform} yet.`);
    },
    async stop(): Promise<void> {
      // no-op
    },
  };
};

const toKindLabel = (kind: SourceKind): string => {
  return kind === 'mic' ? 'microphone' : 'system audio';
};

export const createProxySource = (
  kind: SourceKind,
  options: MicrophoneSourceOptions | SystemAudioSourceOptions,
): NodeFrameSource => {
  if (process.platform !== 'darwin') return createUnsupportedSource(kind);

  let inner: NodeFrameSource | null = null;
  let stopping: Promise<void> | null = null;

  return {
    async start(onFrame): Promise<void> {
      if (inner) return;

      const captureDarwin = await loadCaptureDarwin();
      inner =
        kind === 'mic'
          ? captureDarwin.createMicrophoneSource(options as MicrophoneSourceOptions)
          : captureDarwin.createSystemAudioSource(options as SystemAudioSourceOptions);

      try {
        await inner.start(onFrame);
      } catch (error) {
        inner = null;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to start ${toKindLabel(kind)} capture.\n${message}`);
      }
    },
    async stop(): Promise<void> {
      if (stopping) return stopping;
      if (!inner) return;

      stopping = inner
        .stop()
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Failed to stop ${toKindLabel(kind)} capture.\n${message}`);
        })
        .finally(() => {
          inner = null;
          stopping = null;
        });

      return stopping;
    },
  };
};
