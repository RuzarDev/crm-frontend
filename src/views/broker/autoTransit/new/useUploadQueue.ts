import { computed, getCurrentInstance, markRaw, onBeforeUnmount, ref } from 'vue'
import * as api from '@/api/autoTransit'
import type { TruckCard, UploadOpts } from '@/api/autoTransit'
import { errorKey } from '../autoTransit'

// Очередь загрузки файлов машины «Авто-транзита» (задача 10): связь на границе слабая, поэтому файлы уходят строго
// по одному, ошибка одного не теряет остальные, упавший можно повторить. Используют страница «Новая машина» (файлы
// выбираются ещё до того, как машина заведена) и карточка машины («Добавить фото / файл»).
//  • сеть и 5xx — failed с общим текстом; 400 — первый текст сервера (или общий ключ); 409 — текст кода;
//  • 409 archived — очередь останавливается, оставшиеся тоже failed с этим кодом (в архивную машину грузить нельзя);
//  • после размонтирования новые загрузки не начинаются, а состояние больше не трогается.

export type QueueState = 'queued' | 'uploading' | 'done' | 'failed'

export interface QueueItem {
  /** Ключ строки (для v-for). */
  key: number
  name: string
  size: number
  state: QueueState
  /** 0–100. */
  progress: number
  /** Ключ i18n текста ошибки; при errorText — null. */
  errorKey: string | null
  /** Текст ошибки от сервера (400), уже на языке пользователя. */
  errorText: string | null
  /** Можно ли повторить (после 409 archived — нельзя). */
  retryable: boolean
  file: File
  opts: QueueOpts
}

/** Параметры загрузки файла и пометки экрана: stamped — после загрузки отметить «с печатью» (чип «нет инвойса с печатью»). */
export type QueueOpts = UploadOpts & { stamped?: boolean }

export type RejectReason = 'tooBig' | 'badType'
export interface Rejected { name: string; reason: RejectReason }

export interface RunSummary {
  /** Сколько файлов загружено за этот проход. */
  done: number
  /** Имена файлов, которые сейчас в состоянии failed. */
  failed: string[]
  /** Код 409, остановивший очередь (archived), иначе null. */
  stopCode: string | null
  /** Сколько файлов упало за этот проход. */
  failedNow: number
}

/** Как показать ошибку загрузки: ключ i18n или готовый текст, можно ли повторить, остановить ли очередь. */
export interface QueueFailure { key?: string; text?: string | null; retryable?: boolean; stop?: boolean }

export interface UploadQueueOptions {
  /** Свежая карточка после каждого успешного файла (и строка этого файла). Только без send. */
  onCard?: (card: TruckCard, item: QueueItem) => void
  /** Проход очереди закончился (не зовётся после размонтирования). */
  onIdle?: (summary: RunSummary) => void
  /**
   * Своя отправка файла вместо загрузки в машину модуля (страница ссылки загрузки, очередь 3): id — то, что вернул
   * truckId() (там — токен ссылки). Ответ уходит в onResult.
   */
  send?: (id: string, file: File, opts: UploadOpts, onProgress: (fraction: number) => void) => Promise<unknown>
  onResult?: (result: unknown, item: QueueItem) => void
  /** Свой разбор ошибки; null — как обычно (сеть, 400, 409). */
  classify?: (status: number | undefined, data: unknown, error: unknown) => QueueFailure | null
  /**
   * 429 — не ошибка, а «подождите»: пауза по Retry-After (иначе 15 с) и повтор того же файла; после 5 пауз подряд —
   * ошибка с «Повторить». Для публичной ссылки: лимит частоты 20 запросов в минуту.
   */
  retryOn429?: boolean
}

/** Коды 409, после которых грузить в эту машину бессмысленно — очередь встаёт. */
const STOP_CODES = ['archived']
export const UPLOAD_FAILED_KEY = 'broker.autoTransit.upload.failed'
export const UPLOAD_BAD_FILE_KEY = 'broker.autoTransit.upload.badFile'
/** Строка ждёт повтора после 429 (в очереди, не ошибка). */
export const UPLOAD_WAIT_KEY = 'broker.autoTransit.upload.waitRetry'
export const UPLOAD_TOO_FREQUENT_KEY = 'broker.autoTransit.upload.tooFrequent'
const WAIT_DEFAULT_MS = 15_000
const WAIT_MAX_MS = 60_000
const WAIT_TRIES = 5

