import { createRecorder } from '@saraudio/runtime-browser';
import { createEnergyVadStage } from '@saraudio/vad-energy';

const statusEl = document.getElementById('status') as HTMLSpanElement;
const startBtn = document.getElementById('start') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const cleanedEl = document.getElementById('cleaned') as HTMLAudioElement;
const fullEl = document.getElementById('full') as HTMLAudioElement;
const maskedEl = document.getElementById('masked') as HTMLAudioElement;
const cleanedMeta = document.getElementById('cleaned-meta') as HTMLDivElement;

const recorder = createRecorder({
  stages: [createEnergyVadStage({ thresholdDb: -55, smoothMs: 30 })],
  segmenter: { preRollMs: 250, hangoverMs: 400 },
  constraints: { channelCount: 1, sampleRate: 16000 },
  produce: { cleaned: true, full: true, masked: true },
});

const setStatus = (value: string) => {
  statusEl.textContent = value;
};

startBtn.addEventListener('click', async () => {
  try {
    await recorder.start();
    setStatus(recorder.status);
  } catch (err) {
    setStatus('error');
    console.error(err);
  }
});

stopBtn.addEventListener('click', async () => {
  try {
    await recorder.stop();
    setStatus(recorder.status);
    // Build players
    const cleaned = await recorder.recordings.cleaned.getBlob();
    const full = await recorder.recordings.full.getBlob();
    const masked = await recorder.recordings.masked.getBlob();
    if (cleaned) {
      cleanedEl.src = URL.createObjectURL(cleaned);
      const meta = recorder.recordings.meta();
      cleanedMeta.textContent = `Speech ${Math.round(meta.cleanedDurationMs)} ms / Session ${Math.round(
        meta.sessionDurationMs,
      )} ms`;
    }
    if (full) fullEl.src = URL.createObjectURL(full);
    if (masked) maskedEl.src = URL.createObjectURL(masked);
  } catch (err) {
    setStatus('error');
    console.error(err);
  }
});

setStatus(recorder.status);

