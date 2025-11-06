// Barrel file: export public API only, no implementation here.
export type {
  DeepgramLanguage,
  DeepgramLanguageForModel,
  DeepgramModelDefinition,
  DeepgramModelId,
} from './models';

export {
  DEEPGRAM_MODEL_DEFINITIONS,
  isLanguageSupported,
  SUPPORTED_FORMATS,
} from './models';
export { deepgram } from './provider';
export type { DeepgramOptions, DeepgramOptions as DeepgramProviderOptions, DeepgramProvider } from './types';