/** Пауза после 429: Retry-After в секундах (1–60), иначе 15 с. */
export const retryAfterMs = (e: unknown): number => {
  const headers = (e as { response?: { headers?: Record<string, unknown> } })?.response?.headers
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After']
  const sec = Number(raw)
  return Number.isFinite(sec) && sec > 0 ? Math.min(WAIT_MAX_MS, Math.max(1000, sec * 1000)) : WAIT_DEFAULT_MS
}

const EXTENSIONS = api.UPLOAD_ACCEPT.split(',').map((s) => s.trim().toLowerCase())
/** Проверка при выборе: тип по расширению (как сервер) и лимит размера. */
export const rejectReason = (f: File): RejectReason | null => {
  const name = f.name.toLowerCase()
  if (!EXTENSIONS.some((ext) => name.endsWith(ext))) return 'badType'
  if (f.size > api.UPLOAD_MAX_BYTES) return 'tooBig'
  return null
}

interface HttpError { response?: { status?: number; data?: unknown } }

/** Первый текст из 400 { errors: { поле: [тексты] } } или { error }. */
const serverText = (data: unknown): string | null => {
  const d = data as Record<string, unknown> | undefined
  const errs = d?.errors
  if (errs && typeof errs === 'object') {
    for (const v of Object.values(errs as Record<string, unknown>)) {
      const first = Array.isArray(v) ? v[0] : v
      if (typeof first === 'string' && first.trim()) return first
    }
  }
  return typeof d?.error === 'string' && d.error.trim() ? d.error : null
}

