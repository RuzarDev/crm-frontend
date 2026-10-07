import { describe, expect, it } from 'vitest'
import { avatarTone, initials } from '../initials'

describe('initials', () => {
  it.each([
    ['ТОО «Казахмыс Трейд»', 'КТ'],
    ['ИП Сейткали А.', 'СА'],
    ['ТОО "Altyn Med"', 'AM'],
    ['QazLogistic', 'QA'],
    ['АО «Ақжол»', 'АҚ'],
    ['  ', '?'],
  ])('%s → %s', (name, expected) => {
    expect(initials(name)).toBe(expected)
  })
})

describe('avatarTone', () => {
  it('детерминирован и из допустимых тонов', () => {
    const a = avatarTone('ТОО «Astana Foods»')
    expect(avatarTone('ТОО «Astana Foods»')).toBe(a)
    expect(['neutral', 'info', 'wait', 'submitted', 'done', 'pay']).toContain(a)
  })
})
