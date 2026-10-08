import { computed, nextTick, reactive, ref, shallowRef, toRaw, watch, type ComputedRef, type Ref } from 'vue'
import { reestrApi } from '@/api/reestr'
import { i18n } from '@/i18n'
import type { ReestrEntry } from '@/types/api'
import { message } from '@/ui/message'
import { serverErrorText } from '@/utils/serverError'
import {
  assignDraft,
  changedSections,
  draftFromEntry,
  draftToEntry,
  draftToUpsertBody,
  mergeDrafts,
  validateDraft,
  type RecordDraft,
  type SectionKey,
} from './recordModel'
import { useGoodsTotalsSync } from './goodsTotalsSync'

export const NEW_RECORD_ID = 'new'

export interface TransitRecord {
  entry: Ref<ReestrEntry | null>
  draft: RecordDraft
  clientId: Ref<string | null>
  loading: Ref<boolean>
  notFound: Ref<boolean>
  loadError: Ref<boolean>
  /** Перечитать (reload) не удалось: запись и правки на месте, сохранять нельзя до успешного повтора reload(). */
  reloadError: Ref<boolean>
  /** Идёт перечитывание (после смены статуса, автозаполнения): сохранение его дождётся, страница считает это занятостью. */
  reloading: Ref<boolean>
  saving: Ref<boolean>
  saveError: Ref<string | null>
  /** saveError — от проверки на месте (не заполнено, запись не загружена/устарела), а не ответ сервера. */
  saveErrorLocal: Ref<boolean>
  /** Черновик строкой (его же сравнивает dirty): страница следит за правками без глубокого обхода. */
  draftJson: ComputedRef<string>
  dirty: ComputedRef<boolean>
  changed: ComputedRef<SectionKey[]>
  load(): Promise<void>
  save(): Promise<string | null>
  revert(): void
  reload(): Promise<void>
}

const t = (key: string) => i18n.global.t(key)
const statusOf = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status
/** Запись недоступна (нет, нет доступа, неверный id) — «Запись не найдена», как в карточке заявки. */
const isNotFound = (e: unknown) => [404, 403, 400].includes(statusOf(e) ?? 0)
const plain = <T>(v: T): T => structuredClone(toRaw(v))

/**
 * Загрузка и сохранение записи транзита для страницы /reestr/:id.
 * - Всегда полная запись (getById) и полное тело PUT: исходная запись + черновик (инцидент 08.10).
 * - Первый показ и смена id — скелетон, без тоста: 404/403/400 → notFound, иначе loadError. 'new' — без запроса.
 * - dirty — черновик отличается от снимка (снимок — после nextTick, когда разделы применили свои значения).
 * - save(): проверка → POST/PUT напрямую (не через стор: список странице не нужен) → тост → перечитывание.
 *   Правки, сделанные пока шёл запрос, при перечитывании не теряются.
 * - reload(): новая точка отсчёта с сервера; несохранённые правки остаются поверх (mergeDrafts); успех снимает saveError.
 *   Сбой — reloadError: запись и правки остаются на экране, «Повторить» = снова reload(); сохранять нельзя,
 *   пока основа устарела (статус мог смениться). load() на той же записи с правками тоже идёт через reload().
 * - save() во время reload() ждёт его: тело строится от свежей записи (иначе PUT вернул бы старый статус
 *   поверх только что сменённого — итоговое ревью I1).
 * - Свежая запись (reload, перечитывание после save, revert) кладётся в черновик на месте: те же массивы и объекты
 *   строк (по индексу), чтобы ключи строк в разделах (WeakMap по объекту), развёрнутость и фокус не сбрасывались.
 *   Открытие записи (load) — новые объекты.
 * - Сохранение, завершившееся после перехода на другую запись, состояние новой записи не трогает.
 * - Итоги «Основного» пересчитываются только при правке товаров: не при загрузке, revert и reload;
 *   пустой список и неизвестные суммы (null) их не трогают; пишется только изменившийся итог.
 */
