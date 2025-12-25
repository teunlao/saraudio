# @saraudio/capture-darwin

macOS CoreAudio capture for Node.js (system audio + microphone).

This package ships a prebuilt native binary (`bin/saraudio-capture`) that streams **PCM16LE / 16 kHz / mono** over stdout.

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

await mic.start();
await system.start();
```

Both sources are `NodeFrameSource`-compatible for `@saraudio/runtime-node`.

## Notes

- Requires macOS permissions (Microphone and/or Screen Recording depending on capture path).
- If you install from git/source, build the bundled binary first:

```bash
pnpm --filter @saraudio/capture-darwin... build
```
