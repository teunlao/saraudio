import type {
  RecorderFormatOptions,
  StageController,
  StreamStatus,
  TranscriptionProvider,
  TranscriptResult,
  Transport,
} from '@saraudio/core';
import type { Recorder } from '@saraudio/runtime-browser';
import {
  type CreateTranscriptionOptions,
  createTranscription,
  type TranscriptionController,
} from '@saraudio/runtime-browser';
import type { Logger } from '@saraudio/utils';
import type { MaybeRefOrGetter, Ref } from 'vue';
import { onMounted, onUnmounted, ref, shallowRef, toValue, watch } from 'vue';

import type { UseRecorderResult } from './useRecorder';
import { useRecorder } from './useRecorder';

interface RetryOptions {
  enabled?: boolean;
  maxAttempts?: number;
  baseDelayMs?: number;
  factor?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
}

interface HttpChunkingOptions {
  intervalMs?: number;
  minDurationMs?: number;
  overlapMs?: number;
  maxInFlight?: number;
  timeoutMs?: number;
}

interface ConnectionOptions {
  ws?: {
    retry?: RetryOptions;
  };
  http?: {
    chunking?: HttpChunkingOptions;
  };
}

export interface UseTranscriptionOptions<P extends TranscriptionProvider = TranscriptionProvider> {
  provider: MaybeRefOrGetter<P>;
  recorder?: Recorder | UseRecorderResult;
  stages?: MaybeRefOrGetter<StageController[] | undefined>;
  autoConnect?: MaybeRefOrGetter<boolean | undefined>;
  logger?: boolean | 'error' | 'warn' | 'info' | 'debug' | Logger;
  preconnectBufferMs?: number;
  flushOnSegmentEnd?: boolean | { cooldownMs?: number };
  connection?: ConnectionOptions;
  onTranscript?: (result: TranscriptResult) => void;
  onError?: (error: Error) => void;
}

export interface UseTranscriptionResult<P extends TranscriptionProvider = TranscriptionProvider> {
  transcript: Ref<string>;
  partial: Ref<string>;
  status: Ref<StreamStatus>;
  error: Ref<Error | null>;
  isConnected: Ref<boolean>;
  transport: Transport;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clear: () => void;
  forceEndpoint: () => Promise<void>;
  provider: P;
  recorder: Ref<Recorder | null>;
  start?: () => Promise<void>;
  stop?: () => Promise<void>;
}

const ensureFormatEncoding = (format: RecorderFormatOptions): RecorderFormatOptions => {
  if (format.encoding === undefined) {
    return { ...format, encoding: 'pcm16' };
  }
  return format;
};

const isUseRecorderResult = (value: Recorder | UseRecorderResult): value is UseRecorderResult => {
  return typeof value === 'object' && value !== null && 'recorder' in value;
};

