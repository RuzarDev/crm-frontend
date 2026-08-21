// crm-frontend/src/components/reestr/reestrLocalOptions.ts
// КЕДЕН-транзит §2/3/8-12: небольшие фиксированные списки, для которых нет
// (и не планируется) отдельного справочника/классификатора на бэкенде —
// значения хранятся как свободная строка в соответствующих полях.
// Общий модуль, чтобы не дублировать константы в OrganizationsBlock/
// CarriersBlock/GuaranteeBlock/MiscSectionsBlock.

export type LocalOption = { value: string; label: string }

// § 2. Роли организаций.
export const ORGANIZATION_ROLE_OPTIONS: LocalOption[] = [
  { value: 'Декларант', label: 'Декларант' },
  { value: 'Отправитель', label: 'Отправитель' },
  { value: 'Получатель', label: 'Получатель' },
]

// § 3. Роли перевозчиков/представителей.
export const CARRIER_ROLE_OPTIONS: LocalOption[] = [
  { value: 'Перевозчик', label: 'Перевозчик' },
  { value: 'Представитель', label: 'Представитель' },
]

// § 2/3/12. Тип лица — используется и для организаций/перевозчиков,
// и для «Лица, представившего ПИ».
export const SUBJECT_TYPE_OPTIONS: LocalOption[] = [
  { value: 'ЮЛ', label: 'ЮЛ — Юридическое лицо' },
  { value: 'ФЛ', label: 'ФЛ — Физическое лицо' },
  { value: 'ИП', label: 'ИП — Индивидуальный предприниматель' },
  { value: 'Иностранное лицо', label: 'Иностранное лицо' },
  { value: 'Иностранная организация', label: 'Иностранная организация' },
]

// § 8. Вид грузовой операции.
export const CARGO_OPERATION_OPTIONS: LocalOption[] = [
  { value: 'Погрузка', label: 'Погрузка' },
  { value: 'Выгрузка', label: 'Выгрузка' },
  { value: 'Перегрузка', label: 'Перегрузка' },
  { value: 'Взвешивание', label: 'Взвешивание' },
  { value: 'Опломбирование', label: 'Опломбирование' },
  { value: 'Иное', label: 'Иное' },
]

// § 10. Вид обеспечения.
export const GUARANTEE_TYPE_OPTIONS: LocalOption[] = [
  { value: 'Банковская гарантия', label: 'Банковская гарантия' },
  { value: 'Денежный залог', label: 'Денежный залог' },
  { value: 'Поручительство', label: 'Поручительство' },
  { value: 'Гарантийный сертификат', label: 'Гарантийный сертификат' },
  { value: 'Не требуется', label: 'Не требуется' },
]

// Общий список валют (дублирует набор из GeneralInfoBlock.vue — там же
// используется для валюты документа § 1; см. дублирование намеренное,
// т.к. компоненты независимы, но общий пул значений держим тут).
export const CURRENCY_OPTIONS: LocalOption[] = [
  { value: 'USD', label: 'USD — Доллар США' },
  { value: 'EUR', label: 'EUR — Евро' },
  { value: 'CNY', label: 'CNY — Юань' },
  { value: 'KZT', label: 'KZT — Тенге' },
  { value: 'RUB', label: 'RUB — Рубль' },
  { value: 'GBP', label: 'GBP — Фунт стерлингов' },
  { value: 'CHF', label: 'CHF — Швейцарский франк' },
  { value: 'JPY', label: 'JPY — Иена' },
  { value: 'AED', label: 'AED — Дирхам ОАЭ' },
  { value: 'TRY', label: 'TRY — Турецкая лира' },
]
