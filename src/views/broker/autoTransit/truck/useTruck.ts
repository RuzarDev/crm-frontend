import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as api from '@/api/autoTransit'
import type { FilePatch, PartyFields, TdBody, TruckCard, TruckFields, UploadOpts } from '@/api/autoTransit'
import { message } from '@/ui/message'
import { errorKey } from '../autoTransit'
import { useUploadQueue, type QueueItem } from '../new/useUploadQueue'
import { RECIPIENT_KINDS } from './truckView'

// Карточка машины «Авто-транзита» (задача 9): загрузка, фоновое перечитывание раз в 60 с, все правки.
// Каждая правка отвечает свежей карточкой целиком — она заменяет card. Ошибки:
//  • 409 { code } — тост t(errorKey(code)) и перечитывание карточки (для conflict текст просит повторить);
//  • 400 { errors: { поле: [тексты] } } — первая строка каждого поля уходит форме (fieldErrors);
//  • прочее — общий тост перехватчика (кроме фонового перечитывания: оно silent и пишет только reloadError).
// Загрузка файлов — одна точка входа upload(files, opts) через общую очередь useUploadQueue (задача 10): строки
// файлов с ходом загрузки и «Повторить» у упавших — queue.

export const POLL_MS = 60_000

export type ActionResult =
  | { ok: true; card: TruckCard }
  | { ok: false; status?: number; code?: string; fieldErrors: Record<string, string> }

export interface UploadProgress {
  /** Номер текущего файла (с 1) и всего в пачке. */
  index: number
  total: number
  name: string
  /** Доля текущего файла 0..1. */
  fraction: number
}

export interface UploadSummary { done: number; failed: string[] }

interface HttpError { response?: { status?: number; data?: unknown } }
const statusOf = (e: unknown) => (e as HttpError)?.response?.status
const dataOf = (e: unknown) => (e as HttpError)?.response?.data as Record<string, unknown> | undefined

/** Первая строка каждого поля из 400 { errors: { поле: [тексты] | текст } }. */
export function fieldErrorsOf(e: unknown): Record<string, string> {
  const raw = dataOf(e)?.errors
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const first = Array.isArray(v) ? v[0] : v
    if (typeof first === 'string' && first.trim()) out[k.charAt(0).toLowerCase() + k.slice(1)] = first
  }
  return out
}

export interface UseTruckOptions {
  /** Фоновое перечитывание на паузе (открыто окно и т. п.). */
  paused?: () => boolean
}