export function useTranscription<P extends TranscriptionProvider>(
  options: UseTranscriptionOptions<P>,
): UseTranscriptionResult<P> {
  const transcript = ref('');
  const partial = ref('');
  const status = ref<StreamStatus>('idle');
  const error = ref<Error | null>(null);
  const isConnected = ref(false);
  let provider = toValue(options.provider);
  let transport = provider.transport;

  const transcriptSegments: string[] = [];

  let internalRecorder: UseRecorderResult | null = null;
  let recorderRef: Ref<Recorder | null>;

  if (!options.recorder) {
    internalRecorder = useRecorder({ stages: options.stages });
    recorderRef = internalRecorder.recorder;
  } else if (isUseRecorderResult(options.recorder)) {
    recorderRef = options.recorder.recorder;
  } else {
    recorderRef = ref(options.recorder) as Ref<Recorder>;
  }

  const controllerRef = shallowRef<TranscriptionController<P> | null>(null);
  const unsubscribes: Array<() => void> = [];
  let formatApplied = false;
  let unsubscribeProviderUpdate = provider.onUpdate(() => {
    transport = provider.transport;
    formatApplied = false;
  });

  const waitForRecorder = async (): Promise<Recorder> => {
    if (recorderRef.value) {
      return recorderRef.value;
    }
    return await new Promise<Recorder>((resolve, reject) => {
      const stop = watch(
        recorderRef,
        (value) => {
          if (value) {
            stop();
            resolve(value);
          }
        },
        { immediate: true },
      );

      onUnmounted(() => {
        stop();
        reject(new Error('Recorder disposed before becoming available'));
      });
    });
  };

  const applyFormat = async (rec: Recorder): Promise<void> => {
    if (formatApplied) return;
    try {
      const preferred = provider.getPreferredFormat();
      const negotiated = provider.negotiateFormat ? provider.negotiateFormat(preferred) : preferred;
      const nextFormat = ensureFormatEncoding(negotiated);
      await rec.update({ format: nextFormat });
      formatApplied = true;
    } catch (err) {
      const resolved = err instanceof Error ? err : new Error(String(err));
      error.value = resolved;
      options.onError?.(resolved);
    }
  };

  const teardownSubscriptions = (): void => {
    if (unsubscribes.length === 0) return;
    for (const unsub of unsubscribes) {
      unsub();
    }
    unsubscribes.length = 0;
  };

  const setupSubscriptions = (controller: TranscriptionController<P>): void => {
    unsubscribes.push(
      controller.onTranscript((result) => {
        options.onTranscript?.(result);
        if (result.text && result.text.trim().length > 0) {
          transcriptSegments.push(result.text.trim());
          transcript.value = transcriptSegments.join(' ').trim();
        }
        partial.value = '';
      }),
    );

    if (controller.onPartial) {
      unsubscribes.push(
        controller.onPartial((text) => {
          if (transport === 'websocket') {
            partial.value = text;
          }
        }),
      );
    }

    unsubscribes.push(
      controller.onError((err) => {
        error.value = err;
        options.onError?.(err);
      }),
    );

    unsubscribes.push(
      controller.onStatusChange((next) => {
        status.value = next;
        isConnected.value = next === 'connected';
        if (next === 'disconnected') {
          partial.value = '';
        }
      }),
    );
  };

  const resolveFlushOnSegmentEnd = (): boolean => {
    const value = options.flushOnSegmentEnd;
    if (typeof value === 'object') return true;
    return Boolean(value);
  };

  const ensureController = async (): Promise<TranscriptionController<P>> => {
    if (controllerRef.value) {
      return controllerRef.value;
    }

    const recorder = await waitForRecorder();
    if (controllerRef.value) {
      return controllerRef.value;
    }
    await applyFormat(recorder);

    const controllerOptions: CreateTranscriptionOptions<P> = {
      provider,
      recorder,
      logger: options.logger,
      preconnectBufferMs: options.preconnectBufferMs,
      flushOnSegmentEnd: resolveFlushOnSegmentEnd(),
      chunking: options.connection?.http?.chunking,
      retry: options.connection?.ws?.retry,
    };

    const controller = createTranscription(controllerOptions);
    controllerRef.value = controller;
    transport = controller.transport;
    status.value = controller.status;
    isConnected.value = controller.isConnected;
    setupSubscriptions(controller);
    return controller;
  };

  // React to provider instance changes (ref/getter). We micro-batch to avoid churn.
  let providerSwapScheduled = false;
  let pendingProvider: P | null = null;
  const swapProvider = async (nextProvider: P): Promise<void> => {
    // Unsubscribe from old provider.update events
    unsubscribeProviderUpdate();
    provider = nextProvider;
    transport = provider.transport;
    formatApplied = false;
    unsubscribeProviderUpdate = provider.onUpdate(() => {
      transport = provider.transport;
      formatApplied = false;
    });

    // If there is an active controller, rebuild it for the new provider.
    const wasConnected = isConnected.value;
    const hadController = controllerRef.value !== null;
    if (hadController) {
      teardownSubscriptions();
      // best-effort disconnect; controller handles HTTP final flush internally
      await controllerRef.value?.disconnect();
      controllerRef.value = null;
    }
    if (wasConnected) {
      const controller = await ensureController();
      await controller.connect();
    }
  };

  if (typeof options.provider === 'function' || (typeof options.provider === 'object' && options.provider !== null)) {
    const stopWatch = watch(
      () => toValue(options.provider),
      (next) => {
        pendingProvider = next as P;
        if (!providerSwapScheduled) {
          providerSwapScheduled = true;
          queueMicrotask(() => {
            providerSwapScheduled = false;
            const target = pendingProvider ?? (next as P);
            pendingProvider = null;
            if (target !== provider) {
              void swapProvider(target);
            }
          });
        }
      },
      { immediate: false },
    );
    onUnmounted(() => {
      stopWatch();
    });
  }

  const connect = async (): Promise<void> => {
    const controller = await ensureController();
    await controller.connect();
  };

  const disconnect = async (): Promise<void> => {
    if (!controllerRef.value) return;
    await controllerRef.value.disconnect();
    partial.value = '';
  };

  const clear = (): void => {
    transcriptSegments.length = 0;
    transcript.value = '';
    partial.value = '';
    controllerRef.value?.clear();
  };

  const forceEndpoint = async (): Promise<void> => {
    const controller = await ensureController();
    await controller.forceEndpoint();
  };

  const autoConnectEnabled = () => Boolean(options.autoConnect && toValue(options.autoConnect));

  onMounted(() => {
    if (autoConnectEnabled()) {
      void connect();
      if (internalRecorder) {
        void internalRecorder.start().catch((err) => {
          const resolved = err instanceof Error ? err : new Error(String(err));
          error.value = resolved;
          options.onError?.(resolved);
        });
      }
    }
  });

  onUnmounted(() => {
    if (controllerRef.value) {
      void controllerRef.value.disconnect();
    }
    teardownSubscriptions();
    controllerRef.value = null;
    unsubscribeProviderUpdate();
  });

  const api: UseTranscriptionResult<P> = {
    transcript,
    partial,
    status,
    error,
    isConnected,
    transport,
    connect,
    disconnect,
    clear,
    forceEndpoint,
    provider,
    recorder: recorderRef,
    start: internalRecorder?.start,
    stop: internalRecorder?.stop,
  };

  Object.defineProperty(api, 'transport', {
    get: () => transport,
  });

  return api;
}
