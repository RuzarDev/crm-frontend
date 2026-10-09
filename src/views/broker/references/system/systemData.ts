// «Данные системы» (редизайн, волна 5а, доска SystemData): пункты левого меню, подписи классификаторов,
// фильтр списков (поиск + «Активные / Скрытые / Все»), даты и числа по языку интерфейса.

export type RefKind = 'stations' | 'posts'
export type RegistryKind = 'gr33' | 'kato' | 'warehouses' | 'nsi' | 'trois'
/** Пункт меню: справочник, классификатор ЕЭК (cls:<код>), реестр или синхронизация ТН ВЭД. Он же ?item= в адресе. */
export type SystemItem = RefKind | RegistryKind | 'tnved-sync' | `cls:${string}`

export const REF_KINDS: readonly RefKind[] = ['stations', 'posts']
export const REGISTRY_KINDS: readonly RegistryKind[] = ['gr33', 'kato', 'warehouses', 'nsi', 'trois']
export const SYNC_ITEM = 'tnved-sync' as const
export const CLS_PREFIX = 'cls:'

export const isRefKind = (k: string): k is RefKind => (REF_KINDS as readonly string[]).includes(k)
export const isRegistryKind = (k: string): k is RegistryKind => (REGISTRY_KINDS as readonly string[]).includes(k)
export const classifierOf = (k: string): string | null => (k.startsWith(CLS_PREFIX) && k.length > CLS_PREFIX.length ? k.slice(CLS_PREFIX.length) : null)

/** Значение ?item= → пункт, если он доступен; иначе null (экран откроет первый доступный). */
export function parseItem(raw: unknown, access: { admin: boolean; sync: boolean }): SystemItem | null {
  const v = typeof raw === 'string' ? raw.trim() : ''
  if (!v) return null
  if (v === SYNC_ITEM) return access.sync ? SYNC_ITEM : null
  if (!access.admin) return null
  if (isRefKind(v) || isRegistryKind(v)) return v
  return classifierOf(v) ? (v as SystemItem) : null
}

// Подписи классификаторов: ключи — коды из сидов DatabaseExtensions; неизвестный код показывается как есть.
const CLASSIFIER_KEYS: Record<string, string> = {
  '2004': 'c2004',
  '2005': 'c2005',
  '2008': 'c2008',
  '2009': 'c2009',
  '2013': 'c2013',
  '2024': 'c2024',
  'pref-fee': 'prefFee',
  'pref-duty': 'prefDuty',
  'pref-excise': 'prefExcise',
  'pref-vat': 'prefVat',
  'tax-modes': 'taxModes',
  'rate-kinds': 'rateKinds',
  'payment-features': 'paymentFeatures',
  'payment-methods': 'paymentMethods',
  'transaction-natures': 'transactionNatures',
  'goods-locations': 'goodsLocations',
  'rate-types': 'rateTypes',
  'customs-procedures': 'customsProcedures',
  'movement-features': 'movementFeatures',
  'declaring-features': 'declaringFeatures',
  'incoterms': 'incoterms',
  'vehicle-marks': 'vehicleMarks',
  'okei-units': 'okeiUnits',
  'customs-posts': 'customsPosts',
  'certification-kinds': 'certificationKinds',
  'declaration-types': 'declarationTypes',
  'entry-method': 'entryMethod',
  'id-doc-types': 'idDocTypes',
  'identification-means': 'identificationMeans',
  'itn-categories': 'itnCategories',
  'movement-direction': 'movementDirection',
  'ois-indicators': 'oisIndicators',
  'packaging-availability': 'packagingAvailability',
  'packaging-info': 'packagingInfo',
  'packaging-info-kind': 'packagingInfoKind',
  'presentation-purpose': 'presentationPurpose',
  'prev-doc-types': 'prevDocTypes',
  'restriction-marks': 'restrictionMarks',
  'settlement-terms': 'settlementTerms',
  'transport-mode': 'transportMode',
  'transport-purpose': 'transportPurpose',
  'used-as-declaration': 'usedAsDeclaration',
}

export const classifierTitleKey = (code: string): string | null =>
  CLASSIFIER_KEYS[code] ? `broker.references.system.cls.${CLASSIFIER_KEYS[code]}` : null

export function classifierTitle(code: string, t: (k: string) => string): string {
  const key = classifierTitleKey(code)
  return key ? t(key) : code
}

// ---- Списки: поиск и сегменты ----
export type Segment = 'active' | 'hidden' | 'all'
export interface ListRow { id: string; isActive: boolean; name?: string; code?: string; nameRu?: string }

const norm = (s: string | undefined | null) => (s ?? '').toLocaleLowerCase('ru').replace(/\s+/g, ' ').trim()

export function filterRows<T extends ListRow>(rows: readonly T[], q: string, segment: Segment): T[] {
  const term = norm(q)
  return rows.filter((r) => {
    if (segment === 'active' && !r.isActive) return false
    if (segment === 'hidden' && r.isActive) return false
    if (!term) return true
    return [r.name, r.code, r.nameRu].some((v) => norm(v).includes(term))
  })
}

export const countHidden = (rows: readonly ListRow[]): number => rows.filter((r) => !r.isActive).length
export const countActive = (rows: readonly ListRow[]): number => rows.filter((r) => r.isActive).length

// ---- Даты и числа по языку интерфейса ----
const INTL: Record<string, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' }
export const intlLocale = (locale: string): string => INTL[locale] ?? 'ru-RU'

const validDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 06.10.2026, 14:20 */
export function formatDateTime(iso: string | null | undefined, locale: string): string {
  const d = validDate(iso)
  return d
    ? d.toLocaleString(intlLocale(locale), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'
}

/** Дата без времени (YYYY-MM-DD) → 26.08.2028 по языку интерфейса, без сдвига часового пояса. */
export function formatDay(isoDate: string | null | undefined, locale: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate ?? '')
  if (!m) return '—'
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toLocaleDateString(intlLocale(locale), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
}

/** 06.10 — дата последней синхронизации в меню. */
export function formatDayMonth(iso: string | null | undefined, locale: string): string {
  const d = validDate(iso)
  return d ? d.toLocaleDateString(intlLocale(locale), { day: '2-digit', month: '2-digit' }) : '—'
}

export const formatCount = (n: number, locale: string): string => n.toLocaleString(intlLocale(locale))

/** Самая поздняя дата из списка (статусы реестров по видам). */
export function latest(dates: readonly (string | null | undefined)[]): string | null {
  const list = dates.filter((x): x is string => !!x && !!validDate(x)).sort((a, b) => validDate(a)!.getTime() - validDate(b)!.getTime())
  return list.length ? list[list.length - 1] : null
}

/** Длительность прогона синхронизации: «45 с», «3 мин»; не закончился — null. */
export function durationParts(start: string, finish: string | null): { unit: 'sec' | 'min'; n: number } | null {
  const a = validDate(start)
  const b = validDate(finish)
  if (!a || !b) return null
  const ms = Math.max(0, b.getTime() - a.getTime())
  return ms < 60_000 ? { unit: 'sec', n: Math.round(ms / 1000) } : { unit: 'min', n: Math.round(ms / 60_000) }
}

/** Ошибка ответа сервера с кодом статуса (409 — такой код уже есть). */
export const responseStatus = (e: unknown): number | undefined =>
  (e as { response?: { status?: number } } | null)?.response?.status
