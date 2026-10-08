import type { ZTone } from '@/components/z/ZTag.vue'
import type { KedenDeclarationListItemDto } from '@/api/keden'
import type { KedenDeclarationStatus } from '@/types/api'
import { matchesQuery, pad } from '@/views/broker/list'

// Чистая логика экрана «КЕДЕН» (редизайн, волна 3а, доска Keden): строки двух источников приводятся к одной форме,
// тон статуса — один на оба режима, поиск и фильтры считаются на клиенте.

/** all — список администратора (/keden), mine — статусы по БИН пользователя (/keden-status). */
export type KedenMode = 'all' | 'mine'

export interface KedenRow {
  id: string
  /** Идентификатор в КЕДЕН; только у «all» — подпись ссылки, когда рег. номера ещё нет. */
  kedenId: string | null
  registrationNumber: string | null
  /** Тип декларации (PI/DT/TD/…); у «mine» не приходит. */
  type: string | null
  statusCode: string | null
  statusName: string | null
  customsPost: string | null
  declarantName: string | null
  /** БИН декларанта; есть только у «mine». */
  declarantXin: string | null
  /** Дата изменения статуса (ISO) и она же числом — для сортировки; пустая — в конец. */
  changedAt: string | null
  ts: number | null
}

const stamp = (iso: string | null): number | null => {
  if (!iso) return null
  const n = new Date(iso).getTime()
  return Number.isNaN(n) ? null : n
}

export const rowFromListItem = (i: KedenDeclarationListItemDto): KedenRow => ({
  id: i.id,
  kedenId: i.kedenId,
  registrationNumber: i.registrationNumber,
  type: i.declarationType,
  statusCode: i.statusCode,
  statusName: i.statusName,
  customsPost: i.customsPost,
  declarantName: i.declarantName,
  declarantXin: null,
  changedAt: i.statusDateTimeUtc,
  ts: stamp(i.statusDateTimeUtc),
})

export const rowFromMine = (i: KedenDeclarationStatus): KedenRow => ({
  id: i.id,
  kedenId: null,
  registrationNumber: i.registrationNumber,
  type: null,
  statusCode: null,
  statusName: i.statusName,
  customsPost: i.customsPost,
  declarantName: i.declarantName,
  declarantXin: i.declarantXin,
  changedAt: i.statusDateTimeUtc,
  ts: stamp(i.statusDateTimeUtc),
})

// statusName приходит из КЕДЕН как есть и всегда на русском (это значение внешней системы, а не текст интерфейса) —
// сравниваем по стабильным русским подстрокам, а не через t(): на kk/en t() вернул бы переведённое слово (аудит 2026-09-28, п.10б).
const NAME_TONES: [string[], ZTone][] = [
  [['отказ'], 'danger'],
  [['условн'], 'pay'],
  [['выпущен', 'завершен', 'выпуск разреш'], 'done'],
  [['отозван'], 'neutral'],
  [['зарегистр'], 'submitted'],
  [['проверк'], 'wait'],
]

/** Тон статуса: по названию (русскому), иначе по коду (ACCEPTED/RELEASED/DRAFT), иначе info. Один для обоих режимов. */
export function statusTone(code: string | null | undefined, name: string | null | undefined): ZTone {
  const s = (name ?? '').toLowerCase().replace(/ё/g, 'е')
  if (s) {
    for (const [words, tone] of NAME_TONES) if (words.some((w) => s.includes(w))) return tone
  }
  switch (code) {
    case 'ACCEPTED':
    case 'RELEASED': return 'done'
    case 'DRAFT': return 'neutral'
    default: return 'info'
  }
}

/** Поиск: рег. номер, декларант и БИН. */
export const matchesRow = (q: string, r: KedenRow): boolean => matchesQuery(q, [r.registrationNumber, r.declarantName, r.declarantXin])

export interface KedenFilters { q: string; status: string | null; post: string | null }
export const emptyFilters = (): KedenFilters => ({ q: '', status: null, post: null })
export const hasFilters = (f: KedenFilters): boolean => !!(f.q.trim() || f.status || f.post)

export function filterRows(rows: KedenRow[], f: KedenFilters): KedenRow[] {
  return rows.filter((r) => matchesRow(f.q, r) && (!f.status || (r.statusName ?? '').trim() === f.status) && (!f.post || (r.customsPost ?? '').trim() === f.post))
}

type Option = { value: string; label: string }
const distinct = (values: (string | null)[]): Option[] =>
  [...new Set(values.map((v) => (v ?? '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ru'))
    .map((v) => ({ value: v, label: v }))

/** Варианты чипа «Статус»: различные названия из строк. */
export const statusOptions = (rows: KedenRow[]): Option[] => distinct(rows.map((r) => r.statusName))
/** Варианты чипа «Пост»: различные таможенные посты из строк. */
export const postOptions = (rows: KedenRow[]): Option[] => distinct(rows.map((r) => r.customsPost))

/** «08.10, 10:12» в местном поясе; пусто или не разобралось — пустая строка. */
export function formatChanged(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
