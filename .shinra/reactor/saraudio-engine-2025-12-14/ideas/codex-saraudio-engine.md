# SARAudio Engine (for Tenro capability)

> Автор: codex
> Создано: 14 декабря 2025
> Статус: collecting
> Реактор: saraudio-engine-2025-12-14

## 📖 Суть идеи

Развивать SARAudio как самостоятельный OSS “движок”:
- источники аудио → `Frame` stream,
- pipeline/stages (VAD/segmenter/meter/…),
- realtime transcription (providers/transports),
- (постепенно) multi-source и микширование.

Tenro `audio-capabilities` использует SARAudio как engine, а Tenro core реализует orchestration (leases/state/policy + Electron bridges).

## 🎯 Почему отдельный реактор

SARAudio — приоритетная OSS составляющая (≈60%), и она должна развиваться независимо от Tenro, но с ясными точками интеграции.

## 🧭 Граница ответственности

- SARAudio:
  - data/engine: `Frame`, pipeline/stages, transcription controller/providers,
  - runtime-browser/runtime-node (если это библиотечно оправдано),
  - multi-source (в идеале) как часть engine.
- Tenro:
  - platform: leases/ref-count, state API, policy/consent,
  - Electron bridges (system native, mic backend, service windows),
  - routing transcript/events/state в Apps.

## ❓ Открытые вопросы (что прояснять дальше)

- [ ] Multi-source: делать ли “source abstraction + mix + sidechain VAD” в SARAudio (скорее да) или держать это в Tenro?
- [ ] Recorder/file-sink: что именно нужно для “записи в файл” как consumer (не копить всё в RAM).
- [ ] Минимальный contract transcript/events для platform-использования (timestamps, source tagging, ids).

