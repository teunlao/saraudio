import { ref } from 'vue';

// Minimal Deepgram Realtime client for demo purposes.
// Sends mono PCM16 @ 16kHz frames over WebSocket and parses partial/final transcripts.
export function useDeepgramRealtime() {
  const status = ref<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle');
  const error = ref<string | null>(null);
  const partial = ref<string>('');
  const finalLines = ref<string[]>([]);
  const model = ref<string>('nova-2');
  // Debug/state: expose last close details and a small rolling log to surface issues in UI
  const lastClose = ref<{ code: number; reason: string; wasClean: boolean } | null>(null);
  const log = ref<string[]>([]); // keep short list of last 50 events

  let ws: WebSocket | null = null;

  // Very small, CPU-cheap resampler for demo:
  // - If src=48000 -> 16000: average each 3 samples
  // - Otherwise: linear interpolation accumulator from src -> 16000
  // Returns Int16Array mono @16kHz
  function to16kMonoInt16(pcm: Int16Array, srcRate: number): Int16Array {
    if (srcRate === 16000) return new Int16Array(pcm); // already fine
    if (srcRate === 48000) {
      const out = new Int16Array(Math.floor(pcm.length / 3));
      for (let i = 0, j = 0; j < out.length; j += 1, i += 3) {
        const a = pcm[i] ?? 0;
        const b = pcm[i + 1] ?? 0;
        const c = pcm[i + 2] ?? 0;
        out[j] = (a + b + c) / 3;
      }
      return out;
    }
    // Generic linear resample
    const ratio = 16000 / srcRate;
    const outLen = Math.floor(pcm.length * ratio);
    const out = new Int16Array(outLen);
    for (let j = 0; j < outLen; j += 1) {
      const t = j / ratio; // source index (float)
      const i = Math.floor(t);
      const frac = t - i;
      const s0 = pcm[i] ?? 0;
      const s1 = pcm[i + 1] ?? s0;
      out[j] = s0 + (s1 - s0) * frac;
    }
    return out;
  }

  function connect(): void {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    const config = useRuntimeConfig();
    const apiKey = config.public.deepgramApiKey;

    if (!apiKey || typeof apiKey !== 'string') {
      status.value = 'error';
      error.value = 'Missing Deepgram API key (NUXT_PUBLIC_DEEPGRAM_API_KEY)';
      console.error('[deepgram]', error.value);
      return;
    }

    // Build URL with query config to avoid extra config messages.
    const params = new URLSearchParams({
      model: model.value,
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      punctuate: 'true',
      interim_results: 'true',
    });
    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    status.value = 'connecting';
    error.value = null;
    partial.value = '';
    finalLines.value = [];
    lastClose.value = null;
    log.value.unshift(`[ws] connecting to ${url}`);
    if (log.value.length > 50) log.value.length = 50;

    // Attempt protocol auth first, then fallback to query token if needed.
    try {
      ws = new WebSocket(url, ['token', apiKey.trim()]);
    } catch {
      // Fallback: query auth supported by Deepgram (token query param)
      ws = new WebSocket(`${url}&token=${encodeURIComponent(apiKey)}`);
    }

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      status.value = 'open';
      const msg = `[ws] open protocol=${ws?.protocol ?? ''}`;
      console.log('[deepgram]', msg);
      log.value.unshift(msg);
      if (log.value.length > 50) log.value.length = 50;
    };
    ws.onerror = (ev) => {
      status.value = 'error';
      error.value = 'WebSocket error';
      console.warn('[deepgram] ws error', ev);
      log.value.unshift(`[ws] error`);
      if (log.value.length > 50) log.value.length = 50;
    };
    ws.onclose = (ev) => {
      status.value = 'closed';
      const info = { code: ev.code, reason: ev.reason, wasClean: ev.wasClean };
      lastClose.value = info;
      console.warn('[deepgram] ws close', info);
      const msg = `[ws] close code=${info.code} reason=${info.reason || '-'} clean=${info.wasClean}`;
      log.value.unshift(msg);
      if (log.value.length > 50) log.value.length = 50;
      if (!error.value) error.value = `WS closed (${info.code}) ${info.reason || ''}`.trim();
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      try {
        const raw = JSON.parse(ev.data) as unknown;
        type Alt = { transcript?: string };
        type Chan = { alternatives?: Alt[] };
        type DG = { is_final?: boolean; channel?: Chan };
        const msg = raw as DG;
        const transcript = msg.channel?.alternatives?.[0]?.transcript ?? '';
        const isFinal = Boolean(msg.is_final);
        if (typeof transcript === 'string') {
          if (isFinal) {
            const t = transcript.trim();
            if (t.length > 0) finalLines.value.push(t);
            partial.value = '';
          } else {
            partial.value = transcript;
          }
        }
      } catch {
        // ignore parse errors
      }
    };
  }

  function close(): void {
    if (ws) {
      try {
        ws.close();
      } catch {}
      ws = null;
    }
    status.value = 'closed';
  }

  function sendPcm16(pcm: Int16Array, sampleRate: number): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const resampled = to16kMonoInt16(pcm, sampleRate);
    // Deepgram expects raw little-endian PCM16 frames as binary
    ws.send(resampled.buffer);
  }

  return {
    status,
    error,
    partial,
    finalLines,
    model,
    lastClose,
    log,
    connect,
    close,
    sendPcm16,
  };
}
