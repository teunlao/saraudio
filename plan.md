# SARAUDIO Roadmap

## Текущее состояние

✅ Аудио пайплайн с VAD, сегментацией, метрами
✅ Нормализация фреймов (конвертация формата, ресемплинг)
✅ Адаптеры для фреймворков (React, Vue)
✅ Type-safe параметр encoding

## Следующее: Унифицированный API транскрипции

### Цель
Единый API для транскрипции, независимый от провайдера (как Vercel AI SDK)

### Архитектура

```
@saraudio/
├── core                         # Базовые типы (Frame, Pipeline, Stage...)
│   └── типы для транскрипции (TranscriptionProvider, TranscriptResult)
├── runtime-browser              # Browser runtime (framework-agnostic)
│   ├── createRecorder()
│   └── createTranscription()    ← НОВОЕ (вся логика здесь)
├── runtime-node                 # Node runtime
│   ├── createRecorder()
│   └── createTranscription()    ← НОВОЕ
├── deepgram                     # Провайдеры транскрипции ← НОВЫЕ ПАКЕТЫ
├── assemblyai
├── openai                       # Платформа с несколькими инструментами
├── vue/                         # Vue wrappers (интеграционные)
│   ├── useRecorder()            ← обёртка над createRecorder
│   ├── useTranscription()       ← обёртка над createTranscription
│   └── useMeter()
└── react/                       # React wrappers (интеграционные)
    ├── useRecorder()            ← обёртка над createRecorder
    ├── useTranscription()       ← обёртка над createTranscription
    └── useMeter()
```

**Важно:** Хуки - это интеграционные обёртки.
Вся логика в `createTranscription` (`@saraudio/runtime-browser` / `runtime-node`).

### Пример базового API (framework-agnostic)

```typescript
import { createRecorder } from '@saraudio/runtime-browser'
import { deepgram } from '@saraudio/deepgram'

// Провайдер - полностью самостоятельная единица
const provider = deepgram({
  apiKey: env.DEEPGRAM_API_KEY,
  model: 'nova-2',
})

// Публичный API провайдера
const format = provider.getRequiredFormat() // { sampleRate: 16000, encoding: 'pcm16' }

// Вариант 1: Использовать format где угодно
const rec = createRecorder({
  format, // провайдер диктует формат
  stages: [vadEnergy(), meter()],
})

// Вариант 2: Ручное подключение стрима
const stream = provider.stream()

stream.onTranscript((result) => {
  console.log(result.text)
  console.log(result.confidence)
  console.log(result.words) // временные метки слов
})

stream.onPartial((text) => {
  console.log('[INTERIM]', text)
})

// Подключаем вручную
rec.subscribeFrames(stream.send)

await stream.connect()
await rec.start()

// Cleanup
await rec.stop()
await stream.disconnect()
```

### Пример для Vue

```typescript
import { useTranscription } from '@saraudio/vue'
import { deepgram } from '@saraudio/deepgram'

// Сценарий 1: Хук создаёт recorder сам
const { transcript, partial, status, start, stop } = useTranscription({
  provider: deepgram({
    apiKey: env.DEEPGRAM_API_KEY,
    model: 'nova-2',
  }),
  autoConnect: true,
})
// ✅ Format автоматически взят от провайдера

// Сценарий 2: Передаём свой recorder (без format)
const rec = useRecorder({
  stages: [vadEnergy(), meter()], // только stages
})

const { transcript, partial } = useTranscription({
  provider: deepgram({
    apiKey: env.DEEPGRAM_API_KEY,
    model: 'nova-2',
  }),
  recorder: rec, // ← просто rec, не rec.recorder!
  autoConnect: true,
})
// ✅ Format автоматически применён через rec.update()

// Сценарий 3: Передаём нативный Recorder (для продвинутых)
const recorder = createRecorder({
  stages: [vadEnergy()],
})

const { transcript } = useTranscription({
  provider: deepgram({ apiKey: env.KEY }),
  recorder, // ← нативный Recorder тоже работает
  autoConnect: true,
})
```

### Пример для React

