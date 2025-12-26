# @saraudio/capture-node

Cross-platform capture entrypoint for Node.js.

- **macOS**: delegates to `@saraudio/capture-darwin` (Swift/CoreAudio)
- **Windows/Linux**: not supported yet (will throw on `start()`)

## Install

```bash
pnpm add @saraudio/capture-node
```

On macOS you also need:

```bash
pnpm add @saraudio/capture-darwin
```

## Usage

```ts
import { createMicrophoneSource, createSystemAudioSource, listMicrophoneDevices } from '@saraudio/capture-node';

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
```
