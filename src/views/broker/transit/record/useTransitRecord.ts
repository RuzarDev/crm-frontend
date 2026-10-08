import { computed, nextTick, reactive, ref, shallowRef, toRaw, watch, type ComputedRef, type Ref } from 'vue'
import { reestrApi } from '@/api/reestr'
import { i18n } from '@/i18n'
import type { ReestrEntry, ReestrTransitFields } from '@/types/api'
import { message } from '@/ui/message'
import { serverErrorText } from '@/utils/serverError'
import {
  changedSections,
  draftFromEntry,
  draftToEntry,
  draftToUpsertBody,
  goodsTotals,
  mergeDrafts,
  validateDraft,
  type GoodsTotals,
  type RecordDraft,
  type SectionKey,
} from './recordModel'

export const NEW_RECORD_ID = 'new'

export interface TransitRecord {
  entry: Ref<ReestrEntry | null>
  draft: RecordDraft
  clientId: Ref<string | null>
  loading: Ref<boolean>
  notFound: Ref<boolean>
  loadError: Ref<boolean>
  saving: Ref<boolean>
  saveError: Ref<string | null>
  dirty: ComputedRef<boolean>
  changed: ComputedRef<SectionKey[]>
  load(): Promise<void>
  save(): Promise<string | null>
  revert(): void
  reload(): Promise<void>
}

const t = (key: string) => i18n.global.t(key)
const statusOf = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status
const plain = <T>(v: T): T => structuredClone(toRaw(v))

/** Итоги «Основного», которые пересчитываются из товаров. */
const TOTALS: [keyof GoodsTotals, keyof ReestrTransitFields][] = [
  ['items', 'goodsQuantity'],
  ['places', 'cargoPlacesCount'],
  ['gross', 'grossWeightKg'],
  ['value', 'totalValue'],
]

/**
 * Загрузка и сохранение записи транзита для страницы /reestr/:id.
 * - Всегда полная запись (getById) и полное тело PUT: исходная запись + черновик (инцидент 08.10).
 * - Первый показ и смена id — скелетон, без тоста: 404/403/400 → notFound, иначе loadError. 'new' — без запроса.
 * - dirty — черновик отличается от снимка (снимок — после nextTick, когда разделы применили свои значения).
 * - save(): проверка → POST/PUT напрямую (не через стор: список странице не нужен) → тост → перечитывание.
 *   Правки, сделанные пока шёл запрос, при перечитывании не теряются.
 * - reload(): новая точка отсчёта с сервера; несохранённые правки остаются поверх (mergeDrafts).
 *   Сбой — loadError: сохранять поверх устаревшей записи нельзя (статус мог смениться).
 * - Итоги «Основного» пересчитываются только при правке товаров: не при загрузке, revert и reload;
 *   пустой список и неизвестные суммы (null) их не трогают; пишется только изменившийся итог.
 */
