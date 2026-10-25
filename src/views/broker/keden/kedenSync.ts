import type { KedenSyncStatusDto } from '@/api/keden'
import { pad } from '@/views/broker/list'

// Чистая логика строки состояния kedenlogger над списком КЕДЕН (23.10.2026: постоянная сессия, опрос ДТ раз в 3 минуты).
// Время показываем по Алматы — фиксированный UTC+5, как AlmatyOffset на сервере (Казахстан в одном поясе с 01.03.2024):
// не зависит ни от пояса браузера (владелец бывает в Китае), ни от версии tzdata.

/** Как часто экран переспрашивает состояние, пока открыт. */
export const SYNC_REFRESH_MS = 60_000
const ALMATY_OFFSET_MS = 5 * 3600_000

/** Время с сервера без пояса — это UTC. Пусто или не разобралось — null. */
export function parseUtc(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** Последний опрос КЕДЕН — быстрый или полный, что позже. */
export function lastPollAt(s: Pick<KedenSyncStatusDto, 'lastQuickPollAtUtc' | 'lastFullSyncAtUtc'>): number | null {
  const a = parseUtc(s.lastQuickPollAtUtc)
  const b = parseUtc(s.lastFullSyncAtUtc)
  if (a === null) return b
  if (b === null) return a
  return Math.max(a, b)
}

/** Части даты по Алматы (UTC+5). */
const almaty = (ms: number) => {
  const d = new Date(ms + ALMATY_OFFSET_MS)
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }
}

/** «23.10.2026, 14:20» по Алматы — для подсказки. */
export function almatyStamp(ms: number): string {
  const a = almaty(ms)
  return `${pad(a.d)}.${pad(a.mo)}.${a.y}, ${pad(a.h)}:${pad(a.mi)}`
}

/**
 * Время для строки: меньше минуты — «только что», меньше часа — «N мин назад», иначе по Алматы:
 * сегодня — «14:20», в этом году — «22.10, 14:20», иначе с годом. Время из будущего (часы разошлись) — «только что».
 */
export type SyncTime = { kind: 'now' } | { kind: 'ago'; minutes: number } | { kind: 'at'; text: string }

export function syncTime(ms: number, now: number): SyncTime {
  const minutes = Math.floor((now - ms) / 60_000)
  if (minutes < 1) return { kind: 'now' }
  if (minutes < 60) return { kind: 'ago', minutes }
  const a = almaty(ms)
  const n = almaty(now)
  const hm = `${pad(a.h)}:${pad(a.mi)}`
  if (a.y === n.y && a.mo === n.mo && a.d === n.d) return { kind: 'at', text: hm }
  if (a.y === n.y) return { kind: 'at', text: `${pad(a.d)}.${pad(a.mo)}, ${hm}` }
  return { kind: 'at', text: `${pad(a.d)}.${pad(a.mo)}.${a.y}, ${hm}` }
}

/**
 * Кому показывать строку — как сервер (KedenSyncStatusEndpoints.CanRead): администратор; сотрудник (системная роль
 * importer/broker/sales) с import40.read или reestr.read. Клиент и экспедитор — нет: там ошибки kedenlogger'а.
 */
const SYNC_STAFF_ROLES = ['importer', 'broker', 'sales']
export function canSeeSync(role: string | null | undefined, hasPermission: (p: string) => boolean): boolean {
  const r = (role ?? '').trim().toLowerCase()
  if (r === 'administrator') return true
  return SYNC_STAFF_ROLES.includes(r) && (hasPermission('import40.read') || hasPermission('reestr.read'))
}

/** Ответ, после которого переспрашивать бессмысленно: нет права (403) или сервер ещё без маршрута (404). */
export function isPermanentSyncError(e: unknown): boolean {
  const status = (e as { response?: { status?: number } } | null)?.response?.status
  return status === 401 || status === 403 || status === 404
}
