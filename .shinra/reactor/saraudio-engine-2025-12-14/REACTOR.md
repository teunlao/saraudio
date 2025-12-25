# Reactor: saraudio-engine-2025-12-14

> Автор: codex
> Создано: 14 декабря 2025
> Обновлено: 25 декабря 2025 (codex)
> Статус: active

## О чём

Реактор про развитие **SARAudio (OSS)** как “audio engine” (pipeline/transcription/multi-source), который станет базой для Tenro `audio-capabilities`.

Цель — чтобы core‑техническая логика жила в SARAudio, а Tenro добавлял только platform‑orchestration (leases/state/policy + Electron bridges).

## Связи (вне репозитория)

- Tenro capability reactor: `/Users/teunlao/projects/tenro/.shinra/reactor/audio-capabilities-2025-12-14/`
- Tenro consumer reactor (interview-helper): `/Users/teunlao/projects/tenro/.shinra/reactor/interview-helper-2025-12-14/`

## Планы

| План | Статус | Описание |
|------|--------|----------|
| `plans/codex-saraudio-engine.md` | draft | 1–2 SARAudio улучшения с максимальной отдачей (OSS + Tenro) |
| `plans/codex-node-capture-darwin-2025-12-25.md` | in_progress | Нативный macOS capture для Node (system audio + mic) через Swift/CoreAudio binary |

## Артефакты

- **ideas/** — 1 файл (ядро идеи и границы ответственности)
- **plans/** — 1 файл (первичный план)
- **research/** — (пока пусто)
- **canvas/** — (опционально)
