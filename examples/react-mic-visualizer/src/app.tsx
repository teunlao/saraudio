import type { Segment } from '@saraudio/core';
import { meter } from '@saraudio/meter';
import { useAudioInputs, useSaraudio } from '@saraudio/react';
import type { RuntimeMode } from '@saraudio/runtime-browser';
import { buildAudioConstraints, segmentToAudioBuffer } from '@saraudio/runtime-browser';
import { vadEnergy } from '@saraudio/vad-energy';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const formatDuration = (ms: number): string => `${(ms / 1000).toFixed(2)} s`;

const formatTimestamp = (ms: number): string => `${(ms / 1000).toFixed(2)} s`;

const VADMeter = ({ score, speech }: { score: number; speech: boolean }) => {
  const percentage = Math.min(100, Math.max(0, Math.round(score * 100)));
  return (
    <div className='vad-meter'>
      <div className='vad-meter__bar' style={{ width: `${percentage}%` }} data-state={speech ? 'speech' : 'silence'} />
      <span className='vad-meter__label'>
        {speech ? 'Speech' : 'Silence'} · score {percentage.toString().padStart(2, '0')}%
      </span>
      <p className='sr-only' aria-live='polite'>
        Speech score {percentage}%
      </p>
    </div>
  );
};

const SegmentList = ({
  segments,
  onToggle,
  playingId,
}: {
  segments: readonly Segment[];
  onToggle: (s: Segment) => void;
  playingId: string | null;
}) => {
  if (segments.length === 0) {
    return <p className='placeholder'>Talk into the microphone to capture segments.</p>;
  }

  return (
    <ol className='segment-list'>
      {segments.map((segment) => (
        <li key={segment.id} className='segment-list__item'>
          <button
            type='button'
            className='play-button'
            title={playingId === segment.id ? 'Stop segment' : 'Play segment'}
            onClick={() => onToggle(segment)}
            aria-pressed={playingId === segment.id}
          >
            {playingId === segment.id ? '■' : '▶'}
          </button>
          <span className='segment-list__title'>#{segment.id.slice(0, 6).toUpperCase()}</span>
          <span>start {formatTimestamp(segment.startMs)}</span>
          <span>end {formatTimestamp(segment.endMs)}</span>
          <span>duration {formatDuration(segment.durationMs)}</span>
        </li>
      ))}
    </ol>
  );
};

