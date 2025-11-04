import { ref } from 'vue';

// Minimal Deepgram Realtime client for demo purposes.
// Sends mono PCM16 @ 16kHz frames over WebSocket and parses partial/final transcripts.
export function useDeepgramRealtime() {
  const status = ref<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle');
  const error = ref<string | null>(null);
  const partial = ref<string>('');
  const transcript = ref<string>('');
  const model = ref<string>('nova-2');
  // Debug/state: expose last close details and a small rolling log to surface issues in UI
  const lastClose = ref<{ code: number; reason: string; wasClean: boolean } | null>(null);
  const log = ref<string[]>([]); // keep short list of last 50 events

  let ws: WebSocket | null = null;
  let bytesSent = 0;
  let messagesReceived = 0;
  let audioChunksSent = 0;

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
    transcript.value = '';
    lastClose.value = null;
    bytesSent = 0;
    messagesReceived = 0;
    audioChunksSent = 0;
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
      console.log('[deepgram] ready to stream audio @ 16kHz mono PCM16');
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
      messagesReceived += 1;
      try {
        const raw = JSON.parse(ev.data) as unknown;
        type Alt = { transcript?: string };
        type Chan = { alternatives?: Alt[] };
        type DG = { is_final?: boolean; channel?: Chan; metadata?: { request_id?: string } };
        const msg = raw as DG;
        const text = msg.channel?.alternatives?.[0]?.transcript ?? '';
        const isFinal = Boolean(msg.is_final);

        console.log('[deepgram] ←', {
          type: isFinal ? 'FINAL' : 'PARTIAL',
          text,
          length: text.length,
          metadata: msg.metadata,
          raw: ev.data.slice(0, 200),
        });

        if (typeof text === 'string' && text.length > 0) {
          if (isFinal) {
            const trimmed = text.trim();
            if (trimmed.length > 0) {
              transcript.value = transcript.value ? `${transcript.value} ${trimmed}` : trimmed;
              console.log('[deepgram] final transcript updated:', trimmed);
            }
            partial.value = '';
          } else {
            partial.value = text;
          }
        }
      } catch (err) {
        console.warn('[deepgram] failed to parse message:', ev.data.slice(0, 100), err);
      }
    };
  }

  function close(): void {
    if (ws) {
      try {
        console.log('[deepgram] closing connection', {
          bytesSent,
          audioChunksSent,
          messagesReceived,
          totalKB: (bytesSent / 1024).toFixed(1),
        });
        ws.close();
      } catch {}
      ws = null;
    }
    status.value = 'closed';
  }

  function sendPcm16(pcm: Int16Array, sampleRate: number): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (sampleRate !== 16000) {
      console.warn('[deepgram] dropping frame: expected 16kHz PCM16', { sampleRate, samples: pcm.length });
      return;
    }

    const bytes = pcm.byteLength;
    bytesSent += bytes;
    audioChunksSent += 1;

    if (audioChunksSent % 50 === 0) {
      console.log('[deepgram] →', {
        chunks: audioChunksSent,
        totalBytes: bytesSent,
        totalKB: (bytesSent / 1024).toFixed(1),
        lastChunkBytes: bytes,
        lastChunkSamples: pcm.length,
        durationMs: ((pcm.length / 16000) * 1000).toFixed(0),
      });
    }

    const payload = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
    ws.send(payload);
  }

  const clear = (): void => {
    partial.value = '';
    transcript.value = '';
  };

  return {
    status,
    error,
    partial,
    transcript,
    model,
    lastClose,
    log,
    connect,
    close,
    clear,
    sendPcm16,
  };
}
