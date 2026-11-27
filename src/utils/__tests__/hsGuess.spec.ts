import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import { formatHsGuess, hsGuessesFromAutoTransit, hsGuessesFromImport40, hsGuessText } from '../hsGuess'

const { t } = createI18n({ legacy: false, locale: 'ru', messages: { ru } }).global

describe('hsGuess', () => {
  it('formats code like gr. 33', () => {
    expect(formatHsGuess('870323')).toBe('8703 23')
    expect(formatHsGuess('8703801090')).toBe('8703 80 109 0')
  })

  it('takes Import 40 guesses only for items without code', () => {
    const rows = hsGuessesFromImport40({
      declaration: { goodsItems: [{ description: 'Автомобиль легковой', tnvedCode: null }, { description: 'Шины', tnvedCode: '4011100000' }] },
      extras: { goods: [{ hsGuess: '870323' }, { hsGuess: '401110' }] },
    } as never)
    expect(rows).toEqual([{ name: 'Автомобиль легковой', code: '870323' }])
  })

  it('maps auto-transit guesses by goods index', () => {
    const rows = hsGuessesFromAutoTransit({
      data: { goods: [{ description: 'Двигатель' }, { description: 'Погрузчик фронтальный колёсный LIUGONG CLG856H, масса 17 т' }] },
      hsGuesses: [{ index: 1, code: '842951' }],
    } as never)
    expect(rows).toEqual([{ name: 'Погрузчик фронтальный колёсный LIUGONG …', code: '842951' }])
    expect(hsGuessesFromAutoTransit({ data: {} } as never)).toEqual([])
  })

  it('builds one line, caps the list and says it is not filled in', () => {
    expect(hsGuessText([], t)).toBeNull()
    const one = hsGuessText([{ name: 'Автомобиль', code: '870323' }], t)!
    expect(one).toContain('«Автомобиль» — 8703 23')
    expect(one).toContain('В графу не подставлено')
    const many = hsGuessText(Array.from({ length: 12 }, () => ({ name: '', code: '870323' })), t)!
    expect(many).toContain('«товар 1» — 8703 23')
    expect(many).toContain('и ещё 2')
  })
})