export function useTruck(id: () => string, opts: UseTruckOptions = {}) {
  const { t } = useI18n()
  const card = ref<TruckCard | null>(null)
  const loading = ref(false)
  const notFound = ref(false)
  const loadError = ref(false)
  /** Фоновое перечитывание не удалось — карточка на экране может быть устаревшей. */
  const reloadError = ref(false)
  const pending = ref(0)

  // Поколение карточки: ответ перечитывания, начатого до свежей правки, её не перезапишет.
  let gen = 0
  let alive = true
  let loadedAt = 0
  const setCard = (c: TruckCard) => {
    gen++
    card.value = c
    loadedAt = Date.now()
    reloadError.value = false
  }

  // Очередь загрузки: ответ каждого файла — свежая карточка (если это всё ещё та же машина). По окончании прохода —
  // тост «Загружено файлов: N» (для загруженных прямо в партию — один тост на партию: видны ли они её получателю),
  // загруженные строки убираются (файлы уже в документах), упавшие остаются с «Повторить».
  // Файлы с пометкой stamped (чип «нет инвойса с печатью») отмечаются «с печатью» после прохода — по одному.
  const toStamp: string[] = []
  const partyToasts = (done: QueueItem[]) => {
    const byParty = new Map<string, QueueItem[]>()
    for (const it of done) if (it.opts.partyId) byParty.set(it.opts.partyId, [...(byParty.get(it.opts.partyId) ?? []), it])
    for (const [partyId, list] of byParty) {
      const p = card.value?.parties.find((x) => x.id === partyId)
      if (!p) continue
      const visible = list.filter((i) => !!i.opts.kind && RECIPIENT_KINDS.includes(i.opts.kind)).length
      const n = list.length
      const key = visible === n ? 'partyUploadedVisible' : visible === 0 ? 'partyUploadedHidden' : 'partyUploadedSome'
      message.success(t(`broker.autoTransit.file.${key}`, { n, p: p.number, v: visible }))
    }
  }
  const queue = useUploadQueue(() => id() || null, {
    onCard: (c, it) => {
      if (!alive || c.id !== id()) return
      const before = new Set((card.value?.files ?? []).map((f) => f.id))
      setCard(c)
      if (it.opts.stamped) {
        const added = c.files.find((f) => !before.has(f.id) && f.kind === it.opts.kind && (f.partyId ?? null) === (it.opts.partyId ?? null))
        if (added && !added.stamped) toStamp.push(added.id)
      }
    },
    onIdle: (sum) => {
      const done = queue.items.value.filter((i) => i.state === 'done')
      const general = done.filter((i) => !i.opts.partyId).length
      if (general) message.success(t('broker.autoTransit.file.uploaded', { n: general }))
      partyToasts(done)
      queue.clearDone()
      const stamps = toStamp.splice(0)
      if (stamps.length && alive && !sum.stopCode) {
        void (async () => { for (const fileId of stamps) if ((await patchFile(fileId, { stamped: true })).ok === false) break })()
      }
      if (sum.stopCode) {
        message.error(t(errorKey(sum.stopCode)))
        if (alive) void reload()
      } else if (sum.failedNow) {
        // Одна сводка за проход вместо общего тоста на каждый файл (запросы очереди — silent).
        message.error(t('broker.autoTransit.upload.failedSummary', { n: sum.failedNow }))
      }
    },
  })
  const busy = computed(() => pending.value > 0 || queue.running.value)
  /** Ход загрузки текущего файла (для подписи «Загрузка i из n»). */
  const uploading = computed<UploadProgress | null>(() => {
    const list = queue.items.value
    const n = list.findIndex((i) => i.state === 'uploading')
    if (n < 0) return null
    const it = list[n]!
    return { index: n + 1, total: list.length, name: it.name, fraction: it.progress / 100 }
  })

  const reload = async (o: { silent?: boolean } = {}): Promise<void> => {
    const myId = id()
    if (!myId) return
    const myGen = ++gen
    if (!card.value) loading.value = true
    try {
      const c = await (o.silent ? api.getTruck(myId, { silent: true }) : api.getTruck(myId))
      if (!alive || myGen !== gen || myId !== id()) return
      card.value = c
      loadedAt = Date.now()
      notFound.value = false
      loadError.value = false
      reloadError.value = false
    } catch (e) {
      if (!alive || myGen !== gen || myId !== id()) return
      if (statusOf(e) === 404) {
        notFound.value = true
        card.value = null
      } else if (card.value) reloadError.value = true
      else loadError.value = true
    } finally {
      loading.value = false
    }
  }

  /** Общая обёртка правки: ответ — новая карточка; 409 — тост и перечитывание; 400 — ошибки полей. */
  /**
   * truckId — машина, для которой действие создано (кнопка в тосте): после ухода с карточки или перехода на другую
   * машину запрос не отправляется. Без него — текущая машина.
   */
  const run = async (fn: (truckId: string) => Promise<TruckCard>, truckId?: string): Promise<ActionResult> => {
    const myId = truckId ?? id()
    if (!alive || !myId || myId !== id()) return { ok: false, fieldErrors: {} }
    pending.value++
    try {
      const c = await fn(myId)
      if (alive && myId === id()) setCard(c)
      return { ok: true, card: c }
    } catch (e) {
      const status = statusOf(e)
      if (status === 409) {
        const code = String(dataOf(e)?.code ?? '')
        message.error(t(errorKey(code)))
        if (alive && myId === id()) void reload()
        return { ok: false, status, code, fieldErrors: {} }
      }
      if (status === 400) {
        const fieldErrors = fieldErrorsOf(e)
        const general = dataOf(e)?.error
        // Формы этой карточки молчат на 400 (silentStatuses) — без полей текст нужен хотя бы тостом.
        if (!Object.keys(fieldErrors).length) message.error(typeof general === 'string' && general ? general : t('broker.autoTransit.error.unknown'))
        return { ok: false, status, fieldErrors }
      }
      return { ok: false, status, fieldErrors: {} }
    } finally {
      pending.value--
    }
  }

  const mark = (stage: number, note?: string) => run((i) => api.markStage(i, stage, note))
  const undo = (truckId?: string) => run((i) => api.undoStage(i), truckId)
  const submit = (partyId: string) => run((i) => api.submitParty(i, partyId))
  const unsubmit = (partyId: string) => run((i) => api.unsubmitParty(i, partyId))
  const setTd = (partyId: string, body: TdBody) => run((i) => api.setTd(i, partyId, body))
  const setProblem = (note: string) => run((i) => api.setProblem(i, note))
  const clearProblem = () => run((i) => api.clearProblem(i))
  const archive = () => run((i) => api.archiveTruck(i))
  const updateTruck = (patch: TruckFields) => run((i) => api.updateTruck(i, patch))
  const addParty = (body: PartyFields = {}) => run((i) => api.addParty(i, body))
  const updateParty = (partyId: string, patch: PartyFields) => run((i) => api.updateParty(i, partyId, patch))
  const deleteParty = (partyId: string) => run((i) => api.deleteParty(i, partyId))
  const patchFile = (fileId: string, patch: FilePatch, truckId?: string) => run((i) => api.patchFile(i, fileId, patch), truckId)
  const deleteFile = (fileId: string) => run((i) => api.deleteFile(i, fileId))

  /**
   * Загрузить файлы через очередь: по одному, последовательно; ошибка одного не останавливает остальные. Файлы больше
   * лимита или недопустимого типа не попадают в очередь (тост). Пока идёт проход, новые файлы он подхватит сам.
   */
  const upload = async (files: File[], o: UploadOpts = {}, extra: { stamped?: boolean } = {}): Promise<UploadSummary> => {
    for (const r of queue.add(files, { ...o, ...(extra.stamped ? { stamped: true } : {}) })) {
      message.error(r.reason === 'tooBig'
        ? t('broker.autoTransit.file.tooBig', { name: r.name, mb: Math.round(api.UPLOAD_MAX_BYTES / 1024 / 1024) })
        : t('broker.autoTransit.upload.badType', { name: r.name }))
    }
    if (!queue.pending.value) return { done: 0, failed: [] }
    const sum = await queue.start()
    return { done: sum.done, failed: sum.failed }
  }
  const retryUpload = (index: number) => { void queue.retry(index) }
  const retryAllUploads = () => { void queue.retryAll() }
  const removeUpload = (index: number) => queue.remove(index)

  // ---- Фоновое перечитывание: раз в 60 с при видимой вкладке, не при окнах, правках и загрузке ----
  let timer: ReturnType<typeof setInterval> | undefined
  const canPoll = () => !busy.value && !queue.running.value && !opts.paused?.()
  const tick = () => { if (canPoll()) void reload({ silent: true }) }
  const stop = () => {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
  }
  const start = () => {
    stop()
    timer = setInterval(tick, POLL_MS)
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      stop()
      return
    }
    if (Date.now() - loadedAt >= POLL_MS) tick()
    start()
  }

  watch(id, (next, prev) => {
    if (next === prev) return
    queue.clear()
    card.value = null
    notFound.value = false
    loadError.value = false
    void reload()
  })

  if (getCurrentInstance()) {
    onMounted(() => {
      void reload()
      if (document.visibilityState !== 'hidden') start()
      document.addEventListener('visibilitychange', onVisibility)
    })
    onBeforeUnmount(() => {
      alive = false
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    })
  }

  return {
    card, loading, notFound, loadError, reloadError, busy, uploading,
    reload, mark, undo, submit, unsubmit, setTd, setProblem, clearProblem, archive, updateTruck,
    addParty, updateParty, deleteParty, patchFile, deleteFile, upload,
    queue, retryUpload, retryAllUploads, removeUpload,
  }
}

export type TruckState = ReturnType<typeof useTruck>