```tsx
import { useTranscription } from '@saraudio/react'
import { assemblyai } from '@saraudio/assemblyai'

// Сценарий 1: Минимальный (всё автоматически)
const { transcript, partial, status, start, stop } = useTranscription({
  provider: assemblyai({
    apiKey: process.env.ASSEMBLYAI_KEY,
  }),
  autoConnect: true,
})

// Сценарий 2: С кастомным recorder
const rec = useRecorder({
  stages: [vadEnergy(), meter()],
})

const { transcript, partial } = useTranscription({
  provider: assemblyai({
    apiKey: process.env.ASSEMBLYAI_KEY,
  }),
  recorder: rec, // ← просто rec
  autoConnect: true,
})
```

### Лёгкая смена провайдера

```typescript
// Меняем ОДНУ строку:
const provider = deepgram({ apiKey: env.KEY })
// на
const provider = assemblyai({ apiKey: env.KEY })
// Весь остальной код остаётся без изменений!
```

### Типы транспорта

Провайдеры используют разный транспорт (оба для realtime):

**WebSocket:**
- Deepgram, AssemblyAI, Azure Speech
- Низкая задержка (~100-300ms)
- Partial results
- Постоянное соединение

**HTTP:**
- OpenAI (Whisper, Transcription), ElevenLabs
- Выше задержка (~2-5 сек)
- БЕЗ partial results
- Буферизация → периодические POST запросы

**Примечание:** Некоторые платформы (OpenAI, Deepgram) поддерживают оба режима

**Гибридные:**
- Поддерживают оба режима (например Deepgram)

```typescript
// WebSocket провайдер
const dg = deepgram({ apiKey: env.KEY })
console.log(dg.transport) // 'websocket'

// HTTP провайдер (realtime через буферизацию)
const whisper = openai.whisper({
  apiKey: env.KEY,
  interval: 3000 // отправка каждые 3 сек
})
console.log(whisper.transport) // 'http'

// Или более новый API
const transcription = openai.transcription({
  apiKey: env.KEY,
  model: 'whisper-1'
})

// Возможно в будущем WebSocket API
const realtime = openai.realtime({
  apiKey: env.KEY
})
console.log(realtime.transport) // 'websocket'

// Гибридный провайдер
const dgHttp = deepgram({
  apiKey: env.KEY,
  transport: 'http' // переключение на HTTP
})
```

### Унифицированные типы

```typescript
// @saraudio/core
export interface TranscriptionProvider {
  readonly id: string
  readonly transport: 'websocket' | 'http'

  getRequiredFormat(): RecorderFormatOptions
  stream(options?: StreamOptions): TranscriptionStream

  // Опционально для HTTP провайдеров
  getHttpConfig?(): {
    interval: number      // как часто отправлять (ms)
    minDuration: number   // минимальная длина аудио (ms)
  }
}

export interface TranscriptionStream {
  send(frame: NormalizedFrame<'pcm16'>): void
  connect(): Promise<void>
  disconnect(): Promise<void>

  onTranscript(handler: (result: TranscriptResult) => void): UnsubscribeHandle
  onPartial(handler: (text: string) => void): UnsubscribeHandle
  onError(handler: (error: Error) => void): UnsubscribeHandle
  onStatusChange(handler: (status: StreamStatus) => void): UnsubscribeHandle

  readonly status: StreamStatus
}

export interface TranscriptResult {
  text: string
  confidence?: number
  words?: WordTimestamp[]
  language?: string
  metadata?: Record<string, unknown>
}

// @saraudio/vue | @saraudio/react
export interface UseTranscriptionOptions {
  provider: TranscriptionProvider
  recorder?: Recorder | UseRecorderResult // ← оба типа!
  stages?: StageController[] // если recorder не передан
  autoConnect?: boolean
  onTranscript?: (result: TranscriptResult) => void
  onError?: (error: Error) => void
}

export interface UseTranscriptionResult {
  transcript: Ref<string>  // Vue | string (React)
  partial: Ref<string>     // только для WebSocket
  status: Ref<StreamStatus>
  error: Ref<Error | null>
  isConnected: Ref<boolean>
  transport: 'websocket' | 'http'

  // Actions
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  clear: () => void

  // Если recorder не был передан
  start?: () => Promise<void>
  stop?: () => Promise<void>
  recorder?: Recorder
}
```

### Ключевые особенности

