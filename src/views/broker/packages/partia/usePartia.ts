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
  partiaErrorText,
  partiaToBody,
  transitJsonBroken,
  validatePartia,
  type PartiaDraft,
} from './partiaModel'

export const NEW_PARTIA_ID = 'new'

/**
 * Почему сохранение не прошло — для выбора плашки (не по переведённому тексту):
 * notLoaded, createdLost (POST прошёл, id не нашёлся), transitBroken (без force), validation, server.
 */
export type PartiaSaveErrorKind = 'notLoaded' | 'createdLost' | 'transitBroken' | 'validation' | 'server'

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
  /** Идёт перечитывание: сохранение его дождётся. */
  reloading: Ref<boolean>
  saving: Ref<boolean>
  saveError: Ref<string | null>
  /** Вид ошибки сохранения (вместе с saveError; null — ошибки нет). */
  saveErrorKind: Ref<PartiaSaveErrorKind | null>
  /** POST новой партии прошёл, но её id не нашёлся: повторный POST запрещён, есть recoverCreated(). */
  createdLost: Ref<boolean>
  /** Идёт прикрепление инвойса к сохранённой партии. */
  attaching: Ref<boolean>
  /** transitDataJson партии не прочитался: черновик — со значениями по умолчанию, save() без force откажет. */
  transitParseFailed: ComputedRef<boolean>
  dirty: ComputedRef<boolean>
  /** Инвойсы, которые загрузятся и привяжутся к партии при сохранении (для новой — после создания). */
  pendingInvoices: Ref<File[]>
  /** Итог последней загрузки очереди инвойсов: «Загружено done из total»; null — не было. */
  invoiceUpload: Ref<{ done: number; total: number } | null>
  load(): Promise<void>
  save(opts?: { force?: boolean }): Promise<string | null>
  /**
   * После createdLost: перечитать пакет и найти созданную партию (новая в том контейнере, с тем же клиентом).
   * Нашлась — она открыта, правки после отправки сохранены в черновике, очередь инвойсов загружается; id — результат.
   * Не нашлась — null, черновик и очередь не трогаются.
   */
  recoverCreated(): Promise<string | null>
  /** Инвойс к сохранённой партии: загрузка + привязка как инвойс; пакет — через порядок ответов хука. id файла или null. */
  attachInvoice(file: File): Promise<string | null>
  revert(): void
  reload(): Promise<void>
}

