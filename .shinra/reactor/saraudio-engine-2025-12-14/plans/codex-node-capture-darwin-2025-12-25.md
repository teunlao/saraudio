# Plan: Node capture (darwin) — system audio + mic

> Автор: codex
> Создано: 25 декабря 2025, 15:xx
> Статус: in_progress
> Реактор: saraudio-engine-2025-12-14
> Проект: saraudio
> Репозиторорий: `/Users/teunlao/projects/saraudio`
> Essence: `/Users/teunlao/projects/saraudio/.shinra/essence/`
> Основано на: `ideas/codex-node-mic-system-audio-2025-12-25.md`

## Цель

Добавить нативный захват аудио на macOS (darwin) для Node:
- **system audio** через Core Audio taps (macOS >= 14.2),
- **microphone** через CoreAudio (Swift binary),
с единым контрактом `NodeFrameSource` и стабильным форматом `pcm16 / 16000Hz / mono`.

## Нефункциональные требования (жёсткие)

- macOS system audio: **только >= 14.2**, без fallback.
- Формат stdout из binary: **всегда** `pcm16le`, `sampleRate=16000`, `channels=1`.
- Таймстемпы `tsMs`: **stream-time от 0** (детерминированно).
- Установка: `@saraudio/capture-darwin` ставится **явно** (без optionalDependencies).
- Внешний wrapper (audioteejs) **не подключаем как зависимость API**; Node-обвязка у нас.

## Пакетирование (целевое)

- Новый пакет: `packages/capture-darwin` → `@saraudio/capture-darwin`
  - darwin-only (`"os": ["darwin"]`, cpu: `arm64/x64`)
  - содержит:
    - vendored Swift sources (копия audiotee, с правками под наши дефолты/CLI),
    - build скрипт, который собирает бинарь и кладёт его в package `dist/bin/…` (или аналог),
    - Node API: `createSystemAudioSource()` и `createMicrophoneSource()` (оба возвращают `NodeFrameSource`).

## Этапы / Шаги

### 0) Скелет пакета `@saraudio/capture-darwin`
- [x] Создать `packages/capture-darwin/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts` по образцу других пакетов.
- [x] Экспортировать Node API из `packages/capture-darwin/src/index.ts`.
- [ ] Ограничить платформу: `"os": ["darwin"]`, `engines.node >= 18`.

### 1) Vendor Swift исходники (system audio)
- [x] Скопировать Swift код из `.external/audiotee-swift` внутрь `packages/capture-darwin/native/` (или `swift/`).
- [x] Зафиксировать дефолты/CLI:
  - sample rate = 16000,
  - mono,
  - output = pcm16le,
  - stdout = только PCM, stderr = логи/метаданные/ошибки.
- [x] Согласовать “стабильный протокол stdout” (endianness, framing: raw bytes без заголовков).

### 2) Сборка и вкладывание бинаря в npm пакет
- [x] Добавить `pnpm build:native` в `packages/capture-darwin`:
  - `swift build -c release`
  - копировать результат в место, попадающее в публикацию (например `dist/bin/saraudio-capture-darwin`).
- [ ] Решить universal vs per-arch:
  - минимально: публиковать arch-specific бинарь (работает локально),
  - целевое: universal (arm64+x64) через `lipo` в CI.
- [x] Убедиться что `files`/`exports` включают бинарь в publish.

### 3) Node wrapper: `createSystemAudioSource()`
- [x] Реализовать `createSystemAudioSource(options)`:
  - `spawn` нашего бинаря,
  - читать `stdout` как PCM поток,
  - разрезать на фреймы через существующий `createPcm16StreamSource` (frameSize=160 по умолчанию → 10ms),
  - прокидывать stderr в logger/diagnostics,
  - корректный stop(): остановить процесс, дождаться закрытия, очистить ресурсы.
- [ ] Ошибки и пермишены:
  - “если пошёл 0‑аудио” — показывать подсказку про System Audio Recording permission,
  - чётко отделить fatal errors (process exit) от “пока тишина”.

### 4) Microphone (darwin) — Swift path
- [ ] Ресёрч/выбор реализации: AudioUnit vs AVAudioEngine (что проще/надёжнее для headless CLI).
- [x] Реализовать второй режим в том же бинаре (или отдельный бинарь): mic capture → stdout PCM16/16k/mono.
- [x] Node wrapper: `createMicrophoneSource(options)` аналогично system audio.

### 5) Документация и примеры
- [x] Добавить `examples/runtime-node-system-audio` (macOS) с использованием `@saraudio/capture-darwin`.
- [ ] Добавить страницу/секцию в `README.MD` (корень): установка и требования (macOS >= 14.2, permission).

### 6) Тестирование
- [ ] Юнит-тесты Node wrapper’а (без запуска реального capture): проверка фрейминга через `Readable` + `createPcm16StreamSource`.
- [ ] Интеграционный тест “smoke” под macOS (опционально/условно): запуск бинаря и проверка, что идут байты.

## Открытые вопросы (остались)

- [ ] Как делаем universal бинарь (arm64+x64) в CI: lipo, artifacts, или два publish варианта?
- [ ] Как назвать бинарь и путь внутри пакета (устойчивый для `spawn`)?
- [ ] Как обрабатывать permissions UX: как детектить “тишину” vs “нет разрешения” надёжно?

---

## Лог изменений

### 25 декабря 2025 (codex)
- Создан первичный план на основе согласованных решений (capture-darwin, stream-time, fixed PCM16/16k/mono, explicit install).

### 25 декабря 2025 (codex)
- Реализован `@saraudio/capture-darwin`: Swift binary (system/mic), Node wrappers, сборка и упаковка бинаря.
- Добавлен игнор `.build` для Biome (чтобы Swift build артефакты не ломали `pnpm lint`).