- ✅ **Автоматическая конфигурация format** - провайдер диктует требования
- ✅ **Гибкость** - работает с результатом хука или нативным Recorder
- ✅ **Минимум boilerplate** - можно вообще не создавать recorder вручную
- ✅ **Type-safe** из коробки
- ✅ **Лёгкое переключение провайдеров** - меняем одну строку
- ✅ **Единый формат результатов** - TranscriptResult для всех провайдеров

### Унификация провайдеров

Провайдеры внутри используют разные протоколы и форматы (WebSocket/gRPC/HTTP, разные JSON схемы), но все мапятся к единому `TranscriptionProvider` интерфейсу. Базовые контракты общие для всех (`TranscriptResult` с `text`, `confidence`, `words`), но через `metadata` могут передаваться provider-specific данные. Финальные типы и контракты будут продуманы после получения research от всех провайдеров (как в Vercel AI SDK).

## Фазы реализации

### Фаза 1: Базовые типы
- `TranscriptionProvider` интерфейс в `@saraudio/core`
- `TranscriptionStream` интерфейс
- Унифицированный `TranscriptResult` тип

### Фаза 2: Первый провайдер
- Реализовать `@saraudio/deepgram`
- Извлечь логику из `useDeepgramRealtime`
- Адаптировать под унифицированный интерфейс

### Фаза 3: Хуки для фреймворков
- `useTranscription()` в `@saraudio/vue`
- `useTranscription()` в `@saraudio/react`

### Фаза 4: Дополнительные провайдеры
- `@saraudio/assemblyai`
- `@saraudio/openai` (whisper, transcription, realtime)
- `@saraudio/google-speech`
- `@saraudio/azure-speech`
- Community providers

### Фаза 5: Документация
- Гайд миграции с ручного WebSocket
- Сравнение провайдеров
- Best practices

---

## Пост‑ресёрч обновления (Deepgram, AssemblyAI, Soniox, ElevenLabs)

Ниже — уточнения API и поведения после изучения 4 провайдеров. Цели: единый DX, надёжность в реальном времени и простая смена провайдера без переписывания приложения.

### 1) Переговоры форматов (Format Negotiation)
- У провайдера три метода:
  - `getPreferredFormat(): RecorderFormatOptions` — «идеальный» формат для realtime (обычно `{ encoding: 'pcm16', sampleRate: 16000, channels: 1 }`).
  - `getSupportedFormats(): RecorderFormatOptions[]` — перечень поддерживаемых комбинаций.
  - `negotiateFormat?(capabilities): RecorderFormatOptions` — опционально; выбирает формат с учётом источника/ограничений.
- Базовая политика в `createTranscription(...)`:
  - Если пользователь явно указал `format`, валидируем по `getSupportedFormats()`; при несовпадении — ошибка `FormatMismatch` с пояснением.
  - Если не указал — используем `getPreferredFormat()` и нормализуем кадры в пайплайне (resample/downmix/pcm16), чтобы на стороне провайдера не требовалась конверсия.

### 2) Lifecycle/Status и onReady‑буфер
- Статусы стрима: `idle → connecting → connected → error | disconnected`.
- `onReady` испускается ровно один раз на цикл `connect→disconnect`.
- Стартовый буфер 20–60 мс предотвращает потерю первых кадров, пока транспорт не готов.
- Bounded‑очередь кадров и поведение при бэкпрешере документируем: «последний кадр выигрывает» (drop старых) — без неограниченного роста памяти.

### 3) WS keepalive и reconnect
- Опции по умолчанию: `keepaliveMs: 8000`, `reconnect: { enabled: true, backoff: экспоненциальный, cap: 10s, maxRetries: 5 }`.
- Не ретраим на `Auth`/`FormatMismatch`/явные 401/403; ретраим на сетевые/5xx.
- Deepgram: поддерживаем спец‑сообщение KeepAlive и/или ping/pong.
- AssemblyAI: достаточно периодических кадров/пингов; при истечении сессии создаём новую.
- Soniox: стандартный WS; корректное завершение — пустой бинарный кадр, затем ждём `finished`.

