import type { AnalyticsMonth, AnalyticsStaff, AnalyticsStage } from '@/api/analytics'
import { businessRoleLabel } from '@/api/permissions'
import { formatMoney } from '@/ui/number'

// Чистая логика экрана «Аналитика» (редизайн, волна 3б): дельты 30 дней, масштаб столбцов, подписи месяцев,
// цвета стадий (только токены), деньги в миллионах, подписи ролей и сотрудников. Данные приходят готовыми с сервера.

export type Translate = (key: string, params?: Record<string, unknown>) => string

// ---- Дельта к предыдущим 30 дням ----
export type Delta = { kind: 'pct'; pct: number } | { kind: 'new' } | { kind: 'flat' }

/** Было 0, стало больше — «новое»; 0 и 0 или рост меньше полпроцента — «без изменений»; иначе целые проценты. */
export function delta(cur: number, prev: number): Delta {
  if (!prev) return cur ? { kind: 'new' } : { kind: 'flat' }
  const pct = Math.round(((cur - prev) / prev) * 100)
  return pct === 0 ? { kind: 'flat' } : { kind: 'pct', pct }
}

/** Рост — зелёный, падение — красный; «новое» и «без изменений» — без цвета. */
export const deltaTone = (d: Delta): 'up' | 'down' | null => (d.kind === 'pct' ? (d.pct > 0 ? 'up' : 'down') : null)

/** «+14%» / «−5%» / «новое» / «без изменений»; withSuffix — «+14% к прошлым 30 дням». */
export function deltaText(d: Delta, t: Translate, withSuffix = false): string {
  if (d.kind === 'new') return t('broker.analytics.delta.new')
  if (d.kind === 'flat') return t('broker.analytics.delta.flat')
  const text = `${d.pct > 0 ? '+' : '−'}${Math.abs(d.pct)}%`
  return withSuffix ? t('broker.analytics.delta.vsPrev', { delta: text }) : text
}

// ---- Столбцы ----
/** Высота столбика, %: ряд масштабируется по своему максимуму; не ниже 4% (нулевое значение остаётся видимым). */
export const barHeight = (v: number, max: number): number => (max > 0 ? Math.max(4, Math.round((v / max) * 100)) : 4)

/** Ширина полосы, %: 0 — пусто, иначе не уже 3% (малое значение не пропадает). */
export const barWidth = (v: number, max: number): number => (v > 0 && max > 0 ? Math.max(3, Math.round((v / max) * 100)) : 0)

export const maxOf = (values: number[]): number => Math.max(...values, 1)

/** Три ряда по месяцам: цвета — токены (заявки navy, ДТ zircon, транзит line-strong). */
export type MonthSeriesKey = 'cases' | 'declarations' | 'transit'
export interface MonthSeries { key: MonthSeriesKey; bar: string; value: (m: AnalyticsMonth) => number }
export const MONTH_SERIES: MonthSeries[] = [
  { key: 'cases', bar: 'bg-navy', value: (m) => m.cases },
  { key: 'declarations', bar: 'bg-zircon', value: (m) => m.declarations },
  { key: 'transit', bar: 'bg-line-strong', value: (m) => m.transitEntries },
]

// ---- Месяцы ----
// Краткие названия месяцев уже есть на трёх языках (admin.*): берём их, подпись реактивна к языку через t().
const MONTH_KEYS = ['yanv', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noya', 'dek']

/** «2026-09» → «сен 26» (год двумя цифрами, как раньше); мусор возвращается как есть. */
export function monthLabel(ym: string, t: Translate): string {
  const match = /^(\d{4})-(\d{2})/.exec(ym)
  const key = match ? MONTH_KEYS[Number(match[2]) - 1] : undefined
  return match && key ? `${t(`admin.${key}`)} ${match[1].slice(2)}` : ym
}

// ---- Стадии ----
export const STAGE_BAR: Record<string, string> = {
  draft: 'bg-faint',
  border: 'bg-gold',
  declaring: 'bg-zircon',
  svh: 'bg-tone-pay-fg',
  payment: 'bg-tone-submitted-fg',
  done: 'bg-tone-done-fg',
}
export const stageBar = (key: string): string => STAGE_BAR[key] ?? 'bg-faint'
/** Подпись стадии; draft — «Заявка и документы», как на остальных экранах (не «Новые»). */
export const stageLabel = (s: AnalyticsStage, t: Translate): string => {
  if (s.key === 'draft') return t('admin.zayavkaIDokumenty')
  return s.key in STAGE_BAR ? t(`broker.analytics.stage.${s.key}`) : s.key
}

// ---- Числа ----
/** Платежи в миллионах с одной цифрой: «18,2 млн ₸»; меньше миллиона — полной суммой «450 000 ₸». */
export function formatPayments(v: number, locale: string, t: Translate): string {
  if (Math.abs(v) < 1_000_000) return formatMoney(v)
  return t('broker.analytics.mln', { n: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v / 1_000_000) })
}

/** Полная сумма для подсказки (title) у значений «млн ₸»; меньше миллиона значение и так полное — undefined. */
export const paymentsTitle = (v: number): string | undefined => (Math.abs(v) < 1_000_000 ? undefined : formatMoney(v))

/** Срок оформления: «4,6 дн.»; нет выполненных — «—». */
export function formatDays(v: number | null, locale: string, t: Translate): string {
  if (v == null) return '—'
  return t('broker.analytics.days', { n: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v) })
}

// ---- Люди ----
/** Короткая подпись роли: у декларанта и КПП — как на «Распределении», остальные — общая подпись роли; пусто — ''. */
export function roleShort(role: string, t: Translate, te: (key: string) => boolean): string {
  const r = (role || '').trim().toLowerCase()
  if (!r) return ''
  return te(`broker.manage.role.${r}`) ? t(`broker.manage.role.${r}`) : businessRoleLabel(role)
}

/** Имя сотрудника: из справочника (displayName или логин), иначе логин из аналитики, иначе «—». */
export const staffName = (s: AnalyticsStaff, names: Record<string, string>): string =>
  names[s.userId] || (s.username || '').trim() || '—'

/** Общее описание графика для скринридера: ряды по месяцам и платежи гр. B (если были). */
export function chartDescription(months: AnalyticsMonth[], t: Translate, locale: string): string {
  const parts = months.map((m) => {
    const params = { month: monthLabel(m.month, t), cases: m.cases, declarations: m.declarations, transit: m.transitEntries }
    return m.paymentsKzt
      ? t('broker.analytics.chart.monthSummaryPay', { ...params, payments: formatPayments(m.paymentsKzt, locale, t) })
      : t('broker.analytics.chart.monthSummary', params)
  })
  return `${t('broker.analytics.chart.label')}. ${parts.join('; ')}`
}
