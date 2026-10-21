import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en'
import kk from '@/i18n/locales/kk'
import ru from '@/i18n/locales/ru'
import { CHARACTERISTIC_FIELDS, type CharacteristicField } from '../editor/characteristics'
import {
  CELL_CHAR_REM, CHARS_GRID_ACTIONS_W, CHARS_GRID_COLUMNS, CHARS_GRID_NO_W, charsColumnWidths, charsGridLayout, headWidthRem,
  HEAD_CHAR_REM, numberChars,
} from '../editor/charsGridLayout'

// Колонки таблицы строк гр. 31 (правка №17: «Производител…», «INDUSTRIES S…» обрезались): подпись на любом языке и значения
// помещаются, свободное место делят текстовые колонки, прокрутка вправо — только при нехватке места.
type Locale = typeof ru
const labelsOf = (loc: Locale): Record<CharacteristicField, string> => {
  const col = (loc as unknown as { broker: { dt: { goods: { editor: { chars: { col: Record<string, string> } } } } } })
    .broker.dt.goods.editor.chars.col
  return Object.fromEntries(CHARACTERISTIC_FIELDS.map((c) => [c.key, col[c.f]])) as Record<CharacteristicField, string>
}

describe('таблица гр. 31: ширины колонок', () => {
  it('подпись колонки не режется ни на одном языке: ширина колонки — не меньше подписи', () => {
    for (const [name, loc] of [['ru', ru], ['kk', kk], ['en', en]] as const) {
      const labels = labelsOf(loc as Locale)
      const widths = charsColumnWidths([], { labels })
      for (const c of CHARACTERISTIC_FIELDS) {
        expect(labels[c.key], `${name}.${c.f}`).toBeTruthy()
        // Подпись (12 px) — ~0,5 rem на знак плюс поля ячейки.
        expect(widths[c.key], `${name}.${c.f}`).toBeGreaterThanOrEqual(labels[c.key].length * HEAD_CHAR_REM + 1)
        expect(widths[c.key], `${name}.${c.f}`).toBeGreaterThanOrEqual(CHARS_GRID_COLUMNS[c.key].min)
      }
    }
    // Длинная подпись (будущий перевод) расширяет колонку сверх предела по содержимому.
    expect(charsColumnWidths([], { labels: { productSortName: 'ОЧЕНЬ ДЛИННАЯ ПОДПИСЬ КОЛОНКИ СОРТА ТОВАРА' } }).productSortName)
      .toBe(headWidthRem('ОЧЕНЬ ДЛИННАЯ ПОДПИСЬ КОЛОНКИ СОРТА ТОВАРА'))
  })

  it('пустая таблица — минимальные ширины; итог — сумма колонок с № и кнопками (в просмотре — без кнопок)', () => {
    const edit = charsGridLayout([], { readonly: false })
    const mins = CHARACTERISTIC_FIELDS.reduce((s, c) => s + CHARS_GRID_COLUMNS[c.key].min, 0)
    expect(edit.widthRem).toBe(CHARS_GRID_NO_W + mins + CHARS_GRID_ACTIONS_W)
    expect(edit.nameRem).toBe(CHARS_GRID_COLUMNS.name.min)
    const view = charsGridLayout([], { readonly: true })
    expect(view.widthRem).toBe(CHARS_GRID_NO_W + mins)
    expect(view.template.split(' ')).toHaveLength(1 + CHARACTERISTIC_FIELDS.length)
    expect(edit.template.split(' ')).toHaveLength(2 + CHARACTERISTIC_FIELDS.length)
  })

  it('текстовые колонки делят свободное место (minmax(ширина, N fr)); числа, единица, стандарт, сорт — фиксированы', () => {
    const tracks = charsGridLayout([], { readonly: false }).template.split(' ')
    expect(tracks[0]).toBe(`${CHARS_GRID_NO_W}rem`)
    expect(tracks.at(-1)).toBe(`${CHARS_GRID_ACTIONS_W}rem`)
    const byKey = Object.fromEntries(CHARACTERISTIC_FIELDS.map((c, i) => [c.key, tracks[i + 1]])) as Record<CharacteristicField, string>
    expect(byKey.name).toBe('minmax(16rem,3fr)')
    expect(byKey.manufacturerName).toBe('minmax(12rem,2fr)')
    expect(byKey.tradeMarkName).toBe('minmax(8rem,1fr)')
    expect(byKey.serialNumbers).toBe('minmax(8rem,1fr)')
    expect(byKey.quantity).toBe('6rem')
    expect(byKey.unitCode).toBe('4.5rem')
    expect(byKey.invoiceValue).toBe('7rem')
    expect(byKey.standardName).toBe('6rem')
    expect(byKey.productSortName).toBe('4.5rem')
  })

  it('длинное значение расширяет колонку (производитель целиком), но не больше предела; шаг — 1 rem', () => {
    const maker = 'MONCLER INDUSTRIES S.P.A. VIA STEPHENSON'
    const w = charsColumnWidths([{ manufacturerName: 'ТОО' }, { manufacturerName: maker }])
    expect(w.manufacturerName).toBe(Math.ceil(maker.length * CELL_CHAR_REM + 1.25))
    expect(Number.isInteger(w.manufacturerName)).toBe(true)
    expect(w.manufacturerName).toBeGreaterThan(CHARS_GRID_COLUMNS.manufacturerName.min)
    const huge = charsColumnWidths([{ manufacturerName: 'X'.repeat(300), serialNumbers: 'S'.repeat(2000), name: 'Н'.repeat(500) }])
    expect(huge.manufacturerName).toBe(CHARS_GRID_COLUMNS.manufacturerName.max)
    expect(huge.serialNumbers).toBe(CHARS_GRID_COLUMNS.serialNumbers.max)
    // Наименование закреплено слева — его предел держит место для остальных колонок на узкой панели.
    expect(huge.name).toBe(CHARS_GRID_COLUMNS.name.max)
    const layout = charsGridLayout([{ manufacturerName: maker }], { readonly: false })
    expect(layout.template).toContain(`minmax(${w.manufacturerName}rem,2fr)`)
    expect(layout.widthRem).toBe(charsGridLayout([], { readonly: false }).widthRem + w.manufacturerName - CHARS_GRID_COLUMNS.manufacturerName.min)
  })

  it('числа — с разрядами и дробной частью; единица — как покажет ячейка; подсказка единственной строки тоже помещается', () => {
    expect(numberChars(1234567.125)).toBe(13) // «1 234 567,125»
    expect(numberChars(-5)).toBe(2)
    expect(numberChars(0.1234567)).toBe(8) // дробная часть — до 6 знаков
    expect(numberChars(Number.NaN)).toBe(0)
    const big = charsColumnWidths([{ quantity: 123456789012.123456 }])
    expect(big.quantity).toBeGreaterThan(CHARS_GRID_COLUMNS.quantity.min)
    expect(big.quantity).toBeLessThanOrEqual(CHARS_GRID_COLUMNS.quantity.max)
    const unit = charsColumnWidths([{ unitCode: '715' }], { unitText: () => 'ПАР (2 ШТ.)' })
    expect(unit.unitCode).toBe(Math.ceil('ПАР (2 ШТ.)'.length * CELL_CHAR_REM + 1.25))
    const ph = charsColumnWidths([{}], { placeholders: { quantity: 'гр. 41: 1 234 567,5' } })
    expect(ph.quantity).toBe(Math.min(CHARS_GRID_COLUMNS.quantity.max, Math.ceil('гр. 41: 1 234 567,5'.length * CELL_CHAR_REM + 1.25)))
  })
})