### 4) HTTP режим (для ElevenLabs и др.)
- У ElevenLabs сейчас нет публичного realtime‑WS: используем батч‑транспорт с буферизатором.
- Политика флеша:
  - `intervalMs: 3000` (по умолчанию), `minDurationMs: 700`, `flushOnSegmentEnd: true` (с VAD).
  - Формируем WAV/PCM16 16 kHz mono из нормализованных кадров и отправляем.
- `onPartial` в HTTP не эмитится — только финальные `onTranscript`.

### 4a) Live‑режим поверх HTTP (эмуляция)
- Требование DX: `useTranscription` должен работать в режиме LIVE как с WS, так и с HTTP‑провайдерами.
- Реализуем абстракцию «live‑over‑http» в runtime:
  - Буферизация и периодический `flush` (по таймеру и/или по VAD‑сегменту).
  - Параметры: `intervalMs` (по умолчанию 3000), `minDurationMs` (700), `overlapMs` (500) для повышения стабильности, `maxInFlight` (1–2), `timeoutMs` (10000).
  - Аггрегатор результатов: дифф текста (LCP + выравнивание по таймстемпам, если есть) → эмитим `onPartial` как текущий накопленный текст; всё, что подтверждено повторно в следующем чанке, считаем финализированным и эмитим через `onTranscript` (с границами сегмента).
  - `forceEndpoint()` в HTTP‑режиме = немедленный flush текущего окна с пометкой сегмента как final.
  - Гарантия: интерфейс `useTranscription` одинаков — есть `partial` и `transcript`, разница лишь в источнике (WS vs HTTP буферизатор).
  - Ограничения: латентность LIVE над HTTP зависит от `intervalMs` и провайдера; рекомендуем 1.5–3.0 с для баланса.
  - Провайдер‑специфика: если API возвращает слова/таймстемпы (Deepgram batch, Gladia), совмещаем по временным меткам; если возвращает только текст (OpenAI), используем text‑diff с overlap.


### 5) Каналы и стерео
- По умолчанию `channels: 1` с `stereoStrategy: 'downmix'`.
- Deepgram: поддерживаем `multichannel=true`; предупреждаем о тарификации «за канал».
- Если источник моно, а запрошено `channels: 2` — поведение задокументировано как upmix (дублирование моно), но по умолчанию оставляем 1 канал (с предупреждением).

### 6) Endpointing / конец реплики
- Единый метод `forceEndpoint()` на `TranscriptionStream`:
  - AssemblyAI → маппим на `ForceEndpoint`.
  - Soniox → «manual finalization» (зафинализировать текущую реплику без закрытия WS).
  - Deepgram → используем параметр `endpointing` и/или поддерживаемый сигнал, если доступен.

### 7) Ошибки и диагностика
- Таксономия ошибок: `Auth | Network | RateLimit | FormatMismatch | Provider | Timeout`.
- Диаг‑хук `debug(event)` без `console.*` внутри библиотеки. События: `connect`, `close{code,reason}`, `retry{attempt,delay}`, `flush{bytes,duration}`, `send{bytes}`, `recv{type,size}`.
- Маппинг кодов WS/ответов провайдера в унифицированные ошибки (например, 401/403 → Auth; 429 → RateLimit).

### 8) Security (клиент‑браузер)
- Никогда не вшивать постоянные ключи; поддерживаем `tokenProvider: () => Promise<string>`.
- Deepgram: в браузере используем `Sec-WebSocket-Protocol: token,<key>` с фолбэком `?token=`.
- AssemblyAI: эфемерные токены или заголовок на сервере.
- Soniox: ключ в первом JSON‑сообщении WS — для браузера только временные ключи.

### 9) DX: уровни абстракции
- «Простой» уровень: `useTranscription({ provider, autoConnect: true })` — сам создаёт recorder, берёт формат у провайдера, подписывает и запускает.
- «Продвинутый» уровень: `provider.stream()` + `rec.subscribeFrames(stream.send)`.
- Подписки возвращают функцию‑отписку (никаких объектов). Три подписки:
  - `subscribeFrames` — нормализованные кадры под `format`.
  - `subscribeRawFrames` — нативные кадры источника (без нормализации).
  - `subscribeSpeechFrames` — только кадры речи (VAD) с pre‑roll/hangover.

