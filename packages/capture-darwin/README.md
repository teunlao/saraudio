# @saraudio/capture-darwin

macOS CoreAudio capture for Node.js (system audio + microphone).

This package ships a prebuilt native binary (`bin/saraudio-capture`) that streams **PCM16LE / 16 kHz / mono** over stdout.

Requires macOS ≥ 14.2.

## Install

```bash
pnpm add @saraudio/capture-darwin
```

## Usage

```ts
import { createMicrophoneSource, createSystemAudioSource, listMicrophoneDevices } from '@saraudio/capture-darwin';

// Optional: pick a specific microphone by CoreAudio device UID.
const devices = await listMicrophoneDevices();
const deviceUID = devices[0]?.uid;

const mic = createMicrophoneSource({ deviceUID });
const system = createSystemAudioSource();

await mic.start((frame) => {
  // frame.pcm is Int16Array (PCM16LE), frame.sampleRate = 16000, frame.channels = 1
});

await system.start((frame) => {
  // system audio frames have the same format (PCM16LE / 16 kHz / mono)
});

// later…
await mic.stop();
await system.stop();
```

Both sources are `NodeFrameSource`-compatible for `@saraudio/runtime-node`.

## Notes

- Requires macOS permissions (Microphone and/or Screen Recording depending on capture path).
- If you install from git/source, build the bundled binary first:

```bash
pnpm --filter @saraudio/capture-darwin... build
```
