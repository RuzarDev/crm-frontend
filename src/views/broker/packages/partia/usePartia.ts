import { computed, nextTick, reactive, ref, shallowRef, toRaw, watch, type ComputedRef, type Ref } from 'vue'
import { documentPackagesApi } from '@/api/documentPackages'
import { i18n } from '@/i18n'
import type { DocumentPackageClientConsolidationDto, DocumentPackageContainerDto, DocumentPackageDto } from '@/types/api'
import { message } from '@/ui/message'
import { serverErrorText } from '@/utils/serverError'
import { useGoodsTotalsSync } from '@/views/broker/transit/record/goodsTotalsSync'
import { partiaContainer } from '../workspace/workspace'
import {
  assignPartia,
  draftFromPartia,
  mergePartia,
  partiaToBody,
  transitJsonBroken,
  validatePartia,
  type PartiaDraft,
} from './partiaModel'

export const NEW_PARTIA_ID = 'new'

export interface PartiaState {
  pkg: Ref<DocumentPackageDto | null>
  partia: ComputedRef<DocumentPackageClientConsolidationDto | null>
  container: ComputedRef<DocumentPackageContainerDto | null>
  draft: PartiaDraft
  /** Партия ещё не создана (адрес …/partia/new и сохранения не было). */
  isNew: ComputedRef<boolean>
  loading: Ref<boolean>
  notFound: Ref<boolean>
  loadError: Ref<boolean>
  /** Перечитать (reload) не удалось: партия и правки на месте, «Повторить» = снова reload(). */
  reloadError: Ref<boolean>
  saving: Ref<boolean>
  saveError: Ref<string | null>
  /** transitDataJson партии не прочитался: черновик — со значениями по умолчанию, save() без force откажет. */
  transitParseFailed: ComputedRef<boolean>
  dirty: ComputedRef<boolean>
  /** Инвойсы, которые загрузятся и привяжутся к партии при сохранении (для новой — после создания). */
  pendingInvoices: Ref<File[]>
  /** Итог последней загрузки очереди инвойсов: «Загружено done из total»; null — не было. */
  invoiceUpload: Ref<{ done: number; total: number } | null>
  load(): Promise<void>
  save(opts?: { force?: boolean }): Promise<string | null>
  revert(): void
  reload(): Promise<void>
}

const t = (key: string, params?: Record<string, unknown>) => (params ? i18n.global.t(key, params) : i18n.global.t(key))
const statusOf = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status
/** Пакет недоступен (нет, нет доступа, неверный id) — «не найдена». */
const isNotFound = (e: unknown) => [404, 403, 400].includes(statusOf(e) ?? 0)
const plain = <T>(v: T): T => structuredClone(toRaw(v))

const findPartia = (p: DocumentPackageDto | null, id: string | null): DocumentPackageClientConsolidationDto | null => {
  if (!p || !id) return null
  for (const c of p.containers) {
    const x = c.consolidations.find((y) => y.id === id)
    if (x) return x
  }
  return null
}

/**
 * Загрузка и сохранение партии пакета для страницы /document-packages/:id/partia/:pid (как useTransitRecord, 4б).
 * - Пакет — getById тихо (скелетон, без тоста); партия — по id в любом контейнере, её контейнер — из пакета.
 *   'new' — контейнер из аргумента. Нет пакета, контейнера или партии → notFound; прочая ошибка → loadError.
 * - Снимок после nextTick (разделы нормализуют значения при монтировании); dirty — черновик отличается от снимка
 *   или в очереди есть инвойсы.
 * - save(): проверка → POST (новая; id — по разнице id в контейнере) или PUT полного тела → пакет из ответа,
 *   новый снимок (правки, сделанные пока шёл запрос, остаются) → очередь инвойсов (загрузка + привязка как инвойс).
 *   Повторное нажатие игнорируется. Ошибка → saveError (тост даёт перехватчик).
 * - transitParseFailed: сохранение затёрло бы транзит партии значениями по умолчанию — только save({ force: true }).
 * - Итоги транзита пересчитываются при правке товаров — общий с записью транзита useGoodsTotalsSync.
 * - Переход на адрес только что созданной партии не перезагружает её.
 */