Дополнительно: выбор транспорта для LIVE
- Опция хука/рантайма: `liveTransport: 'auto' | 'ws' | 'http'`.
  - `'auto'` (по умолчанию): если провайдер умеет WS — используем WS; иначе — HTTP‑эмуляцию LIVE (см. §4a).
  - `'ws'`: строго WebSocket (если не поддержан — ошибка совместимости).
  - `'http'`: принудительно HTTP‑эмуляция (для тестов/ограничений сети).


### 10) Источники и формат
- Публичное API источника: `source: { microphone: { deviceId? } }` — без прямых браузерных флагов.
- Пресет обработки: `processing: 'speech' | 'raw'` (внутри маппим на echoCancellation/noiseSuppression/AGC).
- `constraints` — deprecated (сейчас поддерживаем, удалить в следующем релизном цикле; см. «Депрекейты» ниже).

### 11) Маппинг провайдеров (главные отличия)
- Deepgram
  - WS realtime, interim results, `encoding=linear16&sample_rate=16000`, keepalive, multichannel, language=multi.
  - Preferred формат: PCM16 16 kHz mono.
- AssemblyAI
  - WS realtime; `sample_rate` обязателен; `encoding: 'pcm_s16le'|'pcm_mulaw'`.
  - «Immutable tokens»: частичное слово может уточняться, финальные слова не меняются.
  - Служебные сообщения: `UpdateConfiguration`, `ForceEndpoint`, `Terminate`.
- Soniox
  - WS realtime; ключ в первом JSON; токены «on the fly», manual finalization, длинные сессии (до 5 ч).
  - Preferred: PCM16 16 kHz mono; опционально `audio_format: 'auto'` (в будущем pass‑through для Opus/WebM).
- ElevenLabs
  - Сейчас только async HTTP STT: буферизатор, только финальные результаты, без partial.

### Дополнение: OpenAI (Audio Transcription API)

- Транспорт: `http` (batch). Реализуем провайдер поверх REST `/v1/audio/transcriptions` и `/v1/audio/translations`.
- Модели: `whisper-1` и семейство GPT‑4o Transcribe (`gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gpt-4o-transcribe-diarize`). Выбор — через параметр `model`.
- Ввод: multipart/form-data с полем `file` (поддержка m4a, mp3, mp4, mpeg, mpga, wav, webm) и `model`. Лимит ~25 MB на запрос. Наш буферизатор должен гарантировать размер чанка <25 MB.
- Вывод:
  - `response_format: 'json'|'text'|'verbose_json'|'srt'|'vtt'`.
  - Для diarization‑модели — проприетарный формат `diarized_json` (содержит `speaker`, `text`, `start`, `end`).
- Маппинг в `TranscriptResult`:
  - Основной текст → `text`.
  - Таймстемпы/слова (если есть) → `words`.
  - Диаризация → либо обогащаем `words` (speaker на слово/фрагмент), либо складываем в `metadata.diarization` (решение зафиксируем на этапе реализации; склоняюсь к первому варианту при наличии детальных меток).
- Особенности:
  - Нет `onPartial` — только финальные результаты батчами.
  - Для режима “псевдо‑realtime” используем наш HTTP‑буферизатор (см. §4), формируем WAV/PCM16 16 kHz mono из нормализованных кадров и отправляем с интервалом (по умолчанию 3 с) или по окончанию сегмента VAD.
- Security: `Authorization: Bearer` — ключ держим только на сервере/прокси. В браузере — только через наш прокси‑роут.
- Research gap: возможный OpenAI Realtime API/WebSocket/WebRTC — в этом файле не покрыт, оставляем как отдельную фазу спецификации после доп.ресёрча.

### 12) Депрекейты (жёсткий план)
- `constraints` в `RecorderOptions` — deprecated сейчас; удаляем в ближайшем мажорном апдейте. Миграция: `source` + `format`.
- Доступ к нативному recorder из хука (`rec.recorder`) — deprecated; публично: опция `recorder` на вход и необязательное поле `recorder?` на выходе `useTranscription` при авто‑создании.

