import { getCurrentScope, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { import40Api, type Import40CaseDto, type Import40CaseInvoiceDto, type Import40FileDto } from '@/api/import40'
import type { DeclarationReadiness } from '@/types/api'

/** Не чаще раза в 30 с: возврат на вкладку перечитывает карточку (оплату отметили в «Счетах», файл добавил коллега). */
export const REFRESH_ON_RETURN_MS = 30_000

export type CaseLoadState = 'loading' | 'ready' | 'notFound' | 'error'

export interface UseCaseOptions {
  /** Грузить ли сводку готовности ДТ (как раньше — всем, кроме roleMode client/other). */
  readiness: () => boolean
}

interface Loaded {
  kase: Import40CaseDto
  files: Import40FileDto[]
  invoices: Import40CaseInvoiceDto[]
  readiness: DeclarationReadiness[] | null
}

const statusOf = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status

/**
 * Данные карточки заявки сотрудника: заявка, файлы, счета AQNIET и сводка готовности ДТ — параллельно.
 * - Счета: ошибка → [] (как раньше). Готовность — одним запросом keden-readiness-summary (без N+1 по ДТ);
 *   недоступна или ошибка → null.
 * - Первый показ (и смена :id) — скелетон; ошибка заявки или файлов без тоста: 404/403/400 → notFound, иначе error.
 * - reload() — без мерцания: данные остаются на экране, пока идёт запрос (refreshing); сбой — тост перехватчика,
 *   на экране последнее известное состояние.
 * - Возврат на вкладку (visibilitychange → visible) тихо (без тостов) перечитывает карточку без мерцания, если с последней загрузки прошло
 *   не меньше REFRESH_ON_RETURN_MS: оплата в «Счетах» или правка коллеги иначе не дошла бы до открытой карточки.
 * - Ответ устаревшего запроса (сменился :id, начат новый reload) отбрасывается.
 */
export function useCase(id: Ref<string>, opts: UseCaseOptions) {
  const state = ref<CaseLoadState>('loading')
  const kase = shallowRef<Import40CaseDto | null>(null)
  const files = shallowRef<Import40FileDto[]>([])
  const invoices = shallowRef<Import40CaseInvoiceDto[]>([])
  const readiness = shallowRef<DeclarationReadiness[] | null>(null)
  const refreshing = ref(false)
  let seq = 0
  let loadedAt = Date.now()

  const fetchAll = async (caseId: string, quiet: boolean): Promise<Loaded> => {
    const silent = quiet ? { silent: true } : undefined
    const [k, f, inv, rd] = await Promise.all([
      import40Api.get(caseId, silent),
      import40Api.listFiles(caseId, silent),
      import40Api.listBrokerInvoices(caseId, { silent: true }).catch(() => [] as Import40CaseInvoiceDto[]),
      opts.readiness()
        ? import40Api.kedenReadinessSummary(caseId, { silent: true }).catch(() => null)
        : Promise.resolve(null),
    ])
    return { kase: k, files: f, invoices: inv, readiness: rd }
  }

  const apply = (d: Loaded) => {
    kase.value = d.kase
    files.value = d.files
    invoices.value = d.invoices
    readiness.value = d.readiness
  }

  /** Первый показ: сброс прежних данных и скелетон. Пустой :id (уход с карточки) — без запросов, прежний ответ отбрасывается. */
  const load = async () => {
    const caseId = id.value
    const my = ++seq
    if (!caseId) return
    loadedAt = Date.now()
    state.value = 'loading'
    refreshing.value = false
    kase.value = null
    files.value = []
    invoices.value = []
    readiness.value = null
    try {
      const d = await fetchAll(caseId, true)
      if (my !== seq) return
      apply(d)
      state.value = 'ready'
    } catch (e) {
      if (my !== seq) return
      const code = statusOf(e)
      state.value = code === 404 || code === 403 || code === 400 ? 'notFound' : 'error'
    }
  }

  /**
   * Перечитать после действия: без скелетона; true — данные обновлены.
   * silent — фоновое перечитывание (возврат на вкладку): сбой без тоста, на экране последнее известное состояние.
   */
  const reload = async (o: { silent?: boolean } = {}): Promise<boolean> => {
    if (state.value !== 'ready') {
      await load()
      return (state.value as CaseLoadState) === 'ready'
    }
    const caseId = id.value
    if (!caseId) return false
    const my = ++seq
    loadedAt = Date.now()
    refreshing.value = true
    try {
      const d = await fetchAll(caseId, !!o.silent)
      if (my !== seq) return false
      apply(d)
      return true
    } catch {
      return false // тост показал перехватчик (если не silent)
    } finally {
      if (my === seq) refreshing.value = false
    }
  }

  /** Ответ PUT (правка полей) — новая заявка без полного перечитывания. Ответ по другой заявке игнорируется. */
  const setCase = (c: Import40CaseDto) => {
    if (c.id === kase.value?.id) kase.value = c
  }

  watch(id, () => { void load() }, { immediate: true })

  const onVisible = () => {
    if (document.visibilityState !== 'visible' || state.value !== 'ready' || refreshing.value) return
    if (Date.now() - loadedAt < REFRESH_ON_RETURN_MS) return
    void reload({ silent: true })
  }
  document.addEventListener('visibilitychange', onVisible)
  if (getCurrentScope()) onScopeDispose(() => document.removeEventListener('visibilitychange', onVisible))

  return { state, kase, files, invoices, readiness, refreshing, reload, retry: load, setCase }
}
