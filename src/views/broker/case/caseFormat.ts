import type { Import40CaseDto, Import40FileDto } from '@/api/import40'
import { formatMoney } from '@/ui/number'
import { pad } from '@/views/broker/list'

// Подписи карточки заявки: транспорт, разделы файлов, время записей истории, роль автора.

type T = (k: string, p?: Record<string, unknown>) => string


const TRANSPORT_KEYS: Record<number, string> = { 0: 'rail', 1: 'road', 2: 'air', 3: 'sea' }
export const transportKey = (mode: number): string | null => TRANSPORT_KEYS[mode] ?? null

/**
 * Транспорт одной строкой: «Авто · 777 KTA 02 / прицеп 12 KZ 3456», «ЖД · 52147896».
 * Номера — как раньше (вагон, машина, рейс, судно — все заполненные), прицеп — сразу за машиной.
 */
export function transportSummary(c: Import40CaseDto, t: T): string {
  const key = transportKey(c.transportMode)
  const kind = key ? t(`enum.transportMode.${key}`) : '—'
  const vehicle = c.vehicleNumber
    ? (c.trailerNumber ? `${c.vehicleNumber} / ${t('broker.case.header.trailer', { number: c.trailerNumber })}` : c.vehicleNumber)
    : ''
  const detail = [c.wagonNumber, vehicle, c.flightNumber, c.vesselName].filter(Boolean).join(', ')
  return detail ? `${kind} · ${detail}` : kind
}

/** Разделы файлов в порядке показа (правая колонка и панель «Все файлы»). Неизвестные — в «Прочее». */
export const FILE_SECTIONS = ['documents', 'extraction-batch', 'power-of-attorney', 'declaration-stamp', 'svh-invoice', 'payment-check'] as const
export type FileSectionKey = (typeof FILE_SECTIONS)[number] | 'other'

export const sectionOf = (f: Import40FileDto): FileSectionKey =>
  (FILE_SECTIONS as readonly string[]).includes(f.section) ? (f.section as FileSectionKey) : 'other'

/** Файлы по разделам; пустой раздел — пустой список («Прочее» — только если есть). */
export function groupFiles(files: Import40FileDto[]): { key: FileSectionKey; files: Import40FileDto[] }[] {
  const keys: FileSectionKey[] = [...FILE_SECTIONS, 'other']
  return keys
    .map((key) => ({ key, files: files.filter((f) => sectionOf(f) === key) }))
    .filter((g) => g.key !== 'other' || g.files.length > 0)
}

/** Ключ подписи раздела: broker.case.section.<camel>. */
export const sectionLabelKey = (key: FileSectionKey): string =>
  `broker.case.section.${key.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase())}`

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Время записи истории: сегодня — «10:40», вчера — «вчера, 17:05», раньше — «03.10, 17:05», другой год — «03.10.2025, 17:05». */
export function formatLogStamp(iso: string, now: Date, t: T): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (sameDay(d, now)) return time
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (sameDay(d, y)) return `${t('broker.list.yesterday')}, ${time}`
  const dm = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
  return `${d.getFullYear() === now.getFullYear() ? dm : `${dm}.${d.getFullYear()}`}, ${time}`
}

/** Роли с короткой подписью broker.case.role.* (и полной enum.businessRole.*, кроме администратора). */
const SHORT_ROLES = new Set(['declarant', 'kpp', 'mpp', 'accountant', 'sales', 'rop', 'client', 'expeditor', 'administrator'])

/** Роль автора записи коротко: «декларант», «КПП»; неизвестная — код как есть. */
export function roleLabel(code: string | null | undefined, t: T): string {
  const c = (code ?? '').trim()
  if (!c) return ''
  return SHORT_ROLES.has(c) ? t(`broker.case.role.${c}`) : c
}

/** «Айгерим К. · декларант» — имя (если есть) и роль. */
export const authorLine = (name: string | null | undefined, role: string | null | undefined, t: T): string =>
  [name?.trim(), roleLabel(role, t)].filter(Boolean).join(' · ')

/** «03.10» из ISO-даты/времени (первые 10 знаков 'YYYY-MM-DD' — без пересчёта часового пояса); '' — даты нет. */
export function shortDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}.${m[2]}` : ''
}

/** Счёт СВХ одной строкой после выставления: «312 400 ₸ · № 1187 · 03.10»; null — сумма не указана. */
export function svhInvoiceLine(c: Import40CaseDto): string | null {
  if (c.svhInvoiceAmount == null) return null
  return [formatMoney(Math.round(c.svhInvoiceAmount)), c.svhInvoiceNumber ? `№ ${c.svhInvoiceNumber}` : '', shortDate(c.svhInvoiceDate)]
    .filter(Boolean)
    .join(' · ')
}
