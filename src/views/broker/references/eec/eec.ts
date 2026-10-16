import type { ZTone } from '@/components/z/ZTag.vue'
import type {
  EecCodeChange, EecDiscrepancy, EecDiscrepancyKind, EecEditionStatus, EecEditionSummary, EecSyncRunStatus,
  EecSyncRunView, EecTreeAbsentCode,
} from '@/api/tnvedEec'
import { formatDay } from '@/views/broker/list'

// Логика экрана «Обновления ЕЭК» без компонентов: подписи статусов, флаги изменений кода, строка источника ставки,
// строки выгрузки в Excel. Тексты — ключи broker.references.eec.*.
export const P = 'broker.references.eec'
type T = (key: string, named?: Record<string, unknown>) => string

export const EEC_TABS = ['editions', 'decisions', 'discrepancies', 'absent'] as const
export type EecTab = typeof EEC_TABS[number]
export const parseTab = (raw: unknown): EecTab =>
  (typeof raw === 'string' && (EEC_TABS as readonly string[]).includes(raw) ? raw as EecTab : 'editions')

// ---- Статусы редакций и прогонов ----
export const EDITION_STATUSES: readonly EecEditionStatus[] = ['held', 'staged', 'parseFailed', 'applied', 'rejected', 'superseded']
const EDITION_TONE: Record<EecEditionStatus, ZTone> = {
  staged: 'info', applied: 'done', held: 'wait', rejected: 'danger', superseded: 'neutral', parseFailed: 'danger',
}
export const editionTone = (s: string): ZTone => EDITION_TONE[s as EecEditionStatus] ?? 'neutral'
export const editionStatusLabel = (s: string, t: T): string =>
  (s in EDITION_TONE ? t(`${P}.status.${s}`) : s)
/** Ждёт решения человека: подтвердить или отклонить можно staged и held. */
export const canDecide = (s: string): boolean => s === 'held' || s === 'staged'
/** «Повторно разобрать» (новая редакция из того же файла): отложенная, отклонённая, не разобранная. */
export const canRestage = (s: string): boolean => s === 'held' || s === 'rejected' || s === 'parseFailed'

const RUN_TONE: Record<EecSyncRunStatus, ZTone> = {
  running: 'info', completed: 'done', failed: 'danger', stopped: 'wait', interrupted: 'neutral',
}
export const runTone = (s: string): ZTone => RUN_TONE[s as EecSyncRunStatus] ?? 'neutral'
export const runStatusLabel = (s: string, t: T): string => (s in RUN_TONE ? t(`${P}.run.status.${s}`) : s)
const ITEM_ACTIONS = ['skipped', 'applied', 'held', 'failed', 'warning']
export const runItemLabel = (a: string, t: T): string => (ITEM_ACTIONS.includes(a) ? t(`${P}.run.action.${a}`) : a)
export const runItemTone = (a: string): ZTone =>
  a === 'applied' ? 'done' : a === 'held' || a === 'warning' ? 'wait' : a === 'failed' ? 'danger' : 'neutral'
/** Кто запустил: по расписанию / при старте — подписью, «admin:<логин>» — логином. */
export const runBy = (by: string, t: T): string => {
  if (by.startsWith('admin:')) return by.slice('admin:'.length) || t(`${P}.run.byHand`)
  if (by === 'scheduler' || by === 'schedule') return t(`${P}.run.byScheduler`)
  if (by === 'startup') return t(`${P}.run.byStartup`)
  if (by.startsWith('reevaluate:')) return t(`${P}.run.byReevaluate`, { who: by.slice('reevaluate:'.length) })
  return by
}

/** «Группа 27» / «Примечания к ЕТТ». */
export const editionTitle = (e: Pick<EecEditionSummary, 'kind' | 'group'>, t: T): string =>
  (e.kind === 'ettNotes' ? t(`${P}.notes`) : t(`${P}.group`, { n: e.group ?? '—' }))

// ---- Изменения кода в редакции ----
export const CHANGE_FLAGS = ['added', 'removed', 'rate', 'footnotes', 'unit', 'returned'] as const
export type ChangeFlag = typeof CHANGE_FLAGS[number]
/** «rate, footnotes» → ['rate', 'footnotes']; регистр не важен (Rate / rate), неизвестные флаги отбрасываются. */
export function changeFlags(kind: string | null | undefined): ChangeFlag[] {
  if (!kind) return []
  return kind.split(',')
    .map((s) => s.trim())
    .map((s) => s.charAt(0).toLowerCase() + s.slice(1))
    .filter((s): s is ChangeFlag => (CHANGE_FLAGS as readonly string[]).includes(s))
}
export const changeTone = (f: ChangeFlag): ZTone =>
  f === 'added' || f === 'returned' ? 'done' : f === 'removed' ? 'danger' : f === 'rate' ? 'wait' : 'info'

