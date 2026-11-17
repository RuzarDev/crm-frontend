import { computed, nextTick, reactive, ref, shallowRef, toRaw, watch, type ComputedRef, type Ref } from 'vue'
import { getDeclaration, saveDeclaration, type DeclarationData, type DeclarationMissing, type DeclarationResponse } from '@/api/autoTransit'
import { i18n } from '@/i18n'
import { message } from '@/ui/message'
import { useGoodsTotalsSync } from '@/views/broker/transit/record/goodsTotalsSync'
import { assignDraft, changedSections, mergeDrafts, type RecordDraft, type SectionKey } from '@/views/broker/transit/record/recordModel'
import { TD_SECTIONS, applyCopy, dataExtras, dataToDraft, draftToData } from './tdModel'

/** Почему ТД не сохранилась — ключ broker.autoTransit.td.error.*. invalid — 400 «данные не читаются» / нет версии. */
export type TdSaveError = 'conflict' | 'submitted' | 'archived' | 'tooLarge' | 'invalid' | 'forbidden' | 'unknown'

export interface Td {
  draft: RecordDraft
  response: Ref<DeclarationResponse | null>
  readOnly: ComputedRef<boolean>
  isDraft: ComputedRef<boolean>
  missing: ComputedRef<DeclarationMissing[]>
  version: ComputedRef<number | null>
  loading: Ref<boolean>
  notFound: Ref<boolean>
  loadError: Ref<boolean>
  reloading: Ref<boolean>
  saving: Ref<boolean>
  saveError: Ref<TdSaveError | null>
  dirty: ComputedRef<boolean>
  changed: ComputedRef<SectionKey[]>
  load(): Promise<void>
  save(): Promise<boolean>
  reload(): Promise<void>
  revert(): void
  /** Подставить прошлую ТД (applyCopy) в черновик на месте; не сохраняет. Итоги «Основного» остаются прежними. */
  applyCopy(source: Partial<DeclarationData>, withGoods: boolean): void
}

const statusOf = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status
const codeOf = (e: unknown): string => String((e as { response?: { data?: { code?: unknown } } })?.response?.data?.code ?? '')
const plain = <T>(v: T): T => structuredClone(toRaw(v))

function saveErrorOf(e: unknown): TdSaveError {
  const status = statusOf(e)
  if (status === 409) {
    const code = codeOf(e)
    return code === 'submitted' || code === 'archived' ? code : 'conflict'
  }
  if (status === 413) return 'tooLarge'
  if (status === 400) {
    // Сервер (7c905cb): 400 { error, errors: { goods | data | version: [текст] } }. goods — больше 999 товаров,
    // data с «2 МБ» — тело больше лимита; прочее (data не читается, нет version) — invalid.
    const data = (e as { response?: { data?: { error?: unknown; errors?: Record<string, unknown> } } })?.response?.data
    const errors = data?.errors ?? {}
    if ('goods' in errors) return 'tooLarge'
    const texts = [data?.error, ...Object.values(errors).flat()].map((x) => String(x ?? '')).join(' ')
    return /2\s*МБ|2\s*MB/i.test(texts) ? 'tooLarge' : 'invalid'
  }
  if (status === 403) return 'forbidden'
  return 'unknown'
}

/**
 * Загрузка и сохранение ТД партии: GET …/declaration (сохранённая ТД или черновик из машины и партии), PUT целиком
 * с версией партии. По образцу useTransitRecord:
 * - dirty — черновик отличается от снимка (снимок — после nextTick, когда разделы применили свои значения);
 * - 409 conflict: введённое остаётся; reload() кладёт несохранённые правки поверх свежей версии (mergeDrafts) —
 *   после этого можно сохранить снова, уже с новой версией;
 * - свежий ответ кладётся в черновик на месте (assignDraft): развёрнутые карточки и фокус не сбрасываются;
 * - итоги «Основного» пересчитываются только при правке товаров (useGoodsTotalsSync), не при загрузке.
 */
