export interface CapabilitySnapshot {
  audioWorklet: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  mediaRecorder: boolean; // legacy alias retained for API mode name
  audioContext: boolean;
  getUserMedia: boolean;
}

export const snapshotCapabilities = (): CapabilitySnapshot => ({
  audioWorklet: typeof AudioWorkletNode !== 'undefined' && typeof AudioWorkletNode === 'function',
  sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
  crossOriginIsolated:
    typeof window !== 'undefined' && 'crossOriginIsolated' in window ? Boolean(window.crossOriginIsolated) : false,
  mediaRecorder: typeof MediaRecorder !== 'undefined',
  audioContext: typeof AudioContext !== 'undefined',
  getUserMedia: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
});

export const supportsWorkletPipeline = (snapshot: CapabilitySnapshot): boolean =>
  snapshot.crossOriginIsolated && snapshot.sharedArrayBuffer && snapshot.audioWorklet;

// Historically called "MediaRecorder" pipeline; actual implementation uses AudioContext + ScriptProcessor.
export const supportsMediaRecorderPipeline = (snapshot: CapabilitySnapshot): boolean =>
  snapshot.audioContext && snapshot.getUserMedia;
