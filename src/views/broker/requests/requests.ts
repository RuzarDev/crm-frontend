import type { ZTone } from '@/components/z/ZTag.vue'
import type { Import40BoardRow } from '@/api/import40Board'
import { inPeriod, matchesQuery } from '@/views/broker/list'
import { matchesCondRel, type CondRelFilter } from '@/utils/conditionalRelease'
import { kedenUnlinked } from '@/utils/kedenLink'

// Чистая логика списка «Заявки» (вкладки, исполнитель, фильтры) — без Vue и запросов, чтобы проверять тестами.

export type RequestTab = 'active' | 'waiting' | 'my' | 'drafts' | 'done'
export const REQUEST_TABS: RequestTab[] = ['active', 'waiting', 'my', 'drafts', 'done']

/** Значение фильтра «Исполнитель» для заявок без назначенных. */
export const EXECUTOR_NONE = 'none'

type T = (key: string) => string

/** Идёт работа: от «На границе» до «Ждёт оплаты услуг» (статусы 1–7). Та же формула — «В работе» на Главной и в карточке
 * клиента (сервер Import40Metrics.InWork, S-17 30.10.2026). */
export const inWork = (s: number): boolean => s >= 1 && s <= 7

type WaitRow = Pick<Import40BoardRow, 'status' | 'isProblem' | 'hasClientMessage' | 'rework' | 'openCustomsRequest'>

/** Черновик, возвращённый клиенту на доработку (S-21): не «Черновик», а «Ждут клиента» с тегом «На доработке». */
export const isRework = (r: Pick<Import40BoardRow, 'status' | 'rework'>): boolean => r.status === 0 && !!r.rework

/**
 * Ждёт клиента: заявка в работе со «Счёт выставлен» (клиент оплачивает склад), проблемой с вопросом клиенту или открытым
 * запросом таможни без ответа (S-21); плюс черновик, возвращённый на доработку (S-21, 30.10.2026).
 */
const isWaiting = (r: WaitRow): boolean =>
  isRework(r) || (inWork(r.status) && (r.status === 6 || (r.isProblem && r.hasClientMessage) || !!r.openCustomsRequest))

/** «Проблемные» (S-16/S-18): флаг проблемы у заявки в работе — та же формула, что на Главной (Import40Metrics.ActiveProblem). */
export const isActiveProblem = (r: Pick<Import40BoardRow, 'status' | 'isProblem'>): boolean => r.isProblem && inWork(r.status)

/** Главная вкладка заявки из списка «все»: черновик, завершённая, «ждёт клиента», иначе «в работе». */
export function tabOf(r: WaitRow): Exclude<RequestTab, 'my'> {
  if (isRework(r)) return 'waiting'
  if (r.status === 0) return 'drafts'
  if (r.status >= 8) return 'done'
  return isWaiting(r) ? 'waiting' : 'active'
}

/**
 * Входит ли заявка во вкладку. «Ждут клиента» среди идущих в работе — подмножество «В работе» (счёт выставлен виден
 * в обеих); возвращённый на доработку черновик — только в «Ждут клиента». «Мои» считает сервер (view=my).
 */
export function inTab(r: WaitRow, tab: RequestTab): boolean {
  switch (tab) {
    case 'active': return inWork(r.status)
    case 'waiting': return isWaiting(r)
    case 'drafts': return r.status === 0 && !isRework(r)
    case 'done': return r.status === 8 || r.status === 9
    default: return true
  }
}

/** Нужен КПП: «На границе», «ДТ выпущена», «Закрытие СВХ», «Счёт выставлен». */
export const needsKpp = (status: number): boolean => status === 1 || status === 4 || status === 5 || status === 6
/** Нужен декларант: «Декларирование», «ДТ подана». */
export const needsDeclarant = (status: number): boolean => status === 2 || status === 3

/** Тон тега этапа (как у статусов в карточке заявки). */
export function stageTone(status: number): ZTone {
  switch (status) {
    case 1: case 6: case 7: return 'wait'
    case 2: return 'info'
    case 3: return 'submitted'
    case 4: case 8: return 'done'
    case 5: return 'pay'
    default: return 'neutral' // 0 и 9
  }
}

// Формат кода ТН ВЭД — общий (src/utils/tnvedFormat.ts); реэкспорт для прежних импортов.
export { formatTnved } from '@/utils/tnvedFormat'

export interface ExecutorInfo {
  /** «Декларант · КПП» именами (своё имя — «вы»); пусто, если никто не назначен. */
  text: string
  /** Заявке на этом шаге нужен исполнитель, а его нет. */
  missing: boolean
}

/** «Айгерим Касымова» → «Айгерим К.» (для узкой колонки); одно слово — как есть. */
export function shortName(name: string): string {
  const [first, second] = name.trim().split(/\s+/)
  return second ? `${first} ${second[0].toUpperCase()}.` : (first ?? '')
}

/** Заявке на этом шаге нужен исполнитель, а его нет (ячейка «не назначен» и фильтр «Не назначен»). */
export const executorMissing = (r: Pick<Import40BoardRow, 'status' | 'assignedDeclarantId' | 'assignedKppId'>): boolean =>
  (needsDeclarant(r.status) && !r.assignedDeclarantId) || (needsKpp(r.status) && !r.assignedKppId)

