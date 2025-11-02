import type { Logger } from '@saraudio/utils';
import type { BrowserFrameSource } from '../types';

export interface WorkletSourceConfig {
  constraints?: MediaStreamConstraints['audio'] | MediaTrackConstraints;
  ringBufferFrames: number; // preferred frame size emitted from the processor
  logger: Logger;
  onStream?: (stream: MediaStream | null) => void;
}

// AudioWorklet processor loaded via Blob URL with SharedArrayBuffer ring buffer.
// Processor downmixes to mono Int16 and writes to SAB; main thread reads on 'ready' event.
function createMicProcessorUrl(): string {
  const code = `
class SaraudioMicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.frameSize = Math.max(128, Number(opts.frameSize || 1024));
    // Shared ring buffers from main thread
    this._state = new Int32Array(opts.stateSAB); // [writeIdx, readIdx]
    this._data = new Int16Array(opts.dataSAB);
    this._capacity = this._data.length;
    this._sinceNotify = 0;
  }
  static get parameterDescriptors() { return []; }
  process(inputs) {
    // inputs: [[Float32Array channel0, channel1, ...]]
    const input = inputs && inputs[0] ? inputs[0] : [];
    if (!input || input.length === 0) {
      return true;
    }
    // Downmix to mono, quantize to Int16, write to ring buffer
    const chCount = input.length;
    const ch0 = input[0];
    const frames = ch0 ? ch0.length : 0;
    if (frames === 0) return true;
    let w = Atomics.load(this._state, 0);
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let ch = 0; ch < chCount; ch++) {
        const c = input[ch];
        sum += c ? (c[i] || 0) : 0;
      }
      const mono = chCount > 0 ? sum / chCount : 0;
      let v = mono;
      if (!Number.isFinite(v)) v = 0;
      const q = v < -1 ? -1 : v > 1 ? 1 : v;
      this._data[w] = q < 0 ? Math.round(q * 32768) : Math.round(q * 32767);
      w += 1;
      if (w >= this._capacity) w = 0;
      this._sinceNotify += 1;
      if (this._sinceNotify >= this.frameSize) {
        Atomics.store(this._state, 0, w);
        this._sinceNotify = 0;
        this.port.postMessage({ type: 'ready' });
      }
    }
    // Update writeIdx at least once per quantum
    Atomics.store(this._state, 0, w);
    return true;
  }
}
registerProcessor('saraudio-mic', SaraudioMicProcessor);
`;
  const blob = new Blob([code], { type: 'text/javascript' });
  return URL.createObjectURL(blob);
}

export const createWorkletMicrophoneSource = (config: WorkletSourceConfig): BrowserFrameSource => {
  let mediaStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let sinkNode: GainNode | null = null;
  let isActive = false;
  let baseTs = 0;
  let samplesConsumed = 0;
  let lifecycleToken = 0;

  const stopStream = (): void => {
    if (mediaStream) {
      config.onStream?.(null);
      const tracks = mediaStream.getTracks();
      for (let i = 0; i < tracks.length; i += 1) tracks[i].stop();
    }
    mediaStream = null;
  };

  const closeContext = async (): Promise<void> => {
    if (!audioContext) return;
    try {
      await audioContext.close();
    } catch (error) {
      config.logger.warn('AudioContext close error (worklet)', { error });
    }
    audioContext = null;
  };

  const start: BrowserFrameSource['start'] = async (onFrame) => {
    if (isActive) return;
    console.log('start');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('mediaDevices.getUserMedia is not available in this environment');
    }
    const token = lifecycleToken + 1;
    baseTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    samplesConsumed = 0;

    const constraints: MediaStreamConstraints = {
      audio: config.constraints ?? true,
      video: false,
    };
    config.logger.info('requesting media stream (worklet)', { constraints });

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    config.onStream?.(mediaStream);

    audioContext = new AudioContext();
    sourceNode = audioContext.createMediaStreamSource(mediaStream);

    // Load processor module
    const url = createMicProcessorUrl();
    try {
      await audioContext.audioWorklet.addModule(url);
    } finally {
      // Revoke blob URL after addModule resolves/rejects
      URL.revokeObjectURL(url);
    }

    // Prepare SAB ring buffer: Int16 samples + state indices
    const frameSize = Math.max(128, config.ringBufferFrames);
    const capacityFrames = frameSize * 8;
    const capacitySamples = capacityFrames;
    const stateSAB = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    const dataSAB = new SharedArrayBuffer(Int16Array.BYTES_PER_ELEMENT * capacitySamples);
    const state = new Int32Array(stateSAB); // [writeIdx, readIdx]
    const data = new Int16Array(dataSAB);
    state[0] = 0; // write
    state[1] = 0; // read

    workletNode = new AudioWorkletNode(audioContext, 'saraudio-mic', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: { frameSize, stateSAB, dataSAB },
    });
    sinkNode = audioContext.createGain();
    sinkNode.gain.value = 0; // mute

    // Wire graph: source -> worklet -> sink -> destination
    sourceNode.connect(workletNode);
    workletNode.connect(sinkNode);
    sinkNode.connect(audioContext.destination);

    // Commit lifecycle
    lifecycleToken = token;
    isActive = true;

    // Read from SAB on 'ready' signal
    workletNode.port.onmessage = (ev: MessageEvent): void => {
      if (!isActive || lifecycleToken !== token) return;
      const msg = ev.data as { type?: string };
      if (!msg || msg.type !== 'ready') return;
      const ctx = audioContext;
      const sampleRate = ctx ? ctx.sampleRate : 48000;

      let r = Atomics.load(state, 1);
      const capacity = data.length;
      // Drain available samples in frameSize batches
      while (true) {
        const wNow = Atomics.load(state, 0);
        const avail = (wNow - r + capacity) % capacity;
        if (avail < frameSize) break;
        const end = Math.min(r + frameSize, capacity);
        const firstLen = end - r;
        const out = new Int16Array(frameSize);
        out.set(data.subarray(r, end), 0);
        if (firstLen < frameSize) {
          const rest = frameSize - firstLen;
          out.set(data.subarray(0, rest), firstLen);
          r = rest;
        } else {
          r = (r + frameSize) % capacity;
        }
        Atomics.store(state, 1, r);

        const tsMs = baseTs + (samplesConsumed / sampleRate) * 1000;
        samplesConsumed += frameSize;

        onFrame({ pcm: out, tsMs, sampleRate, channels: 1 });
      }
    };

    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (error) {
        config.logger.warn('AudioContext resume failed (worklet)', { error });
      }
    }
  };

  const stop: BrowserFrameSource['stop'] = async () => {
    if (!isActive) return;
    isActive = false;
    lifecycleToken += 1;

    try {
      workletNode?.port?.close?.();
    } catch {}
    try {
      if (workletNode) workletNode.disconnect();
      if (sourceNode) sourceNode.disconnect();
      if (sinkNode) sinkNode.disconnect();
    } catch {}
    workletNode = null;
    sourceNode = null;
    sinkNode = null;

    stopStream();
    await closeContext();
  };

  return { start, stop };
};
