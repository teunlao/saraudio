import type { RecorderFormatOptions } from '@saraudio/core';

export const NOVA3_LANGUAGES = [
  'multi',
  'en',
  'en-US',
  'en-AU',
  'en-GB',
  'en-IN',
  'en-NZ',
  'es',
  'es-419',
  'fr',
  'fr-CA',
  'de',
  'nl',
  'sv',
  'sv-SE',
  'da',
  'da-DK',
  'pt',
  'pt-BR',
  'pt-PT',
  'it',
  'tr',
  'no',
  'id',
  'hi',
  'ru',
  'ja',
  'zh',
  'zh-CN',
  'zh-TW',
  'ko',
  'ko-KR',
  'hu',
  'pl',
  'uk',
  'fi',
  'cs',
  'bg',
  'vi',
] as const;

export const NOVA3_MEDICAL_LANGUAGES = ['en', 'en-US', 'en-AU', 'en-CA', 'en-GB', 'en-IE', 'en-IN', 'en-NZ'] as const;

export const FLUX_LANGUAGES = ['en'] as const;

export const NOVA2_LANGUAGES = [
  'multi',
  'en',
  'en-US',
  'en-AU',
  'en-GB',
  'en-NZ',
  'en-IN',
  'es',
  'es-419',
  'fr',
  'fr-CA',
  'de',
  'de-CH',
  'pt',
  'pt-BR',
  'pt-PT',
  'it',
  'id',
  'hi',
  'ru',
  'ja',
  'ko',
  'ko-KR',
  'da',
  'da-DK',
  'nl',
  'nl-BE',
  'sv',
  'sv-SE',
  'no',
  'fi',
  'et',
  'lv',
  'lt',
  'pl',
  'cs',
  'sk',
  'hu',
  'bg',
  'ro',
  'uk',
  'tr',
  'th',
  'th-TH',
  'vi',
  'ms',
  'zh',
  'zh-CN',
  'zh-Hans',
  'zh-TW',
  'zh-Hant',
  'zh-HK',
  'ca',
] as const;

export const ENGLISH_ONLY_LANGUAGES = ['en', 'en-US'] as const;

export const DEEPGRAM_MODEL_DEFINITIONS = {
  'nova-3': {
    label: 'Nova-3',
    languages: NOVA3_LANGUAGES,
  },
  'nova-3-general': {
    label: 'Nova-3 General',
    languages: NOVA3_LANGUAGES,
  },
  'nova-3-medical': {
    label: 'Nova-3 Medical',
    languages: NOVA3_MEDICAL_LANGUAGES,
  },
  'flux-general-en': {
    label: 'Flux General (Conversation)',
    languages: FLUX_LANGUAGES,
  },
  'nova-2': {
    label: 'Nova-2',
    languages: NOVA2_LANGUAGES,
  },
  'nova-2-general': {
    label: 'Nova-2 General',
    languages: NOVA2_LANGUAGES,
  },
  'nova-2-medical': {
    label: 'Nova-2 Medical',
    languages: ENGLISH_ONLY_LANGUAGES,
  },
  'nova-2-phonecall': {
    label: 'Nova-2 Phonecall',
    languages: ENGLISH_ONLY_LANGUAGES,
  },
  'nova-2-meeting': {
    label: 'Nova-2 Meeting',
    languages: ENGLISH_ONLY_LANGUAGES,
  },
  'nova-2-finance': {
    label: 'Nova-2 Finance',
    languages: ENGLISH_ONLY_LANGUAGES,
  },
  'nova-2-conversationalai': {
    label: 'Nova-2 Conversational AI',
    languages: ENGLISH_ONLY_LANGUAGES,
  },
  'nova-2-voicemail': {
    label: 'Nova-2 Voicemail',
    languages: ENGLISH_ONLY_LANGUAGES,
  },
  'nova-2-video': {
    label: 'Nova-2 Video',
    languages: ENGLISH_ONLY_LANGUAGES,
  },
  'nova-2-drivethru': {
    label: 'Nova-2 Drive Thru',
    languages: ENGLISH_ONLY_LANGUAGES,
  },
  'nova-2-automotive': {
    label: 'Nova-2 Automotive',
    languages: ENGLISH_ONLY_LANGUAGES,
  },
  'nova-2-atc': {
    label: 'Nova-2 ATC',
    languages: ENGLISH_ONLY_LANGUAGES,
  },
} as const;

export type DeepgramModelId = keyof typeof DEEPGRAM_MODEL_DEFINITIONS;
export type DeepgramModelDefinition<M extends DeepgramModelId> = (typeof DEEPGRAM_MODEL_DEFINITIONS)[M];
export type DeepgramLanguageForModel<M extends DeepgramModelId> = DeepgramModelDefinition<M>['languages'][number];
export type DeepgramLanguage = { [M in DeepgramModelId]: DeepgramLanguageForModel<M> }[DeepgramModelId];

export const SUPPORTED_FORMATS: ReadonlyArray<RecorderFormatOptions> = [
  { sampleRate: 8_000, channels: 1, encoding: 'pcm16' },
  { sampleRate: 8_000, channels: 2, encoding: 'pcm16' },
  { sampleRate: 16_000, channels: 1, encoding: 'pcm16' },
  { sampleRate: 16_000, channels: 2, encoding: 'pcm16' },
  { sampleRate: 22_050, channels: 1, encoding: 'pcm16' },
  { sampleRate: 22_050, channels: 2, encoding: 'pcm16' },
  { sampleRate: 44_100, channels: 1, encoding: 'pcm16' },
  { sampleRate: 44_100, channels: 2, encoding: 'pcm16' },
  { sampleRate: 48_000, channels: 1, encoding: 'pcm16' },
  { sampleRate: 48_000, channels: 2, encoding: 'pcm16' },
];

export function isLanguageSupported<M extends DeepgramModelId>(
  model: M,
  language: string,
): language is DeepgramLanguageForModel<M> {
  const definition = DEEPGRAM_MODEL_DEFINITIONS[model];
  return (definition.languages as readonly string[]).includes(language);
}
