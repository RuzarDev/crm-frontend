import type { ZTone } from '@/components/z/ZTag.vue'
import type { Import40BoardRow } from '@/api/import40Board'
import { inPeriod, matchesQuery } from '@/views/broker/list'

// Чистая логика списка «Заявки» (вкладки, исполнитель, фильтры) — без Vue и запросов, чтобы проверять тестами.

export type RequestTab = 'active' | 'waiting' | 'my' | 'drafts' | 'done'
export const REQUEST_TABS: RequestTab[] = ['active', 'waiting', 'my', 'drafts', 'done']

/** Значение фильтра «Исполнитель» для заявок без назначенных. */
export const EXECUTOR_NONE = 'none'

type T = (key: string) => string

/** Идёт работа: от «На границе» до «Ждёт оплаты услуг» (статусы 1–7). */
const inWork = (s: number): boolean => s >= 1 && s <= 7

/** Ждёт клиента: «Счёт выставлен» (клиент оплачивает склад) или проблема с вопросом клиенту. Только среди идущих в работе. */
const isWaiting = (r: Pick<Import40BoardRow, 'status' | 'isProblem' | 'hasClientMessage'>): boolean =>
  inWork(r.status) && (r.status === 6 || (r.isProblem && r.hasClientMessage))

/** Главная вкладка заявки из списка «все»: черновик, завершённая, «ждёт клиента», иначе «в работе». */
export function tabOf(r: Pick<Import40BoardRow, 'status' | 'isProblem' | 'hasClientMessage'>): Exclude<RequestTab, 'my'> {
  if (r.status === 0) return 'drafts'
  if (r.status >= 8) return 'done'
  return isWaiting(r) ? 'waiting' : 'active'
}

/**
 * Входит ли заявка во вкладку. «Ждут клиента» — подмножество «В работе» (счёт выставлен виден в обеих).
 * «Мои» считает сервер (view=my) — для этой вкладки любая строка ответа подходит.
 */
export function inTab(r: Pick<Import40BoardRow, 'status' | 'isProblem' | 'hasClientMessage'>, tab: RequestTab): boolean {
  switch (tab) {
    case 'active': return inWork(r.status)
    case 'waiting': return isWaiting(r)
    case 'drafts': return r.status === 0
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

/** 8471300000 → «8471 30 000 0»; не десять цифр — как есть. */
export function formatTnved(code: string): string {
  return /^\d{10}$/.test(code) ? `${code.slice(0, 4)} ${code.slice(4, 6)} ${code.slice(6, 9)} ${code.slice(9)}` : code
}

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
  const missing = (needsDeclarant(r.status) && !r.assignedDeclarantId) || (needsKpp(r.status) && !r.assignedKppId)
  return { text: parts.join(' · '), missing }
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
}

export const emptyFilters = (): RequestFilters => ({ q: '', client: null, executor: null, stage: null, period: null })
export const hasFilters = (f: RequestFilters): boolean => !!(f.q.trim() || f.client || f.executor || f.stage || f.period)

/** Фильтры и поиск — все на клиенте, по загруженным строкам. */
export function filterRows(rows: Import40BoardRow[], f: RequestFilters): Import40BoardRow[] {
  return rows.filter((r) => {
    if (f.client && r.clientId !== f.client) return false
    if (f.stage != null && f.stage !== '' && String(r.status) !== f.stage) return false
    if (f.executor) {
      if (f.executor === EXECUTOR_NONE) {
        if (r.assignedDeclarantId || r.assignedKppId) return false
      } else if (r.assignedDeclarantId !== f.executor && r.assignedKppId !== f.executor) return false
    }
    if (!inPeriod(r.updatedAtUtc, f.period)) return false
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
