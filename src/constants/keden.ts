// Классификаторы ЕАЭС/КЕДЕН (минимальные списки из эталона + ходовые значения).
// Все селекты по ним — с ручным вводом (combobox): классификаторы шире этих списков.

export interface KedenCode {
  code: string
  name: string
}

export const KEDEN_TAX_MODES: KedenCode[] = [
  { code: '1010', name: 'Таможенный сбор за таможенные операции' },
  { code: '2010', name: 'Ввозная таможенная пошлина' },
  { code: '4010', name: 'Акциз' },
  { code: '5060', name: 'НДС' },
]

export const KEDEN_RATE_KINDS: KedenCode[] = [
  { code: '%', name: 'Процентная (адвалорная)' },
  { code: 'S', name: 'Фиксированная сумма' },
  { code: '*', name: 'За единицу измерения (специфическая)' },
]

export const KEDEN_PAYMENT_FEATURES: KedenCode[] = [
  { code: 'ИУ', name: 'Исчислен и уплачен' },
  { code: 'УН', name: 'Условно начислен' },
]

export const KEDEN_PAYMENT_METHODS: KedenCode[] = [
  { code: 'БН', name: 'Безналичный расчёт' },
  { code: 'НР', name: 'Наличный расчёт' },
]

export const KEDEN_PREFERENCES: KedenCode[] = [
  { code: 'ОО', name: 'Без преференций (общий порядок)' },
  { code: 'Z', name: 'Не облагается' },
]

export const KEDEN_VALUATION_METHODS: KedenCode[] = [
  { code: '1', name: '1 — по стоимости сделки с ввозимыми товарами' },
  { code: '2', name: '2 — по стоимости сделки с идентичными товарами' },
  { code: '3', name: '3 — по стоимости сделки с однородными товарами' },
  { code: '4', name: '4 — вычитания' },
  { code: '5', name: '5 — сложения' },
  { code: '6', name: '6 — резервный' },
]

export const KEDEN_PACKAGE_KINDS: KedenCode[] = [
  { code: 'PK', name: 'Упаковка (package)' },
  { code: 'CT', name: 'Картонная коробка' },
  { code: 'PL', name: 'Паллета' },
  { code: 'BG', name: 'Мешок' },
]

export const KEDEN_TRANSPORT_MODES_2004: KedenCode[] = [
  { code: '20', name: 'Железнодорожный' },
  { code: '30', name: 'Автомобильный' },
  { code: '31', name: 'Состав транспортных средств (тягач с прицепом)' },
  { code: '40', name: 'Воздушный' },
  { code: '10', name: 'Морской' },
]

export const KEDEN_TRANSPORT_TYPE_2024: KedenCode[] = [
  { code: '319', name: 'Полуприцеп' },
  { code: '320', name: 'Прицеп' },
]

export const KEDEN_TRANSACTION_NATURES: KedenCode[] = [
  { code: '021', name: 'Купля-продажа' },
  { code: '010', name: 'Безвозмездная передача' },
]

export const KEDEN_GOODS_LOCATIONS: KedenCode[] = [
  { code: '11', name: 'СВХ' },
  { code: '12', name: 'Таможенный склад' },
]

export const KEDEN_RATE_TYPES: KedenCode[] = [
  { code: 'ETT', name: 'ЕТТ ЕАЭС' },
  { code: 'EATT', name: 'Изъятия (ЕАТТ)' },
]

export const kedenOptions = (list: KedenCode[]) =>
  list.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