export function useUploadQueue(truckId: () => string | null, o: UploadQueueOptions = {}) {
  const items = ref<QueueItem[]>([])
  const running = ref(false)
  let alive = true
  let seq = 0
  let current: Promise<RunSummary> | null = null

  const count = (...states: QueueState[]) => items.value.filter((i) => states.includes(i.state)).length
  const pending = computed(() => count('queued', 'uploading'))
  const failedCount = computed(() => count('failed'))
  const doneCount = computed(() => count('done'))

  /** Добавить файлы в очередь (не запускает её). Возвращает отклонённые при выборе: тип и размер. */
  const add = (files: File[], opts: QueueOpts = {}): Rejected[] => {
    const rejected: Rejected[] = []
    for (const f of files) {
      const reason = rejectReason(f)
      if (reason) {
        rejected.push({ name: f.name, reason })
        continue
      }
      items.value.push({
        key: ++seq, name: f.name, size: f.size, state: 'queued', progress: 0, errorKey: null, errorText: null, retryable: true,
        // File в реактивной обёртке FormData не примет.
        file: markRaw(f), opts: { ...opts },
      })
    }
    return rejected
  }

  /** Убрать строку, которая ещё не загружается (в очереди или упала). */
  const remove = (index: number) => {
    const it = items.value[index]
    if (it && (it.state === 'queued' || it.state === 'failed')) items.value.splice(index, 1)
  }
  /** Убрать загруженные строки (карточка после прохода: файлы уже видны в документах). */
  const clearDone = () => { items.value = items.value.filter((i) => i.state !== 'done') }
  /** Убрать всё, кроме загружающегося сейчас (другая машина на карточке). */
  const clear = () => { items.value = items.value.filter((i) => i.state === 'uploading') }

  let failedNow = 0
  const fail = (it: QueueItem, key: string | null, text: string | null = null, retryable = true) => {
    failedNow++
    it.retryable = retryable
    it.state = 'failed'
    it.progress = 0
    it.errorKey = text ? null : key
    it.errorText = text
  }

  const sleep = (ms: number) => new Promise<void>((res) => { setTimeout(res, ms) })
  /** Сколько пауз 429 подряд у строки (по ключу строки). */
  const waits = new Map<number, number>()

  const run = async (id: string): Promise<RunSummary> => {
    running.value = true
    failedNow = 0
    let done = 0
    let stopCode: string | null = null
    try {
      while (alive) {
        const it = items.value.find((i) => i.state === 'queued')
        if (!it || truckId() !== id) break
        it.state = 'uploading'
        it.progress = 0
        it.errorKey = null
        it.errorText = null
        try {
          const { partyId, kind } = it.opts
          const up: UploadOpts = { ...(partyId ? { partyId } : {}), ...(kind ? { kind } : {}) }
          const progress = (fraction: number) => { if (alive && it.state === 'uploading') it.progress = Math.round(fraction * 100) }
          const res = o.send ? await o.send(id, it.file, up, progress) : await api.uploadFile(id, it.file, up, progress, { silent: true })
          if (!alive) break
          it.state = 'done'
          it.progress = 100
          waits.delete(it.key)
          done++
          if (o.send) o.onResult?.(res, it)
          else o.onCard?.(res as TruckCard, it)
        } catch (e) {
          if (!alive) break
          const status = (e as HttpError)?.response?.status
          const data = (e as HttpError)?.response?.data
          if (status === 429 && o.retryOn429) {
            const n = (waits.get(it.key) ?? 0) + 1
            if (n <= WAIT_TRIES) {
              waits.set(it.key, n)
              it.state = 'queued'
              it.progress = 0
              it.errorKey = UPLOAD_WAIT_KEY
              await sleep(retryAfterMs(e))
              continue
            }
            waits.delete(it.key)
            fail(it, UPLOAD_TOO_FREQUENT_KEY)
            continue
          }
          const custom = o.classify?.(status, data, e) ?? null
          if (custom) {
            fail(it, custom.key ?? UPLOAD_FAILED_KEY, custom.text ?? null, custom.retryable ?? true)
            if (custom.stop) {
              for (const rest of items.value) if (rest.state === 'queued') fail(rest, custom.key ?? UPLOAD_FAILED_KEY, custom.text ?? null, false)
              break
            }
          } else if (status === 409) {
            const code = String((data as Record<string, unknown> | undefined)?.code ?? '')
            const stop = STOP_CODES.includes(code)
            fail(it, errorKey(code), null, !stop)
            if (stop) {
              stopCode = code
              for (const rest of items.value) if (rest.state === 'queued') fail(rest, errorKey(code), null, false)
              break
            }
          } else if (status === 400) {
            fail(it, UPLOAD_BAD_FILE_KEY, serverText(data))
          } else {
            fail(it, UPLOAD_FAILED_KEY)
          }
        }
      }
    } finally {
      if (alive) running.value = false
    }
    const summary: RunSummary = { done, failed: items.value.filter((i) => i.state === 'failed').map((i) => i.name), stopCode, failedNow }
    if (alive) o.onIdle?.(summary)
    return summary
  }

  /**
   * Запустить очередь. Пока идёт проход для этой же машины — возвращает его же (новые файлы он подхватит сам).
   * Идёт проход для другой машины (карточку переключили во время загрузки) — новый проход встаёт следом за ним.
   */
  let currentId: string | null = null
  const start = (): Promise<RunSummary> => {
    const id = truckId()
    if (!alive || !id) return current ?? Promise.resolve({ done: 0, failed: [], stopCode: null, failedNow: 0 })
    if (current && currentId === id) return current
    const before = current
    // Без предыдущего прохода — сразу (running выставляется синхронно).
    const p: Promise<RunSummary> = (before ? before.then(() => run(id), () => run(id)) : run(id))
      .finally(() => { if (current === p) { current = null; currentId = null } })
    current = p
    currentId = id
    return p
  }

  const retry = (index: number): Promise<RunSummary> => {
    const it = items.value[index]
    if (it?.state === 'failed' && it.retryable) {
      it.state = 'queued'
      it.errorKey = null
      it.errorText = null
    }
    return start()
  }
  const retryAll = (): Promise<RunSummary> => {
    for (const it of items.value) {
      if (it.state !== 'failed' || !it.retryable) continue
      it.state = 'queued'
      it.errorKey = null
      it.errorText = null
    }
    return start()
  }

  if (getCurrentInstance()) onBeforeUnmount(() => { alive = false })

  return { items, add, remove, start, retry, retryAll, clearDone, clear, pending, failedCount, doneCount, running }
}

export type UploadQueue = ReturnType<typeof useUploadQueue>