export function usePartia(pkgId: () => string, containerId: () => string, partiaId: () => string): PartiaState {
  const pkg = shallowRef<DocumentPackageDto | null>(null)
  const draft = reactive<PartiaDraft>(draftFromPartia(null))
  const totals = useGoodsTotalsSync(() => draft.record.goods, () => draft.record.transit)
  const loading = ref(false)
  const notFound = ref(false)
  const loadError = ref(false)
  const reloadError = ref(false)
  const saving = ref(false)
  const saveError = ref<string | null>(null)
  const pendingInvoices = ref<File[]>([])
  const invoiceUpload = ref<{ done: number; total: number } | null>(null)
  const snapshot = ref<string | null>(null)
  const snapshotDraft = computed<PartiaDraft | null>(() => (snapshot.value ? JSON.parse(snapshot.value) : null))

  /** id открытой партии; null — новая (или ничего не открыто). */
  const openId = ref<string | null>(null)
  /** Открытый адрес: пакет и партия (для 'new' — ещё и контейнер). */
  let openKey: string | null = null
  /** Контейнер новой партии. */
  let newContainerId: string | null = null
  let seq = 0
  let loadGen = 0
  let snapSeq = 0

  const keyOf = (pkgIdValue: string, pid: string, cid: string) => `${pkgIdValue}|${pid}|${pid === NEW_PARTIA_ID ? cid : ''}`

  const partia = computed(() => findPartia(pkg.value, openId.value))
  const container = computed<DocumentPackageContainerDto | null>(() => {
    if (openId.value) return partiaContainer(pkg.value, openId.value)
    return pkg.value?.containers.find((c) => c.id === newContainerId) ?? null
  })
  const isNew = computed(() => openId.value === null)
  const transitParseFailed = computed(() => transitJsonBroken(partia.value?.transitDataJson))

  const setDraft = (d: PartiaDraft, inPlace = false) => {
    if (inPlace) assignPartia(draft, d)
    else Object.assign(draft, d)
    totals.reset() // замена товаров — не правка: итоги не пересчитываются
  }

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

  /**
   * Свежий пакет. base — от чего шли текущие правки (null — заменить черновик целиком).
   * false — открытой партии (или контейнера новой) в пакете нет.
   */
  const apply = (fresh: DocumentPackageDto, base: PartiaDraft | null): boolean => {
    pkg.value = fresh
    reloadError.value = false
    if (!openId.value) {
      if (!container.value) return false
      if (!base) {
        setDraft(draftFromPartia(null))
        setSnapshot()
      }
      return true
    }
    const p = partia.value
    if (!p) return false
    const theirs = draftFromPartia(p)
    if (!base) {
      setDraft(theirs)
      setSnapshot()
      return true
    }
    const merged = mergePartia(base, plain(draft), theirs)
    setDraft(merged, true)
    const theirsJson = JSON.stringify(theirs)
    setSnapshot(JSON.stringify(merged) === theirsJson ? undefined : theirsJson)
    return true
  }

  const load = async () => {
    const my = ++seq
    loadGen++
    const target = pkgId()
    const pid = partiaId()
    openKey = keyOf(target, pid, containerId())
    openId.value = pid && pid !== NEW_PARTIA_ID ? pid : null
    newContainerId = pid === NEW_PARTIA_ID ? containerId() || null : null
    pkg.value = null
    notFound.value = false
    loadError.value = false
    reloadError.value = false
    saving.value = false
    saveError.value = null
    pendingInvoices.value = []
    invoiceUpload.value = null
    setDraft(draftFromPartia(null))
    setSnapshot(null)
    if (!target || !pid) {
      loading.value = false
      notFound.value = true
      return
    }
    loading.value = true
    try {
      const fresh = await documentPackagesApi.getById(target, { silent: true })
      if (my !== seq) return
      if (!apply(fresh, null)) notFound.value = true
    } catch (e) {
      if (my !== seq) return
      if (isNotFound(e)) notFound.value = true
      else loadError.value = true
    } finally {
      if (my === seq) loading.value = false
    }
  }

  const reload = async () => {
    if (!pkg.value) return load()
    const base = snapshotDraft.value ?? plain(draft)
    const my = ++seq
    try {
      const fresh = await documentPackagesApi.getById(pkg.value.id, { silent: true })
      if (my !== seq) return
      if (!apply(fresh, base)) notFound.value = true
    } catch (e) {
      if (my !== seq) return
      if (isNotFound(e)) notFound.value = true
      else reloadError.value = true
    }
  }

  /** Загрузить очередь инвойсов и привязать к партии как инвойсы. Неудачные остаются в очереди. */
  const uploadInvoices = async (packageId: string, partiaIdValue: string, gen: number) => {
    const files = pendingInvoices.value.slice()
    const failed: File[] = []
    let latest: DocumentPackageDto | null = null
    for (const f of files) {
      try {
        const uploaded = await documentPackagesApi.uploadFile(packageId, f)
        latest = await documentPackagesApi.linkFile(packageId, uploaded.id, {
          containerId: null,
          clientConsolidationId: partiaIdValue,
          documentType: 'invoice',
        })
      } catch {
        // Причину показал перехватчик; файл мог загрузиться, но не привязаться — список файлов перечитаем.
        failed.push(f)
      }
    }
    if (gen !== loadGen) return { done: files.length - failed.length, total: files.length }
    if (failed.length) {
      try {
        latest = await documentPackagesApi.getById(packageId, { silent: true })
      } catch {
        /* остаётся пакет из последней привязки */
      }
    }
    if (gen === loadGen) {
      if (latest) pkg.value = latest
      pendingInvoices.value = pendingInvoices.value.filter((f) => !files.includes(f) || failed.includes(f))
      invoiceUpload.value = { done: files.length - failed.length, total: files.length }
    }
    return { done: files.length - failed.length, total: files.length }
  }

  const fail = (key: string) => {
    saveError.value = t(key)
    return null
  }

  const save = async (opts?: { force?: boolean }): Promise<string | null> => {
    if (saving.value) return null
    const p = pkg.value
    const c = container.value
    if (notFound.value || loadError.value || loading.value || !p || !c) return fail('broker.partia.errors.notLoaded')
    if (transitParseFailed.value && !opts?.force) return fail('broker.partia.errors.transitUnreadable')
    const errors = validatePartia(draft)
    if (errors.length) {
      saveError.value = errors.map((k) => t(k)).join(' ')
      return null
    }
    const sent = plain(draft)
    const body = partiaToBody(sent)
    const gen = loadGen
    const existing = openId.value
    saving.value = true
    let fresh: DocumentPackageDto
    let savedId: string | null
    try {
      if (existing) {
        fresh = await documentPackagesApi.updateClientConsolidation(p.id, c.id, existing, body)
        savedId = existing
      } else {
        const before = new Set(c.consolidations.map((x) => x.id))
        fresh = await documentPackagesApi.createClientConsolidation(p.id, c.id, body)
        savedId = fresh.containers.find((x) => x.id === c.id)?.consolidations.find((x) => !before.has(x.id))?.id ?? null
      }
    } catch (e) {
      if (gen === loadGen) {
        saving.value = false
        saveError.value = serverErrorText(e, t('dt.netSvyazi'))
      }
      return null
    }
    // Пока шёл запрос, открыли другую партию: её состояние не трогаем.
    if (gen !== loadGen) return savedId
    if (!savedId) {
      pkg.value = fresh
      saving.value = false
      return fail('broker.partia.errors.createdNotFound')
    }
    saveError.value = null
    if (!existing) {
      openId.value = savedId
      openKey = keyOf(p.id, savedId, '')
      newContainerId = null
    }
    if (!apply(fresh, sent)) notFound.value = true
    let invoices: { done: number; total: number } | null = null
    if (pendingInvoices.value.length) invoices = await uploadInvoices(p.id, savedId, gen)
    if (gen !== loadGen) return savedId
    saving.value = false
    if (invoices && invoices.done < invoices.total) {
      message.warning(t('broker.partia.errors.invoicesPartial', invoices))
    } else {
      message.success(t(existing ? 'transit.partiyaUspeshnoObnovlena' : 'transit.klientDobavlenVKonteyner'))
    }
    return savedId
  }

  const revert = () => {
    const snap = snapshotDraft.value
    if (snap) setDraft(structuredClone(snap), true)
  }

  const draftJson = computed(() => JSON.stringify(draft))
  const dirty = computed(() => snapshot.value !== null && (draftJson.value !== snapshot.value || pendingInvoices.value.length > 0))

  // Смена адреса — полная загрузка; переход на только что созданную партию (…/new → …/:pid) — нет.
  watch(
    () => keyOf(pkgId(), partiaId(), containerId()),
    (key) => {
      if (key === openKey) return
      void load()
    },
    { immediate: true },
  )

  return {
    pkg, partia, container, draft, isNew, loading, notFound, loadError, reloadError, saving, saveError,
    transitParseFailed, dirty, pendingInvoices, invoiceUpload, load, save, revert, reload,
  }
}
