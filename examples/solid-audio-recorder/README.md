# Saraudio SolidStart Example

Audio recording demo with VAD (Voice Activity Detection) using SolidStart and Saraudio.

## Features

- **Voice Activity Detection**: Real-time speech detection with visual feedback
- **Audio Levels**: RMS, Peak, and dB meter visualization
- **Segment Recording**: Automatic segmentation based on voice activity
- **Modern UI**: Built with Tailwind CSS 4

## Tech Stack

- [SolidStart](https://start.solidjs.com/) - Meta-framework for SolidJS
- [Saraudio](https://github.com/teunlao/saraudio) - Multi-source audio stack
- [Tailwind CSS 4](https://tailwindcss.com/) - Utility-first CSS framework

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm serve

# Build for production
pnpm build

# Preview production build
pnpm start
```

## Usage

1. Click "Start" to begin recording
2. Speak into your microphone
3. Watch real-time audio levels and VAD status
4. See recorded segments appear in the list
5. Click "Stop" to end recording
