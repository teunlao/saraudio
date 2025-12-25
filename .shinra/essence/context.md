---
agent: codex
purpose: working-memory
updated: 2025-12-15
iteration: 4
---

# Essence Context

> Агент: codex
> Обновлено: 15 декабря 2025
> Итерация: 4

## Статус

- Черновик ESSENCE заполнен (архитектура/слои/флоу/инварианты/расширение).
- Уточнена позиция про multi‑source: захват выделен как заменяемый слой (без обещаний по конкретным источникам).
- Создана директория `.shinra/essence/validations/` под review файлы.

## Прочитано (ключевое)

- [x] `.shinra/essence/RECOMMENDATIONS.md` (placeholder)
- [x] `.lab/README.md`
- [x] `.lab/what.md`
- [x] `.lab/decisions/001-rewrite-from-scratch-2025-10-26.md`
- [x] `.lab/decisions/002-naming-saraudio-2025-10-26.md`
- [x] `.lab/decisions/003-ux-dx-improvements-2025-10-27.md` (частично)
- [x] `.lab/designs/codex-core-v0-saraudio-structure-2025-10-26.md`
- [x] `.lab/designs/codex-packaging-and-public-api-2025-10-26.md`
- [x] `.lab/designs/codex-runtime-browser-plan-2025-10-26.md`
- [x] `.lab/designs/codex-di-architecture-2025-10-26.md`
- [x] `.lab/designs/codex-engineering-principles-2025-10-26.md`
- [x] `.lab/designs/codex-testing-strategy-2025-10-26.md`
- [x] `.lab/claude-defend/01-brief.md`
- [x] `.lab/claude-defend/03-pipeline-and-stages.md`
- [x] `.lab/claude-defend/04-runtime-browser.md`
- [x] `.lab/claude-defend/06-recorder-api.md`
- [x] `README.MD`
- [x] `package.json`, `pnpm-workspace.yaml`
- [x] `packages/core/src/pipeline.ts` (atomic configure + buffer)
- [x] `packages/core/src/transcription/*` (provider contract + defineProvider)
- [x] `packages/runtime-base/.docs/README.md` (цели controller: preconnect buffer, retry, flushOnSegmentEnd)
- [x] `packages/runtime-base/src/transcription/transcription-controller.ts` (WS/HTTP selection, silence policy)
- [x] `packages/runtime-browser/src/recorder.ts` + `packages/runtime-browser/src/transcription.ts`
- [x] `packages/deepgram/src/provider.ts`, `packages/soniox/src/provider.ts`

## Гипотеза сути (черновик, 1–2 строки)

SARAUDIO — модульный аудио‑стек для AI‑voice приложений: захват аудио (browser/node) → low‑latency обработка (pipeline + stages) → сегментация речи (VAD + segmenter) → унифицированная транскрипция (providers + transports), с биндингами под UI‑фреймворки.

## Граф зависимостей (черновик)

- `@saraudio/utils` → низкоуровневые утилиты (DSP/async/логгер) — базовый слой
- `@saraudio/core` → pipeline/events/recording/transcription types → зависит от `utils`
- `@saraudio/vad-energy` → stage/controller → зависит от `core`, `utils`
- `@saraudio/meter` → stage/controller → зависит от `core`
- `@saraudio/runtime-base` → transcription-controller + transports → зависит от `core`, `utils`
- `@saraudio/runtime-browser` → browser runtime + sources + recorder + transcription wrapper → зависит от `core`, `runtime-base`, `utils`
- `@saraudio/runtime-node` → node runtime helpers → зависит от `core`, `runtime-base`, `utils`
- `@saraudio/deepgram` / `@saraudio/soniox` → provider adapters → зависят от `core`, `utils` (+ runtime-base по использованию через controller)
- `@saraudio/react|vue|svelte|solid` → UI bindings → зависят от `core`, `runtime-browser`, `utils` (+ optional peer deps stages)

## План (следующие шаги)

1. Причесать ESSENCE: убрать лишнее, добавить 1–2 схемы/мнемоники потоков (словами), проверить читаемость.
2. Сверить ESSENCE с текущим состоянием `packages/*` и README: не обещать лишнего, но и не упустить ключевые части.
3. Дождаться пользовательских акцентов в `.shinra/essence/RECOMMENDATIONS.md` (сейчас placeholder).

## Точка остановки

Последнее: заполнил `.shinra/essence/ESSENCE.md` до состояния «карта проекта» (черновик).
Следующее: пройтись ещё раз по ESSENCE и сократить/уточнить формулировки после feedback.

— codex