### 13) Тест‑план (добавки)
- DSP/нормализация: 48k→16k, downmix 2→1, отсутствие NaN, <2 мс на 20 мс кадр.
- Типы: `NormalizedFrame<'pcm16'>` сквозь runtime и обёртки.
- WS‑интеграция (моки): open → поток partial/immutable → final → close; reconnect/backoff; keepalive.
- HTTP‑интеграция: интервальные flush, `flushOnSegmentEnd`, корректный WAV, ошибки/ретраи.
- E2E: быстрый start/stop, отсутствие потерь первых кадров (onReady‑буфер).
- Провайдер‑специфика: AssemblyAI `ForceEndpoint`/immutable tokens; Deepgram `multichannel`; Soniox manual finalization/пустой фрейм на завершение.

### 14) Фазы (обновлённые)
- Фаза 1: Базовые типы (уже) + `TranscriptionError`, `StreamStatus`, `UnsubscribeHandle`.
- Фаза 2: Deepgram провайдер (WS) + format negotiation, keepalive/retry, тест‑план WS.
- Фаза 3: AssemblyAI провайдер (WS) + `ForceEndpoint`/immutable tokens.
- Фаза 3a: Soniox провайдер (WS) + manual finalization, длинные сессии; pass‑through (Opus/WebM) — как экспериментальный.
- Фаза 4: ElevenLabs (HTTP) + буферизатор, VAD‑flush, webhooks (позже) и async API.
  - OpenAI (HTTP) в той же фазе: поддержка `whisper-1` и `gpt‑4o‑transcribe*`, варианты `response_format`, парсинг `diarized_json`.
  - Live‑over‑HTTP: реализация аггрегатора (overlap/diff/partial→final), `forceEndpoint()` → flush.
- Фаза 5: Хуки и DX: `useTranscription` в Vue/React; presets источника; удаление `constraints`/`rec.recorder`.
- Фаза 6: Документация: Security best practices, миграции, сравнение провайдеров.

### Дополнение: Gladia (пятый провайдер)

Gladia добавляет «двухшаговую» инициализацию realtime‑сессии и богатый набор пост‑обработки.

- Транспорт: `websocket` realtime + `http` async (batch).
- Инициализация (двухшаговая):
  - `POST /v2/live` с `x-gladia-key` → `201` с `session_id` и `wss://.../v2/live?token=...`.
  - Браузер подключается по выданному `wss` URL без передачи ключа.
  - Параметр `region`: `us-west` | `eu-west` (для снижения латентности).
- Формат:
  - Preferred: `{ encoding: 'pcm16', sampleRate: 16000, channels: 1 }`.
  - Supported: PCM/A‑law/μ‑law; `sampleRate: 8k/16k/32k/44.1k/48k`; `channels: 1..8` (возможен multichannel).
- Endpointing/partials:
  - Авто‑разбиение паузами (`endpointing`), `maximum_duration_without_endpointing`.
  - Сообщения `transcript` с `is_final` (partial vs final).
- Управляющие команды:
  - Завершение аудиоввода — `{"type":"stop_recording"}` (после этого приходят post‑processing события).
  - Частичная финализация текущей реплики без остановки стрима — не документирована (для `forceEndpoint()` делаем no‑op).
- Callbacks и пост‑обработка:
  - `callback: true` + `callback_config` → серверные веб‑хуки.
  - `receive_post_processing_events`: summarization, NER, subtitles и т.п. после `stop_recording`.
- Security/DX:
  - Хранить `x-gladia-key` на сервере; в браузер отдавать только `sessionUrl` (или `token`).
  - В провайдере поддержать 2 пути `connect()`:
    1) `sessionUrl` уже известен (выдан бэкендом) → сразу `wss`.
    2) `sessionInit` (region, конфиг) → провайдер сам сделает `POST /v2/live` (Node/SSR), вернёт `wss` и подключится.
- Маппинг в наш контракт:
  - `transport: 'websocket'`, `getPreferredFormat()` возвращает PCM16 16 kHz mono.
  - `onPartial`/`onTranscript` — по `is_final`.
  - `forceEndpoint()` — `not supported` (no‑op); рекомендуем настраивать `endpointing` и/или использовать VAD‑сегментацию на клиенте.
- Тест‑план:
  - Двухшаговый handshake: `POST /v2/live` → `wss` → `connect()`.
  - Поток partial/final; корректное завершение `stop_recording` и получение post‑processing событий.
  - Реконнект по `session_id` (при наличии) и политика retry; no‑retry для Auth/FormatMismatch.
