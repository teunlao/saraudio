import type {
  Recorder,
  StreamStatus,
  TranscriptionProvider,
  TranscriptionStream,
  TranscriptResult,
  Transport,
} from '@saraudio/core';

import type { Logger } from '@saraudio/utils';

export interface CreateTranscriptionOptions {
  provider: TranscriptionProvider;
  recorder?: Recorder;
  logger?: Logger;
  liveTransport?: 'auto' | 'ws' | 'http';
  flushOnSegmentEnd?: boolean;
  // httpClient?: HttpClient // YAGNI: добавим при первой HTTP интеграции
}

export interface TranscriptionController {
  readonly status: StreamStatus;
  readonly transport: Transport;
  readonly error: Error | null;
  readonly isConnected: boolean;
  connect(signal?: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
  clear(): void;
  forceEndpoint(): Promise<void>;
  onPartial(handler: (text: string) => void): () => void;
  onTranscript(handler: (result: TranscriptResult) => void): () => void;
  onError(handler: (error: Error) => void): () => void;
  onStatusChange(handler: (status: StreamStatus) => void): () => void;
  // Present only when controller created its own recorder in higher layers
  start?: () => Promise<void>;
  stop?: () => Promise<void>;
  recorder?: Recorder;
}

export function createTranscription(opts: CreateTranscriptionOptions): TranscriptionController {
  const { provider, recorder, logger } = opts;
  let status: StreamStatus = 'idle';
  let stream: TranscriptionStream | null = null;
  let lastError: Error | null = null;
  let connected = false;

  const partialSubs = new Set<(t: string) => void>();
  const transcriptSubs = new Set<(r: TranscriptResult) => void>();
  const errorSubs = new Set<(e: Error) => void>();
  const statusSubs = new Set<(s: StreamStatus) => void>();
  let unsubscribeRecorder: (() => void) | null = null;
  let unsubscribeStream: Array<() => void> = [];

  const setStatus = (next: StreamStatus): void => {
    if (status === next) return;
    status = next;
    statusSubs.forEach((h) => h(status));
  };

  const ensureStream = (): TranscriptionStream => {
    if (!stream) {
      stream = provider.stream();
    }
    return stream;
  };

  const connect = async (signal?: AbortSignal): Promise<void> => {
    try {
      setStatus('connecting');
      const stream = ensureStream();
      // wire stream events
      unsubscribeStream.push(
        stream.onTranscript((r: TranscriptResult) => transcriptSubs.forEach((h) => h(r))),
        stream.onError((e: Error) => {
          lastError = e;
          errorSubs.forEach((h) => h(e));
          setStatus('error');
        }),
        stream.onStatusChange((st: StreamStatus) => setStatus(st)),
      );
      if (stream.onPartial) {
        unsubscribeStream.push(stream.onPartial((t: string) => partialSubs.forEach((h) => h(t))));
      }
      await stream.connect(signal);
      // subscribe recorder frames
      if (recorder) {
        unsubscribeRecorder = recorder.subscribeFrames((frame) => stream.send(frame));
      }
      connected = true;
      setStatus('connected');
      logger?.debug('connected', { module: 'runtime-base', event: 'connect', providerId: provider.id });
    } catch (e) {
      lastError = e as Error;
      setStatus('error');
      if (lastError) {
        const err = lastError;
        errorSubs.forEach((h) => h(err));
      }
    }
  };

  const disconnect = async (): Promise<void> => {
    try {
      if (unsubscribeRecorder) {
        unsubscribeRecorder();
        unsubscribeRecorder = null;
      }
      if (stream) {
        await stream.disconnect();
      }
    } finally {
      unsubscribeStream.forEach((u) => u());
      unsubscribeStream = [];
      connected = false;
      setStatus('disconnected');
    }
  };

  const forceEndpoint = async (): Promise<void> => {
    const s = ensureStream();
    await s.forceEndpoint();
  };

  const clear = (): void => {
    // Minimal stub: higher layers can reset accumulators/partials if needed
  };

  return {
    get status() {
      return status;
    },
    get transport() {
      return provider.transport;
    },
    get error() {
      return lastError;
    },
    get isConnected() {
      return connected;
    },
    connect,
    disconnect,
    clear,
    forceEndpoint,
    onPartial: (h) => {
      partialSubs.add(h);
      return () => partialSubs.delete(h);
    },
    onTranscript: (h) => {
      transcriptSubs.add(h);
      return () => transcriptSubs.delete(h);
    },
    onError: (h) => {
      errorSubs.add(h);
      return () => errorSubs.delete(h);
    },
    onStatusChange: (h) => {
      statusSubs.add(h);
      return () => statusSubs.delete(h);
    },
    recorder,
  };
}
