import type { Segment } from '@saraudio/core';
import { createAudioMeterStage } from '@saraudio/meter';
import { useSaraudio } from '@saraudio/react';
import { createEnergyVadStage } from '@saraudio/vad-energy';
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

const SegmentList = ({ segments }: { segments: readonly Segment[] }) => {
  if (segments.length === 0) {
    return <p className='placeholder'>Talk into the microphone to capture segments.</p>;
  }

  return (
    <ol className='segment-list'>
      {segments.map((segment) => (
        <li key={segment.id} className='segment-list__item'>
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
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [enumerating, setEnumerating] = useState(false);
  const [enumerationError, setEnumerationError] = useState<string | null>(null);

  const [thresholdDb, setThresholdDb] = useState(-55);
  const [smoothMs, setSmoothMs] = useState(30);
  const [hasVadEvent, setHasVadEvent] = useState(false);

  const enumerateAudioInputs = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setEnumerationError('Browser does not support device enumeration.');
      setDevices([]);
      return;
    }
    setEnumerating(true);
    setEnumerationError(null);
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter((device) => device.kind === 'audioinput');
      setDevices(audioInputs);
      if (audioInputs.length > 0) {
        setSelectedDeviceId((current) => {
          if (current) return current;
          const firstId = audioInputs[0]?.deviceId ?? '';
          return firstId;
        });
      } else {
        setSelectedDeviceId('');
      }
    } catch (error) {
      setEnumerationError(error instanceof Error ? error.message : 'Failed to enumerate audio devices.');
      setDevices([]);
      setSelectedDeviceId('');
    } finally {
      setEnumerating(false);
    }
  };

  useEffect(() => {
    void enumerateAudioInputs();
    // Try to prompt permissions so labels appear
    if (navigator.mediaDevices?.getUserMedia) {
      void navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
        void enumerateAudioInputs();
      });
    }
  }, []);

  const audioConstraints = useMemo<MediaTrackConstraints>(() => {
    const constraints: MediaTrackConstraints = {
      channelCount: 1,
      sampleRate: 16000,
    };
    if (selectedDeviceId) {
      constraints.deviceId = { exact: selectedDeviceId };
    }
    return constraints;
  }, [selectedDeviceId]);

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
    fallbackReason,
    recordings,
  } = useSaraudio({
    stages: [createEnergyVadStage({ thresholdDb, smoothMs }), createAudioMeterStage()],
    segmenter: segmenterOptions,
    constraints: audioConstraints,
  });

  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [maskedUrl, setMaskedUrl] = useState<string | null>(null);
  const [metaLabel, setMetaLabel] = useState<string>('');

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
        const meta = recordings.meta();
        setMetaLabel(
          `Speech ${Math.round(meta.cleanedDurationMs)} ms / Session ${Math.round(meta.sessionDurationMs)} ms`,
        );
      })();
      return;
    }
    void start();
  }, [isRunning, start, stop, recordings]);

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
          {fallbackReason ? (
            <span className='status status--warning'>
              Runtime fallback: {fallbackReason === 'worklet-unsupported' ? 'MediaRecorder mode' : fallbackReason}
            </span>
          ) : (
            <span className='status status--ok'>Runtime: worklet preferred</span>
          )}
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
        <SegmentList segments={segments} />
      </section>

      <section className='segments'>
        <h2>Recordings</h2>
        <div className='segment-list'>
          <div className='segment-list__item'>
            <span className='segment-list__title'>Cleaned (speech only)</span>
            <span>{metaLabel}</span>
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
