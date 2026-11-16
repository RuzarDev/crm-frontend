import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as api from '@/api/autoTransit'
import type { FilePatch, PartyFields, TdBody, TruckCard, TruckFields, UploadOpts } from '@/api/autoTransit'
import { message } from '@/ui/message'
import { errorKey } from '../autoTransit'

// Карточка машины «Авто-транзита» (задача 9): загрузка, фоновое перечитывание раз в 60 с, все правки.
// Каждая правка отвечает свежей карточкой целиком — она заменяет card. Ошибки:
//  • 409 { code } — тост t(errorKey(code)) и перечитывание карточки (для conflict текст просит повторить);
//  • 400 { errors: { поле: [тексты] } } — первая строка каждого поля уходит форме (fieldErrors);
//  • прочее — общий тост перехватчика (кроме фонового перечитывания: оно silent и пишет только reloadError).
// Загрузка файлов — одна точка входа upload(files, opts): задача 10 заменит её общей очередью.

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
  const busy = computed(() => pending.value > 0)
  const uploading = ref<UploadProgress | null>(null)

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
   * Загрузить файлы по одному (один файл — один запрос). Слишком большие пропускаются с тостом,
   * ошибка одного файла не останавливает остальные. Прогресс — uploading. Задача 10 заменит эту функцию очередью.
   */
  const upload = async (files: File[], o: UploadOpts = {}): Promise<UploadSummary> => {
    const list = files.filter((f) => {
      if (f.size <= api.UPLOAD_MAX_BYTES) return true
      message.error(t('broker.autoTransit.file.tooBig', { name: f.name, mb: Math.round(api.UPLOAD_MAX_BYTES / 1024 / 1024) }))
      return false
    })
    const summary: UploadSummary = { done: 0, failed: [] }
    if (!list.length) return summary
    pending.value++
    try {
      for (const [n, f] of list.entries()) {
        if (!alive) break
        uploading.value = { index: n + 1, total: list.length, name: f.name, fraction: 0 }
        const res = await run((i) => api.uploadFile(i, f, o, (fraction) => {
          if (uploading.value) uploading.value = { ...uploading.value, fraction }
        }))
        if (res.ok) summary.done++
        else summary.failed.push(f.name)
      }
    } finally {
      uploading.value = null
      pending.value--
    }
    if (summary.done) message.success(t('broker.autoTransit.file.uploaded', { n: summary.done }))
    return summary
  }

  // ---- Фоновое перечитывание: раз в 60 с при видимой вкладке, не при окнах, правках и загрузке ----
  let timer: ReturnType<typeof setInterval> | undefined
  const canPoll = () => !busy.value && !uploading.value && !opts.paused?.()
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
  }
}

export type TruckState = ReturnType<typeof useTruck>
