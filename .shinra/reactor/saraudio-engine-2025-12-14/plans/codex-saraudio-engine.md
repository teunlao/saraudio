# Plan: SARAudio engine improvements (OSS-first)

> Автор: codex
> Создано: 14 декабря 2025
> Статус: draft
> Реактор: saraudio-engine-2025-12-14
> Связано с: `/Users/teunlao/projects/tenro/.shinra/reactor/audio-capabilities-2025-12-14/`

## Цель

Выбрать и проработать 1–2 улучшения SARAudio, которые:
- повышают ценность OSS,
- напрямую разблокируют Tenro `audio-capabilities` (mic+system + transcript/events/state),
- не тащат Tenro-специфику внутрь SARAudio.

## Кандидаты (из текущего контекста)

1) **Multi-source engine** (источники + опциональный mix + sidechain VAD)
- Нужен для mic+system, и вообще “AI voice apps” часто multi-input.

2) **File-sink / chunked recording**
- Чтобы “record to file” не был in-memory blob и мог жить как consumer поверх stream.

## Не-цель

- Не оптимизировать IPC/overhead заранее — сначала измерения в Tenro, если станет нужно.
- Не делать Tenro-specific API в SARAudio.

## Следующие шаги (draft)

1. Определить “MVP multi-source” (без микшера или с самым простым микшером).
2. Определить “MVP file-sink” (WAV/PCM16, chunked write).
3. Привязать эти улучшения к Tenro capability (какие потребители/сервисы будут их вызывать).

