import { describe, expect, it } from 'vitest'
import { dtEditable } from '../declarations'

describe('dtEditable — ДТ правятся только на шаге 3', () => {
  it('текущий шаг 3: декларирование и подана', () => {
    expect(dtEditable(2, 'current')).toBe(true)
    expect(dtEditable(3, 'current')).toBe(true)
  })

  it('(баг) после выпуска и в пройденном шаге — только просмотр', () => {
    for (const s of [4, 5, 6, 7, 8]) expect(dtEditable(s, 'done')).toBe(false)
    expect(dtEditable(4, 'current')).toBe(false)
    expect(dtEditable(9, 'current')).toBe(false)
  })
})
