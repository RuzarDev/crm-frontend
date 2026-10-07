import { describe, expect, it } from 'vitest'
import { greetingKey, greetingName } from '../greeting'

describe('greetingKey', () => {
  it.each([
    [0, 'night'], [4, 'night'], [5, 'morning'], [11, 'morning'], [12, 'day'], [17, 'day'],
    [18, 'evening'], [22, 'evening'], [23, 'night'],
  ] as const)('%i ч → %s', (hour, part) => {
    expect(greetingKey(hour)).toBe(part)
  })
})

describe('greetingName', () => {
  it('первое слово имени', () => expect(greetingName('  Айгерим   Касымова ')).toBe('Айгерим'))
  it('пусто и null — пустая строка', () => {
    expect(greetingName(null)).toBe('')
    expect(greetingName('   ')).toBe('')
  })
})
