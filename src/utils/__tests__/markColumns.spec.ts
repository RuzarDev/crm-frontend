import { describe, expect, it } from 'vitest'
import { markFieldOf } from '../markColumns'
import { MARK_COLUMN_TABLE, MARK_KEY_FIELD } from './markColumnsTable'

// Решение владельца 21.10.2026 — одно правило с Zircon AI (aqniet/marks.py): таблица заголовков та же.
describe('markFieldOf: марка, товарный знак, модель', () => {
  it.each(MARK_COLUMN_TABLE)('«%s» → %s', (header, key) => {
    expect(markFieldOf(header)).toBe(MARK_KEY_FIELD[key])
  })

  it.each(['Модель', 'Model No.', 'Артикул', 'Производитель', 'Shipping mark', 'Marks & Nos', 'Маркировка', 'Наименование', '', null])(
    '«%s» — не столбец марки (решают обычные образцы)', (header) => {
      expect(markFieldOf(header)).toBeNull()
    },
  )
})
