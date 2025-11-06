import type { ProviderCapabilities } from '@saraudio/core';

export const CAPABILITIES: ProviderCapabilities = {
  partials: 'mutable',
  words: true,
  diarization: 'word',
  language: 'final',
  segments: true,
  forceEndpoint: false,
  multichannel: true,
  translation: 'none',
};
