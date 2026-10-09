import { tnvedApi } from '@/api/tnved'
import type {
  TnvedExplanationDto, TnvedExportReferenceDto, TnvedNodeDto, TnvedRateDto, TnvedReferenceDto, TnvedTransitionDto,
} from '@/types/api'
import { calendarLocale } from '@/ui/date'
import { httpStatus, isRateLimited } from '@/views/references/tnvedShared'

// Правила экрана «ТН ВЭД» сотрудника (редизайн, волна 5а) — без Vue, проверяются отдельно.
// Чтения tnved/* ограничены 60 запросами в минуту: данные вкладки грузятся, только когда её открыли,
// и один раз на код за время жизни экрана (повторный выбор кода — из кэша).

export type TabKey = 'rates' | 'calc' | 'notes' | 'measures' | 'export'
export const TABS: TabKey[] = ['rates', 'calc', 'notes', 'measures', 'export']

/** Что можно открыть у узла: калькулятор, нетарифка и экспорт — только у 10-значного кода, пояснения — у любого кода. */
export const tabEnabled = (tab: TabKey, n: Pick<TnvedNodeDto, 'code' | 'is10'>): boolean => {
  if (tab === 'calc' || tab === 'measures' || tab === 'export') return n.is10
  if (tab === 'notes') return !!n.code
  return true
}

/** Ставки есть только у конечных позиций; у группы вкладка «Ставки» — подсказка раскрыть её. */
export const hasRates = (n: Pick<TnvedNodeDto, 'is10' | 'isLast'>): boolean => n.is10 || n.isLast

/** Другой код: открытая вкладка остаётся, если у нового кода она есть (сравнить ставки соседей), иначе — «Ставки». */
export const nextTab = (current: TabKey, n: Pick<TnvedNodeDto, 'code' | 'is10'>): TabKey => (tabEnabled(current, n) ? current : 'rates')

export type LoadStatus = 'loading' | 'done' | 'missing' | 'error' | 'limit'
export interface Loaded<T> { status: LoadStatus; data: T | null }

/** 404 — данных по коду нет (не ошибка: синхронизация их ещё не загрузила или кода нет); 429 — лимит запросов. */
export const failStatus = (e: unknown): LoadStatus => (httpStatus(e) === 404 ? 'missing' : isRateLimited(e) ? 'limit' : 'error')

// Что грузит каждая вкладка (и предупреждение об устаревшем коде в шапке карточки). Без тостов: ошибки — на месте.
export interface CodeData {
  rates: TnvedRateDto
  notes: TnvedExplanationDto
  measures: TnvedReferenceDto
  export: TnvedExportReferenceDto
  transition: TnvedTransitionDto
}
export type DataKind = keyof CodeData

export const FETCHERS: { [K in DataKind]: (code: string) => Promise<CodeData[K]> } = {
  rates: async (c) => (await tnvedApi.rates(c, { silent: true })).data,
  notes: async (c) => (await tnvedApi.notes(c, { silent: true })).data,
  measures: async (c) => (await tnvedApi.reference(c, { silent: true })).data,
  export: async (c) => (await tnvedApi.exportReference(c, { silent: true })).data,
  transition: async (c) => (await tnvedApi.getTransition(c, { silent: true })).data,
}

/**
 * Кэш данных кодов на время жизни экрана. Хранит ответы и «нет данных» (404); ошибки и 429 — нет
 * («Повторить» спросит снова). Одновременные запросы одного и того же склеиваются в один.
 */
export function createCodeCache(fetchers: { [K in DataKind]: (code: string) => Promise<CodeData[K]> } = FETCHERS) {
  const done = new Map<string, Loaded<unknown>>()
  const inflight = new Map<string, Promise<Loaded<unknown>>>()
  const keyOf = (kind: DataKind, code: string) => `${kind}:${code}`

  const peek = <K extends DataKind>(kind: K, code: string): Loaded<CodeData[K]> | undefined =>
    done.get(keyOf(kind, code)) as Loaded<CodeData[K]> | undefined

  const load = <K extends DataKind>(kind: K, code: string): Promise<Loaded<CodeData[K]>> => {
    const key = keyOf(kind, code)
    const hit = done.get(key)
    if (hit) return Promise.resolve(hit as Loaded<CodeData[K]>)
    const pending = inflight.get(key)
    if (pending) return pending as Promise<Loaded<CodeData[K]>>
    const p: Promise<Loaded<unknown>> = fetchers[kind](code)
      .then((data): Loaded<unknown> => ({ status: 'done', data }), (e): Loaded<unknown> => ({ status: failStatus(e), data: null }))
      .then((r) => {
        inflight.delete(key)
        if (r.status === 'done' || r.status === 'missing') done.set(key, r)
        return r
      })
    inflight.set(key, p)
    return p as Promise<Loaded<CodeData[K]>>
  }

  return { load, peek }
}
export type CodeCache = ReturnType<typeof createCodeCache>

/** Ссылки ЕЭК во вкладке «Пояснения» (как на прежнем экране). */
export const EEC_LINKS = [
  { key: 'sales.eecExplanations', url: 'https://eec.eaeunion.org/comission/department/catr/ett/' },
  { key: 'sales.eecClassificationDecisions', url: 'https://eec.eaeunion.org/comission/department/dep_tamoj_zak/klassifikatsiya-tovarov-v-sootvetstvii-s-tn-ved-eaes/resheniya-o-klassifikatsii-tovarov.php' },
  { key: 'sales.eecPreliminaryDecisions', url: 'https://portal.eaeunion.org/sites/odata/_layouts/15/Portal.EEC.Registry.Ui/DirectoryForm.aspx?ViewId=01d0337c-71f3-455b-950d-d882bf9547d9&ListId=0e3ead06-5475-466a-a340-6f69c01b5687&ItemId=219' },
] as const

/** Дата обновления по языку интерфейса («09.10.2026» / «09/10/2026»); нет даты или мусор — пусто. */
export const formatUpdated = (iso: string | null | undefined, locale: string): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(calendarLocale(locale), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

/** Подбор по описанию: вероятность 0…1 → «87%». */
export const percent = (p: number): string => `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`