const t = (key: string, params?: Record<string, unknown>) => (params ? i18n.global.t(key, params) : i18n.global.t(key))
const statusOf = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status
/** Пакет недоступен (нет, нет доступа, неверный id) — «не найдена». */
const isNotFound = (e: unknown) => [404, 403, 400].includes(statusOf(e) ?? 0)
const plain = <T>(v: T): T => structuredClone(toRaw(v))
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

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
 *   или в очереди есть инвойсы. revert() возвращает снимок и очищает очередь инвойсов.
 * - save(): дождаться идущего reload() → проверка → POST (новая) или PUT полного тела → пакет из ответа,
 *   новый снимок (правки, сделанные пока шёл запрос, остаются) → очередь инвойсов (загрузка + привязка как инвойс).
 *   Повторное нажатие игнорируется. Ошибка → saveError + saveErrorKind (тост даёт перехватчик); 5xx и трассировки —
 *   понятным текстом, сырой ответ сервера в интерфейс не идёт.
 * - reload() во время сохранения ждёт его конца; ответ reload(), начатого до ответа сохранения, отбрасывается.
 * - Новая партия: id — по разнице id в контейнере (несколько новых — по имени клиента). Не нашлась — createdLost,
 *   повторный POST запрещён (партия на сервере уже есть, второй POST дал бы дубль); recoverCreated() перечитывает
 *   пакет и ищет её, не трогая черновик и очередь инвойсов; load() тоже снимает запрет.
 * - attachInvoice(): инвойс к сохранённой партии; пакет из ответа — с тем же порядком ответов, что у сохранения.
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
  const reloading = ref(false)
  const saving = ref(false)
  const saveError = ref<string | null>(null)
  const saveErrorKind = ref<PartiaSaveErrorKind | null>(null)
  const createdLostRef = ref(false)
  const attaching = ref(false)
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
  /** Ответы запросов пакета: устаревший (начат новый load/reload или пришёл ответ сохранения) отбрасывается. */
  let seq = 0
  /** Поколение адреса: меняет только load() — сохранение прежней партии не трогает новую. */
  let loadGen = 0
  let snapSeq = 0
  let pendingReload: Promise<void> | null = null
  let pendingSave: Promise<unknown> | null = null
  /** POST новой партии прошёл, но её id не нашёлся: что нужно, чтобы найти её позже (recoverCreated). */
  let lost: { containerId: string; before: Set<string>; name: string; sent: PartiaDraft } | null = null
  const setLost = (v: typeof lost) => {
    lost = v
    createdLostRef.value = v !== null
  }
  /** Инвойс из очереди уже загружен, но не привязан: повтор только привязывает (без второй копии файла). */
  let uploadedIds = new WeakMap<File, string>()

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
    pendingReload = null
    pendingSave = null
    reloading.value = false
    const target = pkgId()
    const pid = partiaId()
    openKey = keyOf(target, pid, containerId())
    openId.value = pid && pid !== NEW_PARTIA_ID ? pid : null
    newContainerId = pid === NEW_PARTIA_ID ? containerId() || null : null
    setLost(null)
    attaching.value = false
    uploadedIds = new WeakMap()
    pkg.value = null
    notFound.value = false
    loadError.value = false
    reloadError.value = false
    saving.value = false
    saveError.value = null
    saveErrorKind.value = null
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
    const gen = loadGen
    // Сохранение идёт: его ответ новее того, что прочитали бы сейчас, — перечитать после него.
    if (pendingSave) await pendingSave.catch(() => undefined)
    if (gen !== loadGen || !pkg.value) return
    const packageId = pkg.value.id
    const base = snapshotDraft.value ?? plain(draft)
    const my = ++seq
    const run = (async () => {
      try {
        const fresh = await documentPackagesApi.getById(packageId, { silent: true })
        if (my !== seq) return
        if (!apply(fresh, base)) notFound.value = true
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

  /** Загрузить очередь инвойсов и привязать к партии как инвойсы. Неудачные остаются в очереди. */
  const uploadInvoices = async (packageId: string, partiaIdValue: string, gen: number) => {
    const files = pendingInvoices.value.slice()
    const failed: File[] = []
    let reason: string | null = null
    let latest: DocumentPackageDto | null = null
    for (const f of files) {
      try {
        // Ошибки тихие: вместо тоста на каждый файл — один итоговый (с причиной первой ошибки).
        let id = uploadedIds.get(f)
        if (!id) {
          id = (await documentPackagesApi.uploadFile(packageId, f, { silent: true })).id
          uploadedIds.set(f, id)
        }
        latest = await documentPackagesApi.linkFile(
          packageId,
          id,
          { containerId: null, clientConsolidationId: partiaIdValue, documentType: 'invoice' },
          { silent: true },
        )
        uploadedIds.delete(f)
      } catch (e) {
        failed.push(f)
        reason ??= serverText(e, t('broker.partia.errors.serverShort'))
      }
    }
    const result = { done: files.length - failed.length, total: files.length, reason }
    if (gen !== loadGen) return result
    if (failed.length) {
      // Файл мог загрузиться, но не привязаться — список файлов перечитать.
      try {
        latest = await documentPackagesApi.getById(packageId, { silent: true })
      } catch {
        /* остаётся пакет из последней привязки */
      }
    }
    if (gen === loadGen) {
      if (latest) {
        ++seq // перечитывание, начатое до этого ответа, его не перезапишет
        pkg.value = latest
      }
      pendingInvoices.value = pendingInvoices.value.filter((f) => !files.includes(f) || failed.includes(f))
      invoiceUpload.value = { done: result.done, total: result.total }
    }
    return result
  }

  const fail = (kind: PartiaSaveErrorKind, key: string) => {
    saveError.value = t(key)
    saveErrorKind.value = kind
    return null
  }
  /** Текст ответа сервера; 5xx и трассировки стека — коротким понятным текстом (сырой текст в интерфейс не идёт). */
  const serverText = (e: unknown, friendly: string) => serverErrorText(e, t('dt.netSvyazi'), { friendly })

  /** Дождаться перечитывания (и следующего, если начали новое). false — пока ждали, открыли другую партию. */
  const waitReload = async (gen: number): Promise<boolean> => {
    while (pendingReload) await pendingReload
    return gen === loadGen
  }

  const doSave = async (opts?: { force?: boolean }): Promise<string | null> => {
    const gen = loadGen
    saving.value = true
    try {
      // Перечитывание ещё идёт: его ответ (старше сохранения) не должен лечь поверх; черновик — после слияния.
      if (pendingReload && !(await waitReload(gen))) return null
      const p = pkg.value
      const c = container.value
      if (notFound.value || loadError.value || loading.value || !p || !c) return fail('notLoaded', 'broker.partia.errors.notLoaded')
      const existing = openId.value
      if (!existing && lost) return fail('createdLost', 'broker.partia.errors.createdNotFound')
      if (transitParseFailed.value && !opts?.force) return fail('transitBroken', 'broker.partia.errors.transitUnreadable')
      const errors = validatePartia(draft)
      if (errors.length) {
        saveError.value = errors.map((e) => partiaErrorText(e, t)).join(' ')
        saveErrorKind.value = 'validation'
        return null
      }
      const sent = plain(draft)
      const body = partiaToBody(sent)
      let fresh: DocumentPackageDto
      let savedId: string | null
      const before = new Set(c.consolidations.map((x) => x.id))
      try {
        if (existing) {
          fresh = await documentPackagesApi.updateClientConsolidation(p.id, c.id, existing, body)
          savedId = existing
        } else {
          fresh = await documentPackagesApi.createClientConsolidation(p.id, c.id, body)
          const added = fresh.containers.find((x) => x.id === c.id)?.consolidations.filter((x) => !before.has(x.id)) ?? []
          // Несколько новых (кто-то добавил партию параллельно) — своя по имени клиента; неоднозначно — не угадывать.
          const mine = added.length === 1 ? added : added.filter((x) => sameName(x.clientName, body.clientName))
          savedId = mine.length === 1 ? mine[0].id : null
        }
      } catch (e) {
        if (gen === loadGen) {
          saveError.value = serverText(e, t('broker.partia.errors.serverFailed'))
          saveErrorKind.value = 'server'
        }
        return null
      }
      // Пока шёл запрос, открыли другую партию: её состояние не трогаем.
      if (gen !== loadGen) return savedId
      ++seq // ответ перечитывания, начатого раньше, старше этого — отбросить
      if (!savedId) {
        setLost({ containerId: c.id, before, name: body.clientName, sent })
        pkg.value = fresh
        return fail('createdLost', 'broker.partia.errors.createdNotFound')
      }
      return await finishSaved(p.id, savedId, !existing, fresh, sent, gen)
    } finally {
      if (gen === loadGen) saving.value = false
    }
  }

  /** Партия на сервере есть (сохранили или нашли созданную): открыть её, слить правки, очередь инвойсов, тост. */
  const finishSaved = async (packageId: string, savedId: string, created: boolean, fresh: DocumentPackageDto, sent: PartiaDraft, gen: number) => {
    saveError.value = null
    saveErrorKind.value = null
    if (created) {
      openId.value = savedId
      openKey = keyOf(packageId, savedId, '')
      newContainerId = null
      setLost(null)
    }
    if (!apply(fresh, sent)) notFound.value = true
    const invoices = pendingInvoices.value.length ? await uploadInvoices(packageId, savedId, gen) : null
    if (gen !== loadGen) return savedId
    if (invoices && invoices.done < invoices.total) {
      message.warning(t('broker.partia.errors.invoicesPartial', invoices))
    } else {
      message.success(t(created ? 'transit.klientDobavlenVKonteyner' : 'transit.partiyaUspeshnoObnovlena'))
    }
    return savedId
  }

  const recoverCreated = async (): Promise<string | null> => {
    const l = lost
    const p = pkg.value
    if (!l || !p || saving.value) return null
    const gen = loadGen
    saving.value = true
    const run = (async () => {
      let fresh: DocumentPackageDto
      try {
        fresh = await documentPackagesApi.getById(p.id, { silent: true })
      } catch (e) {
        if (gen === loadGen) {
          saveError.value = serverText(e, t('broker.partia.errors.serverShort'))
          saveErrorKind.value = 'createdLost'
        }
        return null
      }
      if (gen !== loadGen) return null
      ++seq
      const added = fresh.containers.find((x) => x.id === l.containerId)?.consolidations.filter((x) => !l.before.has(x.id)) ?? []
      const mine = added.filter((x) => sameName(x.clientName, l.name))
      if (mine.length !== 1) {
        // Не нашлась (или неоднозначно) — черновик и очередь на месте, плашка остаётся.
        pkg.value = fresh
        return fail('createdLost', 'broker.partia.errors.createdStillLost')
      }
      return finishSaved(p.id, mine[0].id, true, fresh, l.sent, gen)
    })()
    pendingSave = run
    try {
      return await run
    } finally {
      if (pendingSave === run) pendingSave = null
      if (gen === loadGen) saving.value = false
    }
  }

  const attachInvoice = async (file: File): Promise<string | null> => {
    const p = pkg.value
    const pid = openId.value
    if (!p || !pid || attaching.value || saving.value) return null
    const gen = loadGen
    attaching.value = true
    try {
      let uploaded: { id: string }
      try {
        uploaded = await documentPackagesApi.uploadFile(p.id, file)
      } catch {
        return null // тост показал перехватчик
      }
      try {
        const fresh = await documentPackagesApi.linkFile(p.id, uploaded.id, { containerId: null, clientConsolidationId: pid, documentType: 'invoice' })
        if (gen !== loadGen) return null
        // Как ответ сохранения: перечитывание, начатое раньше, этот пакет не перезапишет. Черновик не трогается.
        ++seq
        pkg.value = fresh
        reloadError.value = false
        return uploaded.id
      } catch {
        // Файл загрузился, но не привязался — он в пакете нераспределённым; список перечитать (тост дал перехватчик).
        if (gen === loadGen) void reload()
        return null
      }
    } finally {
      if (gen === loadGen) attaching.value = false
    }
  }

  const save = async (opts?: { force?: boolean }): Promise<string | null> => {
    if (saving.value) return null
    const run = doSave(opts)
    pendingSave = run
    try {
      return await run
    } finally {
      if (pendingSave === run) pendingSave = null
    }
  }

  /**
   * Вернуть снимок. Очередь инвойсов тоже несохранённая правка — очищается (иначе «не сохранено» не уходит).
   * Инвойс, который уже загрузился, но не привязался, остаётся в пакете нераспределённым файлом.
   */
  const revert = () => {
    const snap = snapshotDraft.value
    if (snap) setDraft(structuredClone(snap), true)
    pendingInvoices.value = []
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
    pkg, partia, container, draft, isNew, loading, notFound, loadError, reloadError, reloading, saving, saveError,
    saveErrorKind, createdLost: createdLostRef, attaching, transitParseFailed, dirty, pendingInvoices, invoiceUpload,
    load, save, recoverCreated, attachInvoice, revert, reload,
  }
}
