import type { ZTone } from '@/components/z/ZTag.vue'
import type { RegistryCategory, RegistryDocument, RegistryFields, RegistryStatus } from '@/api/clientRegistry'
import { REGISTRY_CATEGORIES } from '@/api/clientRegistry'
import { formatDay, matchesQuery } from '@/views/broker/list'

// Чистая логика реестра документов клиента (волна 17.10, задача 2): фильтры, счётчики, подписи, Excel.

export type StatusFilter = 'all' | RegistryStatus
export type CategoryFilter = 'all' | RegistryCategory
export const STATUS_FILTERS: StatusFilter[] = ['all', 'active', 'expiring', 'expired', 'unlimited']

export const STATUS_TONE: Record<RegistryStatus, ZTone> = {
  active: 'done',
  expiring: 'wait',
  expired: 'danger',
  unlimited: 'neutral',
}

/** Вид документа заявки (Import40File.DocKind) по категории — как на сервере (ClientRegistryRules.DefaultDocKind). */
export const defaultDocKind = (c: RegistryCategory): string => {
  switch (c) {
    case 'supplyContract':
    case 'unk':
      return 'contract'
    case 'certificate':
    case 'conformityDeclaration':
      return 'conformity'
    case 'permit':
    case 'license':
      return 'permit'
    default:
      return 'other'
  }
}

export const isRegistryCategory = (v: unknown): v is RegistryCategory =>
  typeof v === 'string' && (REGISTRY_CATEGORIES as string[]).includes(v)

/** Поиск: номер, название, контрагент, коды ТН ВЭД, имена файлов, клиент (в общем реестре). */
export const matchesDoc = (q: string, d: RegistryDocument): boolean =>
  matchesQuery(q, [d.number, d.title, d.counterparty, d.tnvedCodes, d.note, d.clientName, ...d.files.map((f) => f.fileName)])

export const filterDocs = (
  docs: RegistryDocument[], q: string, category: CategoryFilter, status: StatusFilter,
): RegistryDocument[] =>
  docs.filter((d) => (category === 'all' || d.category === category) && (status === 'all' || d.status === status) && matchesDoc(q, d))

/** Счётчики статусов по найденному (поиск и категория учтены, статус — нет). */
export function statusCounts(docs: RegistryDocument[], q: string, category: CategoryFilter): Record<StatusFilter, number> {
  const out: Record<StatusFilter, number> = { all: 0, active: 0, expiring: 0, expired: 0, unlimited: 0 }
  for (const d of docs) {
    if ((category !== 'all' && d.category !== category) || !matchesDoc(q, d)) continue
    out.all++
    out[d.status]++
  }
  return out
}

/** Сколько документов в каждой категории (для подписей фильтра). */
export function categoryCounts(docs: RegistryDocument[]): Record<RegistryCategory, number> {
  const out = Object.fromEntries(REGISTRY_CATEGORIES.map((c) => [c, 0])) as Record<RegistryCategory, number>
  for (const d of docs) out[d.category]++
  return out
}

type T = (key: string, named?: Record<string, unknown>) => string

/** «Сертификат № KZ-1 · Насосы» — заголовок строки. */
export function docTitle(d: Pick<RegistryDocument, 'category' | 'number' | 'title'>, t: T): string {
  const parts = [t(`clientRegistry.category.${d.category}`)]
  if (d.number) parts.push(t('clientRegistry.numberShort', { n: d.number }))
  let out = parts.join(' ')
  if (d.title) out += ` · ${d.title}`
  return out
}

/** Пояснение к сроку: «осталось 12 дн.», «истёк 3 дн. назад», «сегодня последний день», «бессрочный». */
export function validityHint(d: Pick<RegistryDocument, 'status' | 'daysLeft'>, t: T): string {
  if (d.status === 'unlimited' || d.daysLeft === null) return t('clientRegistry.hint.unlimited')
  if (d.daysLeft < 0) return t('clientRegistry.hint.overdue', { n: -d.daysLeft })
  if (d.daysLeft === 0) return t('clientRegistry.hint.today')
  return t('clientRegistry.hint.left', { n: d.daysLeft })
}

export const validDate = (iso: string | null): string => (iso ? formatDay(iso) : '—')

export const emptyFields = (category: RegistryCategory = 'supplyContract'): RegistryFields => ({
  category, title: '', number: '', issuedOn: null, validUntil: null, counterparty: '', tnvedCodes: '', note: '',
})

export const fieldsOf = (d: RegistryDocument): RegistryFields => ({
  category: d.category,
  title: d.title ?? '',
  number: d.number ?? '',
  issuedOn: d.issuedOn,
  validUntil: d.validUntil,
  counterparty: d.counterparty ?? '',
  tnvedCodes: d.tnvedCodes ?? '',
  note: d.note ?? '',
})

/** Ошибки формы — ключи i18n (как проверяет сервер). */
export function fieldErrors(f: RegistryFields): Partial<Record<'number' | 'title' | 'validUntil', string>> {
  const out: Partial<Record<'number' | 'title' | 'validUntil', string>> = {}
  if (f.category !== 'other' && !f.number.trim()) out.number = 'clientRegistry.form.numberRequired'
  if (f.category === 'other' && !f.number.trim() && !f.title.trim()) out.title = 'clientRegistry.form.titleOrNumber'
  if (f.issuedOn && f.validUntil && f.validUntil < f.issuedOn) out.validUntil = 'clientRegistry.form.untilBeforeIssued'
  return out
}

/** Строки Excel общего реестра (отфильтрованные). */
export function registryExcelRows(rows: RegistryDocument[], t: T): Record<string, unknown>[] {
  return rows.map((d) => ({
    [t('clientRegistry.col.client')]: d.clientName ?? '',
    [t('clientRegistry.col.category')]: t(`clientRegistry.category.${d.category}`),
    [t('clientRegistry.col.number')]: d.number,
    [t('clientRegistry.form.title')]: d.title ?? '',
    [t('clientRegistry.form.counterparty')]: d.counterparty ?? '',
    [t('clientRegistry.form.tnved')]: d.tnvedCodes ?? '',
    [t('clientRegistry.form.issuedOn')]: d.issuedOn ? formatDay(d.issuedOn) : '',
    [t('clientRegistry.form.validUntil')]: d.validUntil ? formatDay(d.validUntil) : '',
    [t('clientRegistry.col.status')]: t(`clientRegistry.status.${d.status}`),
    [t('clientRegistry.col.daysLeft')]: d.daysLeft ?? '',
    [t('clientRegistry.col.files')]: d.files.length,
    [t('clientRegistry.form.note')]: d.note ?? '',
  }))
}
