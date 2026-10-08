// Небольшие фиксированные списки КЕДЕН-транзита (перенос components/reestr/reestrLocalOptions.ts): отдельного
// справочника на бэкенде для них нет. В записи хранится РУССКАЯ строка-значение (value), подписи — из i18n.
import { computed, type ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ZOption } from '@/ui/options'

interface LocalValue { value: string; key: string }

/** § 2. Роли организаций. */
export const ORGANIZATION_ROLES: LocalValue[] = [
  { value: 'Декларант', key: 'declarant' },
  { value: 'Отправитель', key: 'consignor' },
  { value: 'Получатель', key: 'consignee' },
]
/** § 3. Роли перевозчиков/представителей. */
export const CARRIER_ROLES: LocalValue[] = [
  { value: 'Перевозчик', key: 'carrier' },
  { value: 'Представитель', key: 'representative' },
]
/** § 2/3/12. Тип лица (организации, перевозчики, лицо, представившее ПИ). */
export const SUBJECT_TYPES: LocalValue[] = [
  { value: 'ЮЛ', key: 'ul' },
  { value: 'ФЛ', key: 'fl' },
  { value: 'ИП', key: 'ip' },
  { value: 'Иностранное лицо', key: 'foreignPerson' },
  { value: 'Иностранная организация', key: 'foreignOrg' },
]
/** § 8. Вид грузовой операции. */
export const CARGO_OPERATIONS: LocalValue[] = [
  { value: 'Погрузка', key: 'loading' },
  { value: 'Выгрузка', key: 'unloading' },
  { value: 'Перегрузка', key: 'reloading' },
  { value: 'Взвешивание', key: 'weighing' },
  { value: 'Опломбирование', key: 'sealing' },
  { value: 'Иное', key: 'other' },
]
/** § 10. Вид обеспечения. */
export const GUARANTEE_TYPES: LocalValue[] = [
  { value: 'Банковская гарантия', key: 'bank' },
  { value: 'Денежный залог', key: 'deposit' },
  { value: 'Поручительство', key: 'surety' },
  { value: 'Гарантийный сертификат', key: 'certificate' },
  { value: 'Не требуется', key: 'none' },
]

/** Роль новой строки — значение из списка (не перевод): на kk/en перевод не совпал бы ни с одним вариантом. */
export const DEFAULT_ORGANIZATION_ROLE = ORGANIZATION_ROLES[0].value
export const DEFAULT_CARRIER_ROLE = CARRIER_ROLES[0].value

/** Один общий список валют (раньше — три копии: «Основное», товары, гарантия). Подписи — broker.transitRecord.main.currency.*. */
export const CURRENCY_CODES = ['USD', 'EUR', 'CNY', 'KZT', 'RUB', 'GBP', 'CHF', 'JPY', 'AED', 'TRY']

export interface LocalOptions {
  organizationRoles: ComputedRef<ZOption[]>
  carrierRoles: ComputedRef<ZOption[]>
  subjectTypes: ComputedRef<ZOption[]>
  cargoOperations: ComputedRef<ZOption[]>
  guaranteeTypes: ComputedRef<ZOption[]>
  currencies: ComputedRef<ZOption[]>
}

/** Варианты списков с подписями на языке интерфейса; значения — прежние русские строки. */
export function useLocalOptions(): LocalOptions {
  const { t } = useI18n()
  const group = (name: string, list: LocalValue[]) =>
    computed<ZOption[]>(() => list.map((o) => ({ value: o.value, label: t(`broker.transitRecord.opt.${name}.${o.key}`) })))
  return {
    organizationRoles: group('orgRole', ORGANIZATION_ROLES),
    carrierRoles: group('carrierRole', CARRIER_ROLES),
    subjectTypes: group('subjectType', SUBJECT_TYPES),
    cargoOperations: group('cargoOp', CARGO_OPERATIONS),
    guaranteeTypes: group('guarantee', GUARANTEE_TYPES),
    currencies: computed<ZOption[]>(() => CURRENCY_CODES.map((c) => ({ value: c, label: `${c} — ${t(`broker.transitRecord.main.currency.${c}`)}` }))),
  }
}
