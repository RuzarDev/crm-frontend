import { describe, expect, it } from 'vitest'
import { dtListActive, dtRowActions } from '../declarations'

describe('dtListActive — действия над списком ДТ только на шаге 3', () => {
  it('текущий шаг 3: декларирование и подана', () => {
    expect(dtListActive(2, 'current')).toBe(true)
    expect(dtListActive(3, 'current')).toBe(true)
  })

  it('(баг) после выпуска и в пройденном шаге — без добавления, выгрузки и удаления', () => {
    for (const s of [4, 5, 6, 7, 8]) expect(dtListActive(s, 'done')).toBe(false)
    expect(dtListActive(4, 'current')).toBe(false)
    expect(dtListActive(9, 'current')).toBe(false)
  })
})

describe('dtRowActions — «Заполнить»/XML в строке ДТ (решение владельца 09.10: правка после выпуска остаётся)', () => {
  it('на текущем шаге 3 — всегда (без права кнопки выключены с подсказкой)', () => {
    expect(dtRowActions(2, 'current', false)).toBe(true)
    expect(dtRowActions(3, 'current', false)).toBe(true)
  })

  it('после шага 3 — только тем, кто может править ДТ, в т.ч. Released/Done/Cancelled', () => {
    for (const s of [4, 5, 6, 7, 8, 9]) {
      expect(dtRowActions(s, 'done', true)).toBe(true)
      expect(dtRowActions(s, 'done', false)).toBe(false)
    }
  })

  it('до «Декларирования» строк ДТ с правкой нет', () => {
    expect(dtRowActions(1, 'done', true)).toBe(false)
  })
})