export function useTransitRecord(id: () => string): TransitRecord {
  const entry = shallowRef<ReestrEntry | null>(null)
  const draft = reactive<RecordDraft>(draftFromEntry(null))
  const clientId = ref<string | null>(null)
  const loading = ref(false)
  const notFound = ref(false)
  const loadError = ref(false)
  const saving = ref(false)
  const saveError = ref<string | null>(null)
  const snapshot = ref<string | null>(null)
  const snapshotDraft = computed<RecordDraft | null>(() => (snapshot.value ? JSON.parse(snapshot.value) : null))

  /** id загруженной записи; null — новая или ничего не загружено. */
  let loadedId: string | null = null
  let seq = 0
  let snapSeq = 0
  let lastTotals = goodsTotals(draft.goods)

  const setDraft = (d: RecordDraft) => {
    Object.assign(draft, d)
    lastTotals = goodsTotals(draft.goods) // замена товаров — не правка: итоги не пересчитываются
  }

  /** Снимок после nextTick; заданный значением — сразу (поверх оставлены несохранённые правки; null — нет записи). */
  const setSnapshot = (value?: string | null) => {
    const my = ++snapSeq
    if (value !== undefined) {
      snapshot.value = value
      return
    }
    snapshot.value = null
    void nextTick(() => {
      if (my === snapSeq) snapshot.value = JSON.stringify(draft)
    })
  }

  /** Применить свежую запись; base — от чего шли текущие правки (null — заменить черновик целиком). */
  const apply = (fresh: ReestrEntry, base: RecordDraft | null) => {
    entry.value = fresh
    clientId.value = fresh.clientId
    loadedId = fresh.id
    const theirs = draftFromEntry(fresh)
    if (!base) {
      setDraft(theirs)
      setSnapshot()
      return
    }
    const merged = mergeDrafts(base, plain(draft), theirs)
    setDraft(merged)
    const theirsJson = JSON.stringify(theirs)
    setSnapshot(JSON.stringify(merged) === theirsJson ? undefined : theirsJson)
  }

  const load = async () => {
    const target = id()
    const my = ++seq
    loadedId = null
    entry.value = null
    clientId.value = null
    notFound.value = false
    loadError.value = false
    saveError.value = null
    setDraft(draftFromEntry(null))
    if (!target || target === NEW_RECORD_ID) {
      loading.value = false
      if (target) setSnapshot()
      else setSnapshot(null)
      return
    }
    loading.value = true
    setSnapshot(null)
    try {
      const fresh = await reestrApi.getById(target, { silent: true })
      if (my !== seq) return
      apply(fresh, null)
    } catch (e) {
      if (my !== seq) return
      const code = statusOf(e)
      if (code === 404 || code === 403 || code === 400) notFound.value = true
      else loadError.value = true
    } finally {
      if (my === seq) loading.value = false
    }
  }

  const reload = async () => {
    const target = loadedId
    if (!target) return
    const base = snapshotDraft.value ?? plain(draft)
    const my = ++seq
    try {
      const fresh = await reestrApi.getById(target, { silent: true })
      if (my !== seq) return
      apply(fresh, base)
    } catch (e) {
      if (my !== seq) return
      if (statusOf(e) === 404) notFound.value = true
      else loadError.value = true
    }
  }

  const save = async (): Promise<string | null> => {
    if (saving.value) return null
    const base = entry.value
    // Без загруженной записи создавать можно только на /reestr/new (иначе сбой загрузки дал бы дубль).
    if (!base && id() !== NEW_RECORD_ID) return null
    const errors = validateDraft(draft, { isNew: !base, clientId: clientId.value })
    if (errors.length) {
      saveError.value = errors.map(t).join(' ')
      return null
    }
    const cid = clientId.value ?? base?.clientId ?? ''
    const sent = plain(draft)
    saving.value = true
    let savedId: string
    try {
      const body = draftToUpsertBody(base, sent, cid)
      if (base) {
        await reestrApi.update(base.id, body)
        savedId = base.id
      } else {
        savedId = (await reestrApi.create(body)).id
      }
    } catch (e) {
      saveError.value = serverErrorText(e, t('dt.netSvyazi'))
      saving.value = false
      return null
    }
    saveError.value = null
    message.success(t(base ? 'transit.zapisUspeshnoObnovlena' : 'transit.zapisUspeshnoSozdana'))
    // Перечитать: сервер мог нормализовать даты и строки. Отправленный черновик — точка отсчёта для правок,
    // сделанных пока шёл запрос.
    const my = ++seq
    try {
      const fresh = await reestrApi.getById(savedId, { silent: true })
      if (my === seq) apply(fresh, sent)
    } catch {
      if (my === seq) {
        // Запись сохранена — её состояние известно: то, что отправили. Следующее сохранение — PUT этой записи.
        entry.value = { ...draftToEntry(base, sent, cid), id: savedId }
        clientId.value = cid
        loadedId = savedId
        setSnapshot(JSON.stringify(sent))
      }
    } finally {
      saving.value = false
    }
    return savedId
  }

  const revert = () => {
    const snap = snapshotDraft.value
    if (snap) setDraft(structuredClone(snap))
  }

  const dirty = computed(() => snapshot.value !== null && JSON.stringify(draft) !== snapshot.value)
  const changed = computed<SectionKey[]>(() => {
    const snap = snapshotDraft.value
    return dirty.value && snap ? changedSections(snap, draft) : []
  })

  // Пересчёт итогов «Основного» при правке товаров (не immediate; замена списка через setDraft — не правка).
  watch(
    () => draft.goods,
    (list) => {
      const next = goodsTotals(list)
      const prev = lastTotals
      lastTotals = next
      if (!list.length) return
      const tr = draft.transit as unknown as Record<string, unknown>
      for (const [from, to] of TOTALS) {
        const v = next[from]
        if (v != null && v !== prev[from]) tr[to] = v
      }
    },
    { deep: true },
  )

  // Смена записи — полная перезагрузка; переход на только что созданную (/reestr/new → /reestr/:id) — нет.
  watch(id, (next) => {
    if (next && next === loadedId) return
    void load()
  }, { immediate: true })

  return { entry, draft, clientId, loading, notFound, loadError, saving, saveError, dirty, changed, load, save, revert, reload }
}