export type ChangeFilter = 'all' | 'rate' | 'added' | 'removed' | 'footnotes' | 'unit'
export const CHANGE_FILTERS: readonly ChangeFilter[] = ['all', 'rate', 'added', 'removed', 'footnotes', 'unit']
const digits = (s: string) => s.replace(/\D/g, '')
export function filterCodeChanges(codes: readonly EecCodeChange[], filter: ChangeFilter, q: string): EecCodeChange[] {
  const term = q.trim().toLowerCase()
  const d = digits(term)
  const numeric = !!d && d.length === term.replace(/[\s.]/g, '').length
  return codes.filter((c) => {
    const flags = changeFlags(c.kind)
    if (filter === 'added' && !(flags.includes('added') || flags.includes('returned'))) return false
    if (filter !== 'all' && filter !== 'added' && !flags.includes(filter)) return false
    if (!term) return true
    if (numeric) return c.code.startsWith(d)
    const name = (c.after?.nameRu ?? c.before?.nameRu ?? '').toLowerCase()
    return name.includes(term)
  })
}
export function changeCounts(codes: readonly EecCodeChange[]): Record<ChangeFilter, number> {
  const out: Record<ChangeFilter, number> = { all: codes.length, rate: 0, added: 0, removed: 0, footnotes: 0, unit: 0 }
  for (const c of codes) {
    const f = changeFlags(c.kind)
    if (f.includes('rate')) out.rate += 1
    if (f.includes('added') || f.includes('returned')) out.added += 1
    if (f.includes('removed')) out.removed += 1
    if (f.includes('footnotes')) out.footnotes += 1
    if (f.includes('unit')) out.unit += 1
  }
  return out
}

/** Ставка с единицей и сносками: «5% (м3) ¹⁰⁹ᶜ» → «5% · м3 · сн. 109С». */
export function rateStateText(s: { rateText: string | null; addUnit?: string | null; footnoteRefs?: readonly string[] } | null, t: T): string {
  if (!s) return '—'
  const parts = [s.rateText || '—']
  if (s.addUnit) parts.push(s.addUnit)
  if (s.footnoteRefs?.length) parts.push(t(`${P}.footnoteShort`, { list: s.footnoteRefs.join(', ') }))
  return parts.join(' · ')
}

// ---- Строка источника ставки ----
export interface EecSourceParts {
  editionDate?: string | null
  footnoteNumber?: string | null
  footnoteFrom?: string | null
  footnoteTo?: string | null
}
/** «ЕЭК, ред. 24.08.2026, сноска 109С до 31.12.2028»; без сноски — «ЕЭК, ред. 24.08.2026». */
export function eecSourceText(s: EecSourceParts, t: T): string {
  const parts = [s.editionDate ? t(`${P}.source.edition`, { date: formatDay(s.editionDate) }) : t(`${P}.source.eec`)]
  if (s.footnoteNumber) {
    if (s.footnoteTo) parts.push(t(`${P}.source.footnoteTo`, { n: s.footnoteNumber, date: formatDay(s.footnoteTo) }))
    else if (s.footnoteFrom) parts.push(t(`${P}.source.footnoteFrom`, { n: s.footnoteNumber, date: formatDay(s.footnoteFrom) }))
    else parts.push(t(`${P}.source.footnote`, { n: s.footnoteNumber }))
  }
  return parts.join(', ')
}

// ---- Расхождения с КЕДЕН ----
export const DISCREPANCY_KINDS: readonly EecDiscrepancyKind[] = ['rate', 'eecOnly', 'kedenOnly', 'eecNotInForce', 'eecUncertain']
export const discrepancyTone = (k: string): ZTone =>
  k === 'rate' ? 'danger' : k === 'eecUncertain' ? 'wait' : k === 'eecNotInForce' ? 'neutral' : 'info'
export const discrepancyLabel = (k: string, t: T): string =>
  ((DISCREPANCY_KINDS as readonly string[]).includes(k) ? t(`${P}.kind.${k}`) : k)