export function useTd(truckId: () => string, partyId: () => string): Td {
  const draft = reactive<RecordDraft>(dataToDraft(null))
  const totals = useGoodsTotalsSync(() => draft.goods, () => draft.transit)
  const response = shallowRef<DeclarationResponse | null>(null)
  const loading = ref(false)
  const notFound = ref(false)
  const loadError = ref(false)
  const reloading = ref(false)
  const saving = ref(false)
  const saveError = ref<TdSaveError | null>(null)
  const snapshot = ref<string | null>(null)
  // Незнакомые поля верхнего уровня data последнего ответа: PUT заменяет ТД целиком — уходят обратно как были.
  let extras: Record<string, unknown> = {}
  const snapshotDraft = computed<RecordDraft | null>(() => (snapshot.value ? JSON.parse(snapshot.value) : null))
  let seq = 0
  let snapSeq = 0

  const setDraft = (d: RecordDraft, inPlace: boolean) => {
    if (inPlace) assignDraft(draft, d)
    else Object.assign(draft, d)
    totals.reset()
  }
  const setSnapshot = (value?: string | null) => {
    const my = ++snapSeq
    if (value !== undefined) {
      snapshot.value = value
      return
    }
    snapshot.value = null
    void nextTick(() => { if (my === snapSeq) snapshot.value = JSON.stringify(draft) })
  }

  /** Свежий ответ; base — от чего шли текущие правки (null — заменить черновик целиком). */
  const apply = (fresh: DeclarationResponse, base: RecordDraft | null, inPlace = false) => {
    response.value = fresh
    saveError.value = null
    extras = dataExtras(fresh.data)
    const theirs = dataToDraft(fresh.data)
    if (!base) {
      setDraft(theirs, inPlace)
      setSnapshot()
      return
    }
    const theirsJson = JSON.stringify(theirs)
    const merged = mergeDrafts(base, plain(draft), theirs)
    setDraft(merged, true)
    setSnapshot(JSON.stringify(merged) === theirsJson ? undefined : theirsJson)
  }

  const load = async () => {
    const my = ++seq
    response.value = null
    notFound.value = false
    loadError.value = false
    saveError.value = null
    reloading.value = false
    setSnapshot(null)
    extras = {}
    setDraft(dataToDraft(null), false)
    if (!truckId() || !partyId()) return
    loading.value = true
    try {
      const fresh = await getDeclaration(truckId(), partyId())
      if (my !== seq) return
      apply(fresh, null)
    } catch (e) {
      if (my !== seq) return
      if ([404, 403, 400].includes(statusOf(e) ?? 0)) notFound.value = true
      else loadError.value = true
    } finally {
      if (my === seq) loading.value = false
    }
  }

  const reload = async () => {
    if (!response.value) return load()
    const base = snapshotDraft.value ?? plain(draft)
    const my = ++seq
    reloading.value = true
    try {
      const fresh = await getDeclaration(truckId(), partyId())
      if (my !== seq) return
      // Форма закрылась (ТД подана, машина в архиве): правки всё равно не сохранить — показываем то, что в базе.
      apply(fresh, fresh.readOnly ? null : base, true)
    } catch (e) {
      if (my !== seq) return
      if ([404, 403].includes(statusOf(e) ?? 0)) notFound.value = true
      else message.error(i18n.global.t('broker.autoTransit.td.reloadError'))
    } finally {
      if (my === seq) reloading.value = false
    }
  }

  const save = async (): Promise<boolean> => {
    const cur = response.value
    if (!cur || cur.readOnly || saving.value || reloading.value) return false
    const sent = plain(draft)
    const my = seq
    saving.value = true
    try {
      const fresh = await saveDeclaration(truckId(), partyId(), { version: cur.version, data: draftToData(sent, extras) })
      if (my !== seq) return true
      message.success(i18n.global.t('broker.autoTransit.td.saved'))
      // Правки, сделанные пока шёл запрос, остаются поверх ответа.
      apply(fresh, sent)
      return true
    } catch (e) {
      if (my === seq) saveError.value = saveErrorOf(e)
      return false
    } finally {
      saving.value = false
    }
  }

  const revert = () => {
    const snap = snapshotDraft.value
    if (snap) setDraft(structuredClone(snap), true)
  }

  const doApplyCopy = (source: Partial<DeclarationData>, withGoods: boolean) => {
    if (readOnlyNow()) return
    setDraft(applyCopy(plain(draft), source, withGoods), true)
  }

  const draftJson = computed(() => JSON.stringify(draft))
  const dirty = computed(() => snapshot.value !== null && draftJson.value !== snapshot.value)
  const changed = computed<SectionKey[]>(() => {
    const snap = snapshotDraft.value
    if (!dirty.value || !snap) return []
    return changedSections(snap, draft).filter((k) => TD_SECTIONS.includes(k) || k === 'containers')
  })

  function readOnlyNow() { return response.value?.readOnly ?? true }

  watch(() => [truckId(), partyId()] as const, () => { void load() }, { immediate: true })

  return {
    draft,
    response,
    readOnly: computed(() => response.value?.readOnly ?? true),
    isDraft: computed(() => response.value?.isDraft ?? false),
    missing: computed(() => response.value?.missing ?? []),
    version: computed(() => response.value?.version ?? null),
    loading, notFound, loadError, reloading, saving, saveError, dirty, changed,
    load, save, reload, revert, applyCopy: doApplyCopy,
  }
}
