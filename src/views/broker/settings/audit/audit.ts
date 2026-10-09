import type { ZTone } from '@/components/z/ZTag.vue'
import { calendarLocale } from '@/ui/date'
import { pad } from '@/views/broker/list'
import type { AuditSearchRow } from '@/api/system'

// «Журнал действий» (волна 5б): чистая логика страницы — фильтры в адресе, вид действия, даты, строки Excel.

/** Размер страницы журнала и потолок выгрузки в Excel (сервер отдаёт до 5000 строк за запрос). */
export const AUDIT_PAGE = 50
export const AUDIT_EXPORT_LIMIT = 5000
export const AUDIT_Q_DEBOUNCE_MS = 400

/** Периоды чипа; 0 — «за всё время» (параметр days не отправляется). */
export const AUDIT_DAYS = [7, 30, 90] as const
export const AUDIT_DEFAULT_DAYS = 30

/** Все действия, которые пишет сервер: для чипа «Все действия». Порядок — по группам, подписи — enum.auditAction. */
export const AUDIT_ACTIONS = [
  'role.permissions', 'role.reset', 'user.role', 'user.roles', 'user.poa',
  'user.password_reset', 'user.password_change',
  'client.block', 'document.revoke',
  'user.create', 'user.delete', 'client.invite', 'client.unblock', 'document.sign.upload', 'invoice.remind', 'organization.update',
] as const

/** Вид действия → тон точки: права/роли — фиолетовый, пароли — охра, отзыв/блокировка — красный, остальное — синий. */
const KIND: Record<string, ZTone> = {
  'role.permissions': 'submitted', 'role.reset': 'submitted', 'user.role': 'submitted', 'user.roles': 'submitted', 'user.poa': 'submitted',
  'user.password_reset': 'wait', 'user.password_change': 'wait',
  'client.block': 'danger', 'document.revoke': 'danger',
}
export const auditTone = (action: string): ZTone => KIND[action.trim().toLowerCase()] ?? 'info'

// ---- Фильтры в адресе: ?days=&action=&actor=&q= ----
export interface AuditFilters {
  /** 0 — за всё время. */
  days: number
  action: string
  actor: string
  q: string
}

const one = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : v == null ? '' : String(v))

/** Фильтры из адреса. Нет days или мусор — 30 дней; days=0 — всё время. */
export function parseAuditQuery(query: Record<string, unknown>): AuditFilters {
  const raw = one(query.days).trim()
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN
  const days = raw === '' || Number.isNaN(n) ? AUDIT_DEFAULT_DAYS : n
  return { days, action: one(query.action).trim(), actor: one(query.actor).trim(), q: one(query.q).trim() }
}

/** Адрес без значений по умолчанию (30 дней, пустые поля); чужие параметры адреса не трогаем. */
export function buildAuditQuery(base: Record<string, unknown>, f: AuditFilters): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) {
    if (['days', 'action', 'actor', 'q'].includes(k)) continue
    const s = one(v)
    if (s) out[k] = s
  }
  if (f.days !== AUDIT_DEFAULT_DAYS) out.days = String(f.days)
  if (f.action) out.action = f.action
  if (f.actor) out.actor = f.actor
  if (f.q.trim()) out.q = f.q.trim()
  return out
}

/** Параметры запроса `system/audit/search`; days=0 и пустые поля не отправляются. */
export function auditParams(f: AuditFilters, offset: number, limit: number) {
  return {
    ...(f.days > 0 ? { days: f.days } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(f.actor ? { actorId: f.actor } : {}),
    ...(f.q.trim() ? { q: f.q.trim() } : {}),
    offset,
    limit,
  }
}

// ---- Даты ----
const toDate = (iso: string): Date => new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)

/** «09.10, 10:42» — день и месяц первыми, время 24-часовое; в другом году добавляется год («09.10.2025, 10:42»). */
export function formatAuditWhen(iso: string, locale: string, now: Date = new Date(), withYear = false): string {
  const d = toDate(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const parts = new Intl.DateTimeFormat(calendarLocale(locale), {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const day = `${get('day')}.${get('month')}`
  const date = withYear || d.getFullYear() !== now.getFullYear() ? `${day}.${get('year')}` : day
  return `${date}, ${pad(Number(get('hour')))}:${pad(Number(get('minute')))}`
}

// ---- Excel ----
export interface AuditExportLabels { when: string; who: string; action: string; what: string }

/** Строки файла — колонки как в таблице; дата всегда с годом. */
export function auditExcelRows(
  rows: AuditSearchRow[], labels: AuditExportLabels, locale: string, actionLabel: (a: string) => string,
  actorLabel: (r: AuditSearchRow) => string = (r) => r.actorName,
): Record<string, unknown>[] {
  return rows.map((r) => ({
    [labels.when]: formatAuditWhen(r.atUtc, locale, new Date(), true),
    [labels.who]: actorLabel(r),
    [labels.action]: actionLabel(r.action),
    [labels.what]: r.summary,
  }))
}