/** Счётчик вида из ответа: ключи могут прийти и как «eecOnly», и как «EecOnly» — сравниваем без регистра. */
export function countOf(counts: Record<string, number> | null | undefined, kind: string): number {
  if (!counts) return 0
  const k = Object.keys(counts).find((x) => x.toLowerCase() === kind.toLowerCase())
  return k ? counts[k] ?? 0 : 0
}
const KNOWN_PENDING = ['decision-date-unknown', 'flagged', 'footnote-missing', 'conflict', 'repeal-date-unknown',
  'repealed-history-unknown', 'retroactive', 'changed-in-edition']
/** 'decision-date-unknown' → 'decisionDateUnknown': ключи сообщений — без дефисов. */
const camel = (s: string): string => s.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())
export const pendingReasonLabel = (r: string, t: T): string => (KNOWN_PENDING.includes(r) ? t(`${P}.pending.${camel(r)}`) : r)

/** Период сноски: «до 31.12.2028», «с 01.01.2026», «01.01.2026–31.12.2028». */
export function footnotePeriod(d: Pick<EecDiscrepancy, 'footnoteFrom' | 'footnoteTo'>, t: T): string {
  if (d.footnoteFrom && d.footnoteTo) return `${formatDay(d.footnoteFrom)}–${formatDay(d.footnoteTo)}`
  if (d.footnoteTo) return t(`${P}.until`, { date: formatDay(d.footnoteTo) })
  if (d.footnoteFrom) return t(`${P}.since`, { date: formatDay(d.footnoteFrom) })
  return ''
}

export function discrepancyExcelRows(items: readonly EecDiscrepancy[], t: T): Record<string, unknown>[] {
  const c = (k: string) => t(`${P}.disc.col.${k}`)
  return items.map((d) => ({
    [c('code')]: d.code,
    [c('group')]: d.group,
    [c('name')]: d.name ?? '',
    [c('kind')]: discrepancyLabel(d.kind, t),
    [c('eec')]: d.eecRateText ?? '',
    [c('eecBase')]: d.eecBaseRateText ?? '',
    [c('keden')]: d.kedenRate ?? '',
    [c('footnote')]: d.footnoteNumber ?? (d.footnoteRefs.length ? d.footnoteRefs.join(', ') : ''),
    [c('period')]: footnotePeriod(d, t),
    [c('edition')]: d.editionDate ? formatDay(d.editionDate) : '',
    [c('notInForce')]: d.notInForceSince ? formatDay(d.notInForceSince) : '',
    [c('pending')]: d.pending.map((p) => `${p.number}: ${pendingReasonLabel(p.reason, t)}`).join('; '),
    [c('file')]: d.fileName ?? '',
  }))
}

// ---- Коды дерева, которых нет в ЕЭК ----
export const absentLabel = (k: string, t: T): string => (k === 'absent' || k === 'notInForce' ? t(`${P}.absent.kind.${k}`) : k)
export const absentTone = (k: string): ZTone => (k === 'notInForce' ? 'neutral' : 'wait')
/** Дата закрытия по умолчанию: предложенная сервером, иначе сегодня. */
export const defaultCloseDate = (r: Pick<EecTreeAbsentCode, 'suggestedEndDate'>, today: string): string => r.suggestedEndDate || today

// ---- Решения ЕЭК ----
const KNOWN_FLAGS = ['conditional', 'retroactive', 'computed', 'no-date', 'not-found', 'ambiguous', 'mismatch', 'unsupported']
export const decisionFlagLabel = (f: string, t: T): string => (KNOWN_FLAGS.includes(f) ? t(`${P}.flag.${camel(f)}`) : f)
const KNOWN_UNPARSED = ['leaf-without-rate', 'bad-code', 'rate-not-recognized', 'stray-superscript', 'orphan-text',
  'page-without-header', 'duplicate-code', 'no-table', 'group-not-found', 'group-mismatch', 'code-outside-group',
  'orphan-paragraph', 'duplicate-footnote']
export const unparsedLabel = (r: string, t: T): string => (KNOWN_UNPARSED.includes(r) ? t(`${P}.unparsed.${camel(r)}`) : r)

/** Прогон идёт: опрашиваем статус. */
export const runActive = (s: { isRunning: boolean; run: EecSyncRunView | null } | null): boolean =>
  !!s && (s.isRunning || s.run?.status === 'running')

/** Метка времени UTC без пояса — как UTC (иначе браузер прочёл бы её как местное время). */
export const utc = (iso: string | null | undefined): string | null =>
  (!iso ? null : /(?:Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`)
