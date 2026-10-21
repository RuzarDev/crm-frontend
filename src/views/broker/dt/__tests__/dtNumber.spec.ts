// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildFromParts, cleanTail, ddmmyyOf, digitsOfShortNumber, isKedenNumber, isStandardNumber, isoOfDdmmyy, lastTail, padTail, parseFullNumber, partsOf, tailOf } from '../dtNumber'
import { classifierLabel, dedupeOptions, withCurrent } from '../dtOptions'

describe('dtNumber — номер ДТ гр. А', () => {
  // как в SectionNumber: дата приходит как 'YYYY-MM-DD' и переводится в ДДММГГ
  const buildDtNumber = (post: string | null, iso: string | null, tail: string) => buildFromParts(post, ddmmyyOf(iso), tail)
  it('ддммгг из даты ISO, в том числе с меткой времени', () => {
    expect(ddmmyyOf('2026-10-09')).toBe('091026')
    expect(ddmmyyOf('2026-10-09T00:00:00Z')).toBe('091026')
    expect(ddmmyyOf(null)).toBeNull()
    expect(ddmmyyOf('09.10.2026')).toBeNull()
  })
  it('собирается «пост/ДДММГГ/7 цифр»; нет части или цифр не 7 — пусто', () => {
    expect(buildDtNumber('55302', '2026-10-09', '0001234')).toBe('55302/091026/0001234')
    expect(buildDtNumber('', '2026-10-09', '0001234')).toBe('')
    expect(buildDtNumber('55302', null, '0001234')).toBe('')
    expect(buildDtNumber('55302', '2026-10-09', '123456')).toBe('')
    expect(buildDtNumber(' 55302 ', '2026-10-09', '0001234')).toBe('55302/091026/0001234')
  })
  it('формат КЕДЕН: ровно 5 цифр поста, ДДММГГ, 7 цифр', () => {
    expect(isKedenNumber('55403/201026/0026650')).toBe(true)
    expect(isKedenNumber(' 55403/201026/0026650 ')).toBe(true)
    expect(isKedenNumber('25831')).toBe(false)
    expect(isKedenNumber('554031/201026/0026650')).toBe(false)
    expect(isKedenNumber('55403/201026/26650')).toBe(false)
    expect(isKedenNumber('')).toBe(false)
    expect(isKedenNumber(null)).toBe(false)
  })
  it('хвост дополняется нулями слева; цифры короткого номера', () => {
    expect(padTail('25831')).toBe('0025831')
    expect(padTail('0026650')).toBe('0026650')
    expect(padTail('')).toBe('')
    expect(padTail('12345678')).toBe('')
    expect(padTail('12a')).toBe('')
    expect(digitsOfShortNumber('25831')).toBe('25831')
    expect(digitsOfShortNumber(' 25831 ')).toBe('25831')
    expect(digitsOfShortNumber('55403/201026/25831')).toBe('25831')
    expect(digitsOfShortNumber('KEDEN/77')).toBe('')
    expect(digitsOfShortNumber('12345678')).toBe('')
  })
  it('разбор: хвост только у стандартного номера', () => {
    expect(isStandardNumber('55302/091026/0001234')).toBe(true)
    expect(isStandardNumber('KZ/1234')).toBe(false)
    expect(isStandardNumber('')).toBe(false)
    expect(tailOf('55302/091026/0001234')).toBe('0001234')
    expect(tailOf('КЕДЕН-123')).toBe('')
  })
  it('части стандартного номера и дата из ДДММГГ', () => {
    expect(partsOf('55302/091026/0001234')).toEqual({ post: '55302', d6: '091026', tail: '0001234' })
    expect(partsOf('KEDEN/1')).toBeNull()
    expect(isoOfDdmmyy('091026')).toBe('2026-10-09')
    expect(isoOfDdmmyy('321326')).toBeNull()
    expect(buildFromParts('55302', '091026', '0001234')).toBe('55302/091026/0001234')
    expect(buildFromParts('55302', null, '0001234')).toBe('')
  })
  it('полный номер во вставленном тексте: с разделителями и одними цифрами', () => {
    const want = { post: '55302', d6: '091026', tail: '0001234' }
    expect(parseFullNumber('55302/091026/0001234')).toEqual(want)
    expect(parseFullNumber(' 55302 / 091026 / 0001234 ')).toEqual(want)
    expect(parseFullNumber('553020910260001234')).toEqual(want)
    expect(parseFullNumber('0001234')).toBeNull()
    expect(parseFullNumber('55302/991326/0001234')).toBeNull()
    expect(parseFullNumber('99999999999999')).toBeNull()
    expect(lastTail('12-345 67890')).toBe('4567890'.slice(0, 7))
  })
  it('цифры хвоста: без нецифр и не больше 7', () => {
    expect(cleanTail('00a1-23 4567890')).toBe('0012345')
  })
})

describe('dtOptions — выбор из классификатора', () => {
  it('подпись без повтора кода', () => {
    expect(classifierLabel('ИМ', 'ИМ — импорт (ввоз)')).toBe('ИМ — импорт (ввоз)')
    expect(classifierLabel('40', 'Выпуск для внутреннего потребления')).toBe('40 — Выпуск для внутреннего потребления')
    expect(dedupeOptions([{ value: 'ИМ', label: 'ИМ — ИМ — импорт (ввоз)' }])[0].label).toBe('ИМ — импорт (ввоз)')
    expect(dedupeOptions([{ value: '40', label: '40 — Выпуск' }])[0].label).toBe('40 — Выпуск')
  })
  it('значение вне списка добавляется и помечается; список не загружен — без пометки', () => {
    const list = [{ value: '40', label: '40 — Выпуск' }]
    expect(withCurrent(list, '40')).toEqual({ options: list, unknown: false })
    expect(withCurrent(list, '99')).toEqual({ options: [{ value: '99', label: '99' }, ...list], unknown: true })
    expect(withCurrent([], '99')).toEqual({ options: [{ value: '99', label: '99' }], unknown: false })
    expect(withCurrent(list, '')).toEqual({ options: list, unknown: false })
    expect(withCurrent(list, null)).toEqual({ options: list, unknown: false })
  })
})