export function useTransitRecord(id: () => string): TransitRecord {
  const entry = shallowRef<ReestrEntry | null>(null)
  const draft = reactive<RecordDraft>(draftFromEntry(null))
  // Пересчёт итогов «Основного» при правке товаров (замена списка через setDraft — не правка).
  const totals = useGoodsTotalsSync(() => draft.goods, () => draft.transit)
  const clientId = ref<string | null>(null)
  const loading = ref(false)
  const notFound = ref(false)
  const loadError = ref(false)
  const reloadError = ref(false)
  const reloading = ref(false)
  const saving = ref(false)
  const saveError = ref<string | null>(null)
  const saveErrorLocal = ref(false)
  const snapshot = ref<string | null>(null)
  const snapshotDraft = computed<RecordDraft | null>(() => (snapshot.value ? JSON.parse(snapshot.value) : null))

  /** id загруженной записи; null — новая или ничего не загружено. */
  let loadedId: string | null = null
  /** Ответы запросов: устаревший (начат новый load/reload/перечитывание) отбрасывается. */
  let seq = 0
  /** Поколение записи: меняет только load() — сохранение старой записи не трогает новую. */
  let loadGen = 0
  let snapSeq = 0
  /** Идущий reload(): save() его дожидается. */
  let pendingReload: Promise<void> | null = null

  /** Черновик целиком (открытие записи) или на месте — те же объекты строк (перечитывание, «Отменить»). */
  const setDraft = (d: RecordDraft, inPlace = false) => {
    if (inPlace) assignDraft(draft, d)
    else Object.assign(draft, d)
    totals.reset() // замена товаров — не правка: итоги не пересчитываются
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
    reloadError.value = false
    // Запись свежая: ошибка прошлого сохранения (в том числе «не удалось обновить») больше не про неё.
    saveError.value = null
    const theirs = draftFromEntry(fresh)
    if (!base) {
      setDraft(theirs)
      setSnapshot()
      return
    }
    const merged = mergeDrafts(base, plain(draft), theirs)
    setDraft(merged, true)
    // Снимок сразу (разделы уже смонтированы); если разделы что-то нормализуют при монтировании,
    // плашка может назвать лишний раздел — dirty здесь и так true.
    const theirsJson = JSON.stringify(theirs)
    setSnapshot(JSON.stringify(merged) === theirsJson ? undefined : theirsJson)
  }

  const load = async () => {
    const target = id()
    // «Повторить» после неудачного reload() на той же записи с правками — не сбрасывать правки.
    if (target && target === loadedId && dirty.value) return reload()
    const my = ++seq
    loadGen++
    // Перечитывание прежней записи больше не нужно: его ответ отбросит seq, ждать его нечего.
    pendingReload = null
    reloading.value = false
    loadedId = null
    entry.value = null
    clientId.value = null
    notFound.value = false
    loadError.value = false
    reloadError.value = false
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
      if (isNotFound(e)) notFound.value = true
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
    const run = (async () => {
      try {
        const fresh = await reestrApi.getById(target, { silent: true })
        if (my !== seq) return
        apply(fresh, base)
      } catch (e) {
        if (my !== seq) return
        if (isNotFound(e)) notFound.value = true
        else reloadError.value = true
      }
    })()
    pendingReload = run
    reloading.value = true
    try {
      await run
    } finally {
      if (pendingReload === run) {
        pendingReload = null
        reloading.value = false
      }
    }
  }

  /** Дождаться перечитывания (и следующего, если начали новое). false — пока ждали, открыли другую запись. */
  const waitReload = async (): Promise<boolean> => {
    const gen = loadGen
    saving.value = true // плашка и повторное нажатие видят занятость
    try {
      while (pendingReload) await pendingReload
    } finally {
      saving.value = false
    }
    return gen === loadGen
  }

  const save = async (): Promise<string | null> => {
    if (saving.value) return null
    // Перечитывание (смена статуса) ещё идёт: entry — старая запись, PUT вернул бы прежний статус (I1).
    if (pendingReload && !(await waitReload())) return null
    const base = entry.value
    // Без загруженной записи создавать можно только на /reestr/new (иначе сбой загрузки дал бы дубль).
    if (notFound.value || loadError.value || (!base && id() !== NEW_RECORD_ID)) {
      saveError.value = t('broker.transitRecord.errors.notLoaded')
      saveErrorLocal.value = true
      return null
    }
    // Основа устарела (не удалось перечитать после смены статуса) — PUT вернул бы старый статус.
    if (reloadError.value) {
      saveError.value = t('broker.transitRecord.errors.stale')
      saveErrorLocal.value = true
      return null
    }
    const errors = validateDraft(draft, { isNew: !base, clientId: clientId.value })
    if (errors.length) {
      saveError.value = errors.map(t).join(' ')
      saveErrorLocal.value = true
      return null
    }
    const cid = clientId.value ?? base?.clientId ?? ''
    const sent = plain(draft)
    const gen = loadGen
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
      saving.value = false
      if (gen === loadGen) {
        saveError.value = serverErrorText(e, t('dt.netSvyazi'))
        saveErrorLocal.value = false
      }
      return null
    }
    message.success(t(base ? 'transit.zapisUspeshnoObnovlena' : 'transit.zapisUspeshnoSozdana'))
    // Пока шёл запрос, открыли другую запись: её загрузку и состояние не трогаем.
    if (gen !== loadGen) {
      saving.value = false
      return savedId
    }
    saveError.value = null
    // Перечитать: сервер мог нормализовать даты и строки. Отправленный черновик — точка отсчёта для правок,
    // сделанных пока шёл запрос.
    const my = ++seq
    try {
      const fresh = await reestrApi.getById(savedId, { silent: true })
      if (my === seq && gen === loadGen) apply(fresh, sent)
    } catch {
      if (my === seq && gen === loadGen) {
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
    if (snap) setDraft(structuredClone(snap), true)
  }

  const draftJson = computed(() => JSON.stringify(draft))
  const dirty = computed(() => snapshot.value !== null && draftJson.value !== snapshot.value)
  const changed = computed<SectionKey[]>(() => {
    const snap = snapshotDraft.value
    return dirty.value && snap ? changedSections(snap, draft) : []
  })

  // Смена записи — полная перезагрузка; переход на только что созданную (/reestr/new → /reestr/:id) — нет.
  watch(id, (next) => {
    if (next && next === loadedId) return
    void load()
  }, { immediate: true })

  return { entry, draft, clientId, loading, notFound, loadError, reloadError, reloading, saving, saveError, saveErrorLocal, draftJson, dirty, changed, load, save, revert, reload }
}