export const App = () => {
  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    enumerating,
    error: enumerationError,
    refresh: enumerateAudioInputs,
  } = useAudioInputs({ promptOnMount: true, autoSelectFirst: true, rememberLast: true });

  // Persisted UI state (localStorage): energy threshold, smoothing, capture mode
  const THRESHOLD_KEY = 'saraudio:demo:thresholdDb';
  const SMOOTH_KEY = 'saraudio:demo:smoothMs';
  const MODE_KEY = 'saraudio:demo:captureMode';
  const FALLBACK_KEY = 'saraudio:demo:allowFallback';

  const [thresholdDb, setThresholdDb] = useState(() => {
    if (typeof window === 'undefined') return -55;
    try {
      const raw = window.localStorage.getItem(THRESHOLD_KEY);
      const n = raw !== null ? Number(raw) : NaN;
      return Number.isFinite(n) ? n : -55;
    } catch {
      return -55;
    }
  });
  const [smoothMs, setSmoothMs] = useState(() => {
    if (typeof window === 'undefined') return 30;
    try {
      const raw = window.localStorage.getItem(SMOOTH_KEY);
      const n = raw !== null ? Number(raw) : NaN;
      return Number.isFinite(n) ? n : 30;
    } catch {
      return 30;
    }
  });
  const [hasVadEvent, setHasVadEvent] = useState(false);
  const [mode, setMode] = useState<RuntimeMode>(() => {
    if (typeof window === 'undefined') return 'auto';
    try {
      const raw = window.localStorage.getItem(MODE_KEY);
      if (raw === 'worklet' || raw === 'media-recorder' || raw === 'auto') return raw;
      return 'auto';
    } catch {
      return 'auto';
    }
  });
  const [allowFallback, setAllowFallback] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const raw = window.localStorage.getItem(FALLBACK_KEY);
      if (raw === '0') return false;
      return true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(THRESHOLD_KEY, String(thresholdDb));
    } catch {}
  }, [thresholdDb]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SMOOTH_KEY, String(smoothMs));
    } catch {}
  }, [smoothMs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(MODE_KEY, mode);
    } catch {}
  }, [mode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FALLBACK_KEY, allowFallback ? '1' : '0');
    } catch {}
  }, [allowFallback]);

  // device enumeration handled by hook

  const audioConstraints = useMemo<MediaTrackConstraints>(
    () => buildAudioConstraints({ deviceId: selectedDeviceId, sampleRate: 16000, channelCount: 1 }),
    [selectedDeviceId],
  );

  const segmenterOptions = useMemo(() => ({ preRollMs: 250, hangoverMs: 400 }), []);

  const {
    status,
    error,
    start,
    stop,
    vad: vadState,
    levels,
    segments,
    clearSegments,
    recordings,
  } = useSaraudio({
    stages: [vadEnergy({ thresholdDb, smoothMs }), meter()],
    segmenter: segmenterOptions,
    constraints: audioConstraints,
    mode,
    allowFallback,
  });

  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [maskedUrl, setMaskedUrl] = useState<string | null>(null);
  // Web Audio playback state for individual segments
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const lastVad = vadState ? { speech: vadState.isSpeech, score: vadState.score } : null;
  const isSpeech = vadState?.isSpeech ?? false;
  const rms = levels?.rms ?? 0;
  const db = levels?.db ?? -Infinity;

  useEffect(() => {
    if (lastVad) {
      setHasVadEvent(true);
    }
  }, [lastVad]);

  const isRunning = status === 'running' || status === 'acquiring';
  const meterPercent = Math.min(100, Math.round(rms * 100));
  const levelDb = db === -Infinity ? '-∞' : db.toFixed(1);
  const vadLabel = useMemo(() => {
    if (hasVadEvent) {
      return lastVad?.speech ? 'Speech detected' : 'Silence';
    }
    if (status === 'running') {
      return 'Listening… waiting for speech';
    }
    return 'Silence';
  }, [hasVadEvent, lastVad?.speech, status]);

  const previousStatusRef = useRef(status);
  useEffect(() => {
    if (status === 'running' && previousStatusRef.current !== 'running') {
      setHasVadEvent(false);
    }
    previousStatusRef.current = status;
  }, [status]);

  const handleStartStop = useCallback(() => {
    if (isRunning) {
      void (async () => {
        await stop();
        const cleaned = await recordings.cleaned.getBlob();
        const full = await recordings.full.getBlob();
        const masked = await recordings.masked.getBlob();
        setCleanedUrl(cleaned ? URL.createObjectURL(cleaned) : null);
        setFullUrl(full ? URL.createObjectURL(full) : null);
        setMaskedUrl(masked ? URL.createObjectURL(masked) : null);
        // We no longer show the meta label near Cleaned player.
      })();
      return;
    }
    void start();
  }, [isRunning, start, stop, recordings]);

  const stopCurrent = (): void => {
    const node = sourceRef.current;
    if (node) {
      try {
        node.stop();
      } catch {}
      node.disconnect();
      sourceRef.current = null;
    }
    setPlayingId(null);
  };

  const playSegment = (s: Segment): void => {
    if (!s.pcm || s.pcm.length === 0) return;
    stopCurrent();
    const ctx = audioCtxRef.current ?? new AudioContext({ sampleRate: s.sampleRate });
    audioCtxRef.current = ctx;
    const buffer = segmentToAudioBuffer(ctx, s);
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      if (sourceRef.current === source) sourceRef.current = null;
      setPlayingId((prev) => (prev === s.id ? null : prev));
    };
    sourceRef.current = source;
    setPlayingId(s.id);
    source.start();
  };

  const handleToggleSegment = (s: Segment): void => {
    if (playingId === s.id) {
      stopCurrent();
    } else {
      playSegment(s);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCurrent();
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      void ctx?.close();
    };
  }, []);

  return (
    <div className='app'>
      <header>
        <h1>SARAUDIO · React Microphone Demo</h1>
        <p>
          This demo uses <code>@saraudio/react</code> hooks on top of the browser runtime. Press&nbsp;
          <strong>Start</strong> to capture the microphone and visualise voice activity.
        </p>
      </header>

      <section className='controls'>
        <div className='controls__device-row'>
          <label className='controls__device'>
            <span>Input device</span>
            <div className='device-select'>
              <select
                value={selectedDeviceId}
                onChange={(event) => setSelectedDeviceId(event.target.value)}
                disabled={enumerating || status === 'running' || status === 'acquiring'}
              >
                {devices.map((device) => (
                  <option key={device.deviceId || `device-${device.label}`} value={device.deviceId}>
                    {device.label || `Microphone ${device.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
              <button
                type='button'
                onClick={() => void enumerateAudioInputs()}
                disabled={enumerating || status === 'running' || status === 'acquiring'}
                className='refresh-button'
                title='Refresh devices'
              >
                Refresh
              </button>
            </div>
          </label>
          <div className='threshold-controls'>
            <label>
              <span>Energy threshold (dB)</span>
              <input
                type='range'
                min='-90'
                max='-5'
                step='1'
                value={thresholdDb}
                onChange={(event) => setThresholdDb(Number(event.target.value))}
              />
              <span className='threshold-value'>{thresholdDb} dB</span>
            </label>
            <label>
              <span>Smoothing (ms)</span>
              <input
                type='range'
                min='5'
                max='200'
                step='5'
                value={smoothMs}
                onChange={(event) => setSmoothMs(Number(event.target.value))}
              />
              <span className='threshold-value'>{smoothMs} ms</span>
            </label>
          </div>
        </div>
        <div className='controls__device-row' style={{ marginTop: 8 }}>
          <div className='mode-row'>
            <label className='controls__device'>
              <span>Capture mode</span>
              <div className='device-select'>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as RuntimeMode)}
                  disabled={status === 'running' || status === 'acquiring'}
                >
                  <option value='auto'>auto</option>
                  <option value='worklet'>worklet</option>
                  <option value='media-recorder'>media-recorder</option>
                </select>
              </div>
            </label>
            <label className='controls__device' style={{ minWidth: 140 }}>
              <span>Allow fallback</span>
              <input
                type='checkbox'
                checked={allowFallback}
                onChange={(e) => setAllowFallback(e.target.checked)}
                disabled={status === 'running' || status === 'acquiring'}
                aria-label='Allow automatic fallback when requested mode is unavailable'
              />
            </label>
          </div>
        </div>
        <div className='controls__buttons'>
          <button type='button' onClick={handleStartStop} disabled={status === 'stopping'}>
            {isRunning ? 'Stop' : 'Start'} microphone
          </button>
          <button type='button' onClick={() => clearSegments()} disabled={segments.length === 0}>
            Clear segments
          </button>
        </div>
        <div className='controls__status'>
          {enumerating ? <span className='status status--info'>Scanning devices…</span> : null}
          {devices.length === 0 && !enumerating ? (
            <span className='status status--warning'>No audio inputs found</span>
          ) : null}
          <span className={`status status--${status}`}>Status: {status}</span>
        </div>
        {enumerationError ? <p className='status status--error'>Device error: {enumerationError}</p> : null}
        {error ? <p className='status status--error'>Error: {error.message}</p> : null}
      </section>

      <section className='vad'>
        <h2>Voice Activity</h2>
        <div className='volume-meter' aria-hidden='true'>
          <div className='volume-meter__bar' style={{ width: `${meterPercent}%` }} />
        </div>
        <p className='volume-meter__label'>
          Input level {meterPercent}% ({levelDb} dBFS)
        </p>
        {lastVad ? (
          <VADMeter score={lastVad.score} speech={lastVad.speech} />
        ) : (
          <p className='placeholder'>Meter will update once audio chunks arrive. Adjust threshold if needed.</p>
        )}
        <p className='badge' data-state={hasVadEvent && isSpeech ? 'speech' : 'silence'}>
          {vadLabel}
        </p>
      </section>

      <section className='segments'>
        <h2>Captured Segments (last {segments.length})</h2>
        <SegmentList segments={segments} onToggle={handleToggleSegment} playingId={playingId} />
      </section>

      <section className='segments'>
        <h2>Recordings</h2>
        <div className='segment-list'>
          <div className='segment-list__item'>
            <span className='segment-list__title'>Cleaned (speech only)</span>
            {/* biome-ignore lint/a11y/useMediaCaption: demo player without captions */}
            {cleanedUrl ? <audio controls src={cleanedUrl} /> : <span className='placeholder'>No cleaned yet</span>}
          </div>
          <div className='segment-list__item'>
            <span className='segment-list__title'>Full (entire session)</span>
            {/* biome-ignore lint/a11y/useMediaCaption: demo player without captions */}
            {fullUrl ? <audio controls src={fullUrl} /> : <span className='placeholder'>No full yet</span>}
          </div>
          <div className='segment-list__item'>
            <span className='segment-list__title'>Masked (silence as zeros)</span>
            {/* biome-ignore lint/a11y/useMediaCaption: demo player without captions */}
            {maskedUrl ? <audio controls src={maskedUrl} /> : <span className='placeholder'>No masked yet</span>}
          </div>
        </div>
      </section>

      <footer>
        <p>
          Microphone capture requires HTTPS (or localhost) and user permission. Adjust thresholds inside the demo to
          tune sensitivity for noisy environments.
        </p>
      </footer>
    </div>
  );
};
