import type { Logger } from '@saraudio/utils';
import { downmixToMono, float32ToInt16, int16ToFloat32, resampleLinear } from '@saraudio/utils';
import type { RecorderFormatOptions } from './format';
import type { Frame } from './types';

export interface NormalizeFrameOptions {
  format?: RecorderFormatOptions;
  logger?: Pick<Logger, 'warn'>;
}

export const cloneFrame = (frame: Frame): Frame => ({
  pcm: frame.pcm instanceof Int16Array ? new Int16Array(frame.pcm) : new Float32Array(frame.pcm),
  tsMs: frame.tsMs,
  sampleRate: frame.sampleRate,
  channels: frame.channels,
});

const splitInterleavedChannels = (data: Float32Array, channels: number): Float32Array[] => {
  if (channels <= 1) return [data];
  const frameCount = Math.floor(data.length / channels);
  const views: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch += 1) {
    const channel = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i += 1) {
      channel[i] = data[i * channels + ch] ?? 0;
    }
    views.push(channel);
  }
  return views;
};

export const normalizeFrame = (frame: Frame, options: NormalizeFrameOptions = {}): Frame => {
  const { format, logger } = options;
  if (!format) {
    return cloneFrame(frame);
  }

  const requestedSampleRate = format.sampleRate;
  const requestedChannels = format.channels;
  const targetEncoding = format.encoding ?? 'pcm16';

  const needsResample = requestedSampleRate !== undefined && requestedSampleRate !== frame.sampleRate;
  const needsChannelAdjust = requestedChannels !== undefined && requestedChannels !== frame.channels;
  const needsEncodingConversion = targetEncoding !== 'pcm16' || !(frame.pcm instanceof Int16Array);

  if (!needsResample && !needsChannelAdjust && !needsEncodingConversion) {
    return cloneFrame(frame);
  }

  let currentChannels = frame.channels;
  let currentSampleRate = frame.sampleRate;
  let processed: Float32Array | null = null;
  let sourceFloat: Float32Array | null = null;

  const ensureSourceFloat = (): Float32Array => {
    if (sourceFloat) {
      return sourceFloat;
    }
    sourceFloat = frame.pcm instanceof Float32Array ? frame.pcm : int16ToFloat32(frame.pcm);
    return sourceFloat;
  };

  const currentData = (): Float32Array => {
    if (processed) {
      return processed;
    }
    return ensureSourceFloat();
  };

  if (requestedChannels === 1 && currentChannels > 1) {
    const channelViews = splitInterleavedChannels(currentData(), currentChannels);
    processed = downmixToMono(channelViews);
    currentChannels = 1;
  } else if (requestedChannels !== undefined && requestedChannels !== currentChannels) {
    logger?.warn('Requested channel count not available', {
      requested: requestedChannels,
      available: currentChannels,
    });
  }

  if (requestedSampleRate !== undefined && requestedSampleRate !== currentSampleRate) {
    const base = processed ?? currentData();
    processed = resampleLinear(base, currentSampleRate, requestedSampleRate);
    currentSampleRate = requestedSampleRate;
  }

  const floatData = processed ?? currentData();
  const pcm = targetEncoding === 'pcm16' ? float32ToInt16(floatData) : floatData;

  return {
    pcm,
    tsMs: frame.tsMs,
    sampleRate: currentSampleRate,
    channels: requestedChannels ?? currentChannels,
  };
};
