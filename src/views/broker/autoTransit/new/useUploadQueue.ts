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
  file: File
  opts: UploadOpts
}

export type RejectReason = 'tooBig' | 'badType'
export interface Rejected { name: string; reason: RejectReason }

export interface RunSummary {
  /** Сколько файлов загружено за этот проход. */
  done: number
  /** Имена файлов, которые сейчас в состоянии failed. */
  failed: string[]
  /** Код 409, остановивший очередь (archived), иначе null. */
  stopCode: string | null
}

export interface UploadQueueOptions {
  /** Свежая карточка после каждого успешного файла. */
  onCard?: (card: TruckCard) => void
  /** Проход очереди закончился (не зовётся после размонтирования). */
  onIdle?: (summary: RunSummary) => void
}

/** Коды 409, после которых грузить в эту машину бессмысленно — очередь встаёт. */
const STOP_CODES = ['archived']
export const UPLOAD_FAILED_KEY = 'broker.autoTransit.upload.failed'
export const UPLOAD_BAD_FILE_KEY = 'broker.autoTransit.upload.badFile'

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
  const add = (files: File[], opts: UploadOpts = {}): Rejected[] => {
    const rejected: Rejected[] = []
    for (const f of files) {
      const reason = rejectReason(f)
      if (reason) {
        rejected.push({ name: f.name, reason })
        continue
      }
      items.value.push({
        key: ++seq, name: f.name, size: f.size, state: 'queued', progress: 0, errorKey: null, errorText: null,
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

  const fail = (it: QueueItem, key: string | null, text: string | null = null) => {
    it.state = 'failed'
    it.progress = 0
    it.errorKey = text ? null : key
    it.errorText = text
  }

  const run = async (id: string): Promise<RunSummary> => {
    running.value = true
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
          const c = await api.uploadFile(id, it.file, it.opts, (fraction) => {
            if (alive && it.state === 'uploading') it.progress = Math.round(fraction * 100)
          })
          if (!alive) break
          it.state = 'done'
          it.progress = 100
          done++
          o.onCard?.(c)
        } catch (e) {
          if (!alive) break
          const status = (e as HttpError)?.response?.status
          const data = (e as HttpError)?.response?.data
          if (status === 409) {
            const code = String((data as Record<string, unknown> | undefined)?.code ?? '')
            fail(it, errorKey(code))
            if (STOP_CODES.includes(code)) {
              stopCode = code
              for (const rest of items.value) if (rest.state === 'queued') fail(rest, errorKey(code))
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
    const summary: RunSummary = { done, failed: items.value.filter((i) => i.state === 'failed').map((i) => i.name), stopCode }
    if (alive) o.onIdle?.(summary)
    return summary
  }

  /** Запустить очередь. Пока идёт проход — возвращает его же (новые файлы он подхватит сам). */
  const start = (): Promise<RunSummary> => {
    if (current) return current
    const id = truckId()
    if (!alive || !id) return Promise.resolve({ done: 0, failed: [], stopCode: null })
    current = run(id).finally(() => { current = null })
    return current
  }

  const retry = (index: number): Promise<RunSummary> => {
    const it = items.value[index]
    if (it?.state === 'failed') {
      it.state = 'queued'
      it.errorKey = null
      it.errorText = null
    }
    return start()
  }
  const retryAll = (): Promise<RunSummary> => {
    for (const it of items.value) {
      if (it.state !== 'failed') continue
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
