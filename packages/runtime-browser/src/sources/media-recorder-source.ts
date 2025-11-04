import type { Logger } from '@saraudio/utils';
import { downmixToMono, float32ToInt16 } from '@saraudio/utils';
import type { BrowserFrameSource } from '../types';

export interface MediaRecorderSourceConfig {
  constraints?: MediaStreamConstraints['audio'] | MediaTrackConstraints;
  frameSize?: number;
  logger: Logger;
  onStream?: (stream: MediaStream | null) => void;
}

export const createMediaRecorderSource = (config: MediaRecorderSourceConfig): BrowserFrameSource => {
  let mediaStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let processorNode: ScriptProcessorNode | null = null;
  let sinkNode: GainNode | null = null;
  let isActive = false;
  let startTimestamp = 0;
  let basePlaybackTime: number | null = null;
  let frameCount = 0;
  let lifecycleToken = 0; // invalidates callbacks across start/stop cycles

  const stopStream = () => {
    if (mediaStream) {
      config.onStream?.(null);
      for (const track of mediaStream.getTracks()) {
        track.stop();
      }
    }
    mediaStream = null;
  };

  const closeAudioContext = async () => {
    if (audioContext) {
      try {
        await audioContext.close();
      } catch (error) {
        config.logger.warn('AudioContext close error', { error });
      }
    }
    audioContext = null;
  };

  const start: BrowserFrameSource['start'] = async (onFrame) => {
    if (isActive) {
      // Idempotent: already started → noop
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('mediaDevices.getUserMedia is not available in this environment');
    }

    const token = lifecycleToken + 1; // tentative token for this start
    startTimestamp = performance.now();
    basePlaybackTime = null;

    const constraints: MediaStreamConstraints = {
      audio: config.constraints ?? true,
      video: false,
    };

    config.logger.info('requesting media stream', { constraints });

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      // Ensure clean state on failure
      isActive = false;
      basePlaybackTime = null;
      frameCount = 0;
      throw error instanceof Error ? error : new Error(String(error));
    }
    const track = mediaStream.getAudioTracks()[0];
    const settings = track?.getSettings();

    config.logger.info('media stream acquired', () => ({
      trackSettings: settings ?? null,
      trackLabel: track?.label ?? 'unknown',
    }));

    // Check for constraints mismatch
    const requestedConstraints = typeof config.constraints === 'object' ? config.constraints : {};
    if (settings && typeof settings.channelCount === 'number' && settings.channelCount !== 1) {
      config.logger.warn('Stereo input detected — downmixing to mono', {
        requested: (requestedConstraints as MediaTrackConstraints).channelCount ?? 'unspecified',
        actual: settings.channelCount,
      });
    }
    if (
      settings &&
      typeof settings.sampleRate === 'number' &&
      typeof (requestedConstraints as MediaTrackConstraints).sampleRate === 'number' &&
      settings.sampleRate !== (requestedConstraints as MediaTrackConstraints).sampleRate
    ) {
      config.logger.warn('Sample rate mismatch', {
        requested: (requestedConstraints as MediaTrackConstraints).sampleRate,
        actual: settings.sampleRate,
      });
    }

    config.onStream?.(mediaStream);
    audioContext = new AudioContext();
    sourceNode = audioContext.createMediaStreamSource(mediaStream);

    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (resumeError) {
        config.logger.warn('AudioContext resume failed', { error: resumeError });
      }
    }

    const channels = sourceNode.channelCount;
    const frameSize = Math.max(256, config.frameSize ?? 1024);
    processorNode = audioContext.createScriptProcessor(frameSize, channels, channels);
    sinkNode = audioContext.createGain();
    sinkNode.gain.value = 0;

    config.logger.info('processor started', {
      sampleRate: audioContext.sampleRate,
      channels,
      frameSize,
    });

    // Commit start: mark as active and publish token
    lifecycleToken = token;
    isActive = true;

    processorNode.onaudioprocess = (event) => {
      // Ignore late callbacks from previous lifecycle
      if (token !== lifecycleToken || !isActive) return;
      if (!isActive) {
        return;
      }

      const input = event.inputBuffer;
      const frameLength = input.length;
      const channelCount = input.numberOfChannels;
      const context = audioContext;
      if (!context) {
        return;
      }

      // Collect channel views and downmix to mono
      const views: Float32Array[] = [];
      for (let ch = 0; ch < channelCount; ch += 1) {
        views.push(input.getChannelData(ch));
      }
      const mono = downmixToMono(views);

      const pcm = float32ToInt16(mono);
      const playbackTime = event.playbackTime;
      if (basePlaybackTime === null) {
        basePlaybackTime = playbackTime;
        config.logger.debug('first frame baseline set', { playbackTime });
      }
      const relativeSeconds = playbackTime - (basePlaybackTime ?? playbackTime);
      const tsMs = startTimestamp + relativeSeconds * 1000;

      frameCount += 1;
      if (frameCount <= 10 || frameCount % 50 === 0) {
        config.logger.debug('frame captured', () => ({
          frameCount,
          frameLength,
          inputChannels: channelCount,
          deliveredChannels: 1,
          sampleRate: context.sampleRate,
          tsMs,
          firstSample: pcm[0] ?? 0,
        }));
      }

      onFrame({
        pcm,
        tsMs,
        sampleRate: context.sampleRate,
        channels: 1,
      });
    };

    sourceNode.connect(processorNode);
    processorNode.connect(sinkNode);
    sinkNode.connect(audioContext.destination);
  };

  const stop: BrowserFrameSource['stop'] = async () => {
    if (!isActive) {
      // Idempotent: already stopped → noop
      return;
    }
    isActive = false;
    lifecycleToken += 1; // invalidate any pending callbacks

    config.logger.info('stopping processor');

    if (processorNode) {
      processorNode.onaudioprocess = null;
      processorNode.disconnect();
    }
    if (sourceNode) {
      sourceNode.disconnect();
    }
    if (sinkNode) {
      sinkNode.disconnect();
      sinkNode = null;
    }
    processorNode = null;
    sourceNode = null;
    stopStream();
    await closeAudioContext();
    basePlaybackTime = null;
    frameCount = 0;

    config.logger.info('processor stopped');
  };

  return {
    start,
    stop,
  };
};
