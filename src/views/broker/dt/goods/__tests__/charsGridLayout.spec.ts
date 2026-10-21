import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en'
import kk from '@/i18n/locales/kk'
import ru from '@/i18n/locales/ru'
import { plexTextPx } from '@/test/fontMetrics'
import { CHARACTERISTIC_FIELDS, type CharacteristicField } from '../editor/characteristics'
import {
  CELL_CHAR_REM, CHARS_GRID_ACTIONS_W, CHARS_GRID_COLUMNS, CHARS_GRID_NAME_SHARE, CHARS_GRID_NO_W, charsColumnWidths, charsGridLayout,
  headWidthRem, numberChars, pinnedNameMaxRem,
} from '../editor/charsGridLayout'

// Колонки таблицы строк гр. 31 (правка №17: «Производител…», «INDUSTRIES S…» обрезались): подпись на любом языке и значения
// помещаются, свободное место делят текстовые колонки, прокрутка вправо — только при нехватке места.
type Locale = typeof ru
const labelsOf = (loc: Locale): Record<CharacteristicField, string> => {
  const col = (loc as unknown as { broker: { dt: { goods: { editor: { chars: { col: Record<string, string> } } } } } })
    .broker.dt.goods.editor.chars.col
  return Object.fromEntries(CHARACTERISTIC_FIELDS.map((c) => [c.key, col[c.f]])) as Record<CharacteristicField, string>
}

// Место для текста в ячейке, px: ширина колонки минус поля px-2 (2 × 8 px) и рамка справа (1 px); rem = 16 px.
const REM = 16
const innerPx = (rem: number) => rem * REM - 2 * 8 - 1
// Запас на то, чего разбор шрифта не видит (округление в браузере, кернинг ± пара px): текст — не больше 95% места.
const SLACK = 0.95

describe('таблица гр. 31: ширины колонок', () => {
  it('подпись колонки не режется ни на одном языке — по настоящему шрифту (IBM Plex Sans 500, 12 px), в одну строку', () => {
    for (const [name, loc] of [['ru', ru], ['kk', kk], ['en', en]] as const) {
      const labels = labelsOf(loc as Locale)
      const widths = charsColumnWidths([], { labels })
      for (const c of CHARACTERISTIC_FIELDS) {
        expect(labels[c.key], `${name}.${c.f}`).toBeTruthy()
        // Ширина подписи — по шрифту, а не по той же оценке «знаков × HEAD_CHAR_REM», что и в расчёте колонки.
        const px = plexTextPx(labels[c.key], 12, 500)
        expect(px, `${name}.${c.f}: ${labels[c.key]}`).toBeLessThanOrEqual(innerPx(widths[c.key]) * SLACK)
        expect(widths[c.key], `${name}.${c.f}`).toBeGreaterThanOrEqual(CHARS_GRID_COLUMNS[c.key].min)
      }
    }
    // Проверка не пустая: «Производитель» в колонке 6 rem не поместился бы.
    expect(plexTextPx('Производитель', 12, 500)).toBeGreaterThan(innerPx(6))
    // Будущие подписи по-казахски (свои буквы Ә Ғ Қ Ң Ө Ұ Ү Һ І) — оценка в расчёте колонки с запасом и для них.
    for (const label of ['Шығарушы', 'Өлшем бірлігі', 'Тауардың сұрыбы', 'Қаптама түрі']) {
      expect(plexTextPx(label, 12, 500), label).toBeLessThanOrEqual(innerPx(headWidthRem(label)) * SLACK)
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

  it('обычные значения ДТ (ЗАГЛАВНЫЕ, 13 px) по настоящему шрифту помещаются в колонку, рассчитанную по оценке', () => {
    // Значения в пределах max колонки: их ширина считается по оценке CELL_CHAR_REM — проверяем её шрифтом (IBM Plex Sans 400).
    const samples: [CharacteristicField, string][] = [
      ['manufacturerName', 'MONCLER INDUSTRIES S.P.A.'],
      ['manufacturerName', 'SAMSUNG ELECTRONICS CO., LTD'],
      ['manufacturerName', 'ТОО «ҚАЗАҚСТАН ӨНІМДЕРІ»'],
      ['tradeMarkName', 'ОТСУТСТВУЕТ'],
      ['productModelName', 'ЖЕМЧУЖИНА'],
      ['name', 'КУРТКА МУЖСКАЯ ЗИМНЯЯ'],
      ['unitCode', 'ПАР (2 ШТ.)'],
      ['quantity', '1 234 567,125'],
    ]
    for (const [key, v] of samples) {
      const w = charsColumnWidths([{ [key]: key === 'quantity' ? 1234567.125 : v }], { unitText: () => v })[key]
      expect(plexTextPx(v, 13, 400), `${key}: ${v}`).toBeLessThanOrEqual(innerPx(w) * SLACK)
    }
  })

  it('закреплённое наименование — не шире 40% видимой таблицы (но не уже минимума); ширина неизвестна — свой предел', () => {
    const long = 'КУРТКА МУЖСКАЯ ИЗ ТЕКСТИЛЬНЫХ МАТЕРИАЛОВ' // 40 знаков — по содержимому 24 rem
    expect(charsColumnWidths([{ name: long }]).name).toBe(24)
    expect(pinnedNameMaxRem(null)).toBe(CHARS_GRID_COLUMNS.name.max)
    expect(pinnedNameMaxRem(0)).toBe(CHARS_GRID_COLUMNS.name.max)
    // «Сузить» (780 px, таблица ~732 px = 45 rem): 18 rem — закреплено № + 18 rem, остальным колонкам ~430 px, как до №17.
    expect(pinnedNameMaxRem(45)).toBe(Math.floor(45 * CHARS_GRID_NAME_SHARE))
    const narrow = charsGridLayout([{ name: long }], { readonly: false, viewRem: 45 })
    expect(narrow.widths.name).toBe(18)
    expect(narrow.nameRem).toBe(18)
    expect(narrow.template).toContain('minmax(18rem,3fr)')
    expect((CHARS_GRID_NO_W + narrow.nameRem) / 45).toBeLessThan(0.5)
    // Планшет 640 px (таблица ~592 px = 37 rem): минимум 16 rem — как было до №17.
    expect(charsGridLayout([{ name: long }], { readonly: false, viewRem: 37 }).nameRem).toBe(CHARS_GRID_COLUMNS.name.min)
    // «Широко» (окно 1440, таблица ~67 rem): наименование целиком (предел 24 rem).
    expect(charsGridLayout([{ name: long }], { readonly: false, viewRem: 67 }).nameRem).toBe(24)
    // Короткое наименование не растягивается до предела, подпись колонки — не уже своей ширины.
    expect(charsGridLayout([{ name: 'ПАРТА' }], { readonly: false, viewRem: 45 }).nameRem).toBe(CHARS_GRID_COLUMNS.name.min)
    // Остальные колонки от видимой ширины не зависят.
    const maker = 'MONCLER INDUSTRIES S.P.A. VIA STEPHENSON'
    expect(charsColumnWidths([{ manufacturerName: maker }], { viewRem: 30 }).manufacturerName).toBe(charsColumnWidths([{ manufacturerName: maker }]).manufacturerName)
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
