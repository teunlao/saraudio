import type { RecorderFormatOptions } from '../format';
import type { ProviderCapabilities, TranscriptionProvider, TranscriptionStream } from '../transcription/types';

export interface TranscriptionProviderStubOptions {
  id?: string;
  transport?: 'websocket' | 'http';
  capabilities?: Partial<ProviderCapabilities>;
  preferredFormat?: RecorderFormatOptions;
}

/**
 * Creates a transcription provider stub for testing purposes.
 * Provides full TranscriptionProvider interface without test framework dependencies.
 *
 * @example
 * ```ts
 * const provider = createTranscriptionProviderStub();
 * const stream = provider.stream();
 *
 * // If you need vi.fn() - wrap yourself:
 * provider.stream = vi.fn(provider.stream);
 * ```
 */
export function createTranscriptionProviderStub(options: TranscriptionProviderStubOptions = {}): TranscriptionProvider {
  const capabilities: ProviderCapabilities = {
    partials: options.capabilities?.partials ?? 'mutable',
    words: options.capabilities?.words ?? true,
    diarization: options.capabilities?.diarization ?? 'word',
    language: options.capabilities?.language ?? 'final',
    segments: options.capabilities?.segments ?? true,
    forceEndpoint: options.capabilities?.forceEndpoint ?? false,
    multichannel: options.capabilities?.multichannel ?? true,
  };

  const preferredFormat: RecorderFormatOptions = options.preferredFormat ?? {
    sampleRate: 16000,
    channels: 1,
    encoding: 'pcm16',
  };

  const provider: TranscriptionProvider = {
    id: options.id ?? 'test-provider',
    transport: options.transport ?? 'websocket',
    capabilities,
    getPreferredFormat: () => preferredFormat,
    getSupportedFormats: () => [preferredFormat],
    stream: (): TranscriptionStream => {
      throw new Error('stream() not implemented in stub - override this method');
    },
  };

  return provider;
}