/** Исполнитель заявки для ячейки; t — переводчик (ключи import40Case.you / staffAssigned); short — «Имя Ф.». */
export function executorInfo(
  r: Pick<Import40BoardRow, 'status' | 'assignedDeclarantId' | 'assignedDeclarantName' | 'assignedKppId' | 'assignedKppName'>,
  userId: string | null,
  t: T,
  short = false,
): ExecutorInfo {
  const part = (id?: string | null, name?: string | null): string | null =>
    id ? (id === userId ? t('import40Case.you') : name ? (short ? shortName(name) : name) : t('import40Case.staffAssigned')) : null
  const parts = [part(r.assignedDeclarantId, r.assignedDeclarantName), part(r.assignedKppId, r.assignedKppName)].filter((p): p is string => !!p)
  return { text: parts.join(' · '), missing: executorMissing(r) }
}

/** Ячейка «Исполнитель» одной строкой: имена, «не назначен» (если нужен и нет) или «—». Для Excel и подсказок. */
export function executorText(r: Parameters<typeof executorInfo>[0], userId: string | null, t: T): string {
  const { text, missing } = executorInfo(r, userId, t)
  if (!missing) return text || '—'
  return text ? `${text} · ${t('broker.requests.unassigned')}` : t('broker.requests.unassigned')
}

export interface RequestFilters {
  q: string
  /** clientId */
  client: string | null
  /** id сотрудника или EXECUTOR_NONE */
  executor: string | null
  /** статус как строка: '2' */
  stage: string | null
  period: [string, string] | null
  /** Условный выпуск (17.10): любой открытый или по состоянию; null — без фильтра. */
  condRel?: CondRelFilter | null
  /** КЕДЕН (17.10): 'unlinked' — ДТ подана, а хотя бы одна ДТ не связана с журналом КЕДЕН; null — без фильтра. */
  keden?: 'unlinked' | null
  /** Только проблемные заявки в работе (S-16, 30.10.2026; ?problem=1 — ссылка с Главной). */
  problem?: boolean
}

export const emptyFilters = (): RequestFilters => ({ q: '', client: null, executor: null, stage: null, period: null, condRel: null, keden: null, problem: false })
export const hasFilters = (f: RequestFilters): boolean => !!(f.q.trim() || f.client || f.executor || f.stage || f.period || f.condRel || f.keden || f.problem)

/** Фильтры и поиск — все на клиенте, по загруженным строкам. */
export function filterRows(rows: Import40BoardRow[], f: RequestFilters): Import40BoardRow[] {
  return rows.filter((r) => {
    if (f.client && r.clientId !== f.client) return false
    if (f.stage != null && f.stage !== '' && String(r.status) !== f.stage) return false
    if (f.executor) {
      // «Не назначен» — ровно то, что ячейка показывает как «не назначен».
      if (f.executor === EXECUTOR_NONE) {
        if (!executorMissing(r)) return false
      } else if (r.assignedDeclarantId !== f.executor && r.assignedKppId !== f.executor) return false
    }
    if (!inPeriod(r.updatedAtUtc, f.period)) return false
    if (!matchesCondRel(r.conditionalRelease, f.condRel ?? null)) return false
    if (f.keden === 'unlinked' && !kedenUnlinked(r)) return false
    if (f.problem && !isActiveProblem(r)) return false
    return matchesQuery(f.q, [r.number, r.clientName, r.cargo, r.post, ...r.tnvedCodes, ...r.containerNumbers])
  })
}

type Option = { value: string; label: string }
const byLabel = (a: Option, b: Option) => a.label.localeCompare(b.label, 'ru')

/** Клиенты из строк (по clientId, подпись — название). */
export function clientOptions(rows: Import40BoardRow[]): Option[] {
  const m = new Map<string, string>()
  for (const r of rows) if (r.clientId && !m.has(r.clientId)) m.set(r.clientId, r.clientName || r.clientId)
  return [...m].map(([value, label]) => ({ value, label })).sort(byLabel)
}

/** Исполнители из строк: назначенные декларанты и КПП + «Не назначен» первым. */
export function executorOptions(rows: Import40BoardRow[], t: T): Option[] {
  const m = new Map<string, string>()
  for (const r of rows) {
    if (r.assignedDeclarantId) m.set(r.assignedDeclarantId, r.assignedDeclarantName || t('import40Case.staffAssigned'))
    if (r.assignedKppId) m.set(r.assignedKppId, r.assignedKppName || t('import40Case.staffAssigned'))
  }
  const people = [...m].map(([value, label]) => ({ value, label })).sort(byLabel)
  return [{ value: EXECUTOR_NONE, label: t('broker.requests.unassignedOption') }, ...people]
}

/** Счётчики вкладок по строкам «все» (вкладку «Мои» считает свой запрос). */
export function tabCounts(rows: Import40BoardRow[]): Record<Exclude<RequestTab, 'my'>, number> {
  const c = { active: 0, waiting: 0, drafts: 0, done: 0 }
  for (const r of rows) {
    if (inTab(r, 'active')) c.active++
    if (inTab(r, 'waiting')) c.waiting++
    if (inTab(r, 'drafts')) c.drafts++
    if (inTab(r, 'done')) c.done++
  }
  return c
}

/** Вкладка из ?tab=: известные значения, «all» (старые ссылки) → «В работе»; прочее — null. */
export function parseTab(v: unknown): RequestTab | null {
  if (v === 'all') return 'active'
  return typeof v === 'string' && (REQUEST_TABS as string[]).includes(v) ? (v as RequestTab) : null
}
