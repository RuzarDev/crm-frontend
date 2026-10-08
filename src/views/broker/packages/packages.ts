import type { ZTone } from '@/components/z/ZTag.vue'
import type { DocumentPackageDto, DocumentPackageStatus } from '@/types/api'
import { formatDateText } from '@/ui/date'
import { matchesQuery } from '@/views/broker/list'

// Чистая логика «Пакетов документов» (редизайн, волна 3а): права на файлы, фильтрация, счётчики, формат.

/**
 * Можно ли загружать и удалять файлы пакета — так же, как решает сервер (CanModifyFiles):
 * администратор; проверяющий (packages.manage) — в любом статусе; экспедитор — пока пакет «Загружен» или «Нужна правка».
 */
export function canModifyFiles(o: { role: string | null | undefined; canReview: boolean; status: DocumentPackageStatus }): boolean {
  const role = (o.role ?? '').trim().toLowerCase()
  if (role === 'administrator' || o.canReview) return true
  return role === 'expeditor' && (o.status === 'uploaded' || o.status === 'needsFix')
}

/** Порядок статусов в переключателе над таблицей. */
export const PACKAGE_STATUSES: DocumentPackageStatus[] = ['uploaded', 'needsFix', 'accepted', 'processed']
/** Какие статусы проверяющий может выставить (вернуть в «Загружен» нельзя — как и раньше). */
export const REVIEW_STATUSES: DocumentPackageStatus[] = ['accepted', 'needsFix', 'processed']

const STATUS_TONE: Record<DocumentPackageStatus, ZTone> = { uploaded: 'neutral', accepted: 'info', needsFix: 'wait', processed: 'done' }
export const statusTone = (s: DocumentPackageStatus): ZTone => STATUS_TONE[s] ?? 'neutral'

/** Ключи подписей статуса в тегах (общий набор transit.*). */
const STATUS_LABEL: Record<DocumentPackageStatus, string> = {
  uploaded: 'transit.zagruzhen',
  accepted: 'transit.prinyatBrokerom',
  needsFix: 'transit.nuzhnoIspravit',
  processed: 'transit.obrabotan',
}
export const statusLabelKey = (s: DocumentPackageStatus): string => STATUS_LABEL[s] ?? STATUS_LABEL.uploaded

export type PackageSegment = 'all' | DocumentPackageStatus

/**
 * Поиск по пакету: номер поезда и комментарий. Сервер ищет только по номеру поезда,
 * но список мы получаем целиком и отбираем сами — комментарий находится заодно.
 */
export const matchesPackage = (q: string, p: DocumentPackageDto): boolean => matchesQuery(q, [p.trainNumber, p.comment])

/** Строки по поиску и статусу ('all' — любой). */
export function filterPackages(rows: DocumentPackageDto[], q: string, segment: PackageSegment): DocumentPackageDto[] {
  return rows.filter((p) => (segment === 'all' || p.status === segment) && matchesPackage(q, p))
}

/** Счётчики переключателя: по найденному (поиск учтён, статус нет) — видно, где совпадения. */
export function statusCounts(rows: DocumentPackageDto[], q: string): Record<PackageSegment, number> {
  const out: Record<PackageSegment, number> = { all: 0, uploaded: 0, needsFix: 0, accepted: 0, processed: 0 }
  for (const p of rows) {
    if (!matchesPackage(q, p)) continue
    out.all++
    if (p.status in out) out[p.status]++
  }
  return out
}

/** Номера контейнеров по одному в строке: пустые строки отбрасываются, пробелы по краям — тоже. */
export const parseContainerNumbers = (text: string): string[] => text.split('\n').map((c) => c.trim()).filter(Boolean)

/** Размер файла: «512 Б», «412 КБ», «3.5 МБ» (подписи единиц — transit.b/kb/mb). */
export function formatFileSize(bytes: number, t: (k: string) => string): string {
  if (bytes < 1024) return `${bytes} ${t('transit.b')}`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ${t('transit.kb')}`
  return `${(bytes / 1024 / 1024).toFixed(1)} ${t('transit.mb')}`
}

const pad = (n: number): string => String(n).padStart(2, '0')
/** Дата и время в местном поясе: «08.10.2026 09:14»; не разобралось — пустая строка. */
export function formatStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${formatDateText(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
