import { describe, expect, it } from 'vitest'
import { splitDescription } from '../editor/descriptionParts'

// То же правило и те же примеры, что KedenReview1014FixesTests (сервер, SplitDescription): КЕДЕН склеивает части
// запятой без пробела.
const kedenJoin = (parts: string[]) => parts.join(',')
const clean = (parts: string[]) => {
  for (const p of parts) {
    expect(p.length).toBeGreaterThan(0)
    expect(p.length).toBeLessThanOrEqual(250)
    expect(p).toBe(p.trim())
  }
}

describe('splitDescription — части описания гр.31 как на сервере', () => {
  it('делит по последней запятой в пределах 250, запятую КЕДЕН вернёт', () => {
    const text = Array.from({ length: 40 }, (_, i) => `ТОВАР ${String(i + 1).padStart(2, '0')} ДЛЯ ДОМА`).join(', ')
    const parts = splitDescription(text)
    clean(parts)
    expect(kedenJoin(parts).replaceAll(', ', ',')).toBe(text.replaceAll(', ', ','))
    for (const p of parts.slice(0, -1)) expect(p.endsWith('ДЛЯ ДОМА')).toBe(true)

    const head = 'А'.repeat(120) + ' ' + 'Б'.repeat(79)
    const tail = Array(30).fill('ВВВВ').join(' ')
    expect(splitDescription(head + ', ' + tail)).toEqual([head, tail])
  })

  it('без запятых — по последнему пробелу, пробел отбрасывается', () => {
    const words = Array.from({ length: 70 }, (_, i) => `ДЕТАЛЬ${String(i).padStart(2, '0')}`).join(' ')
    const parts = splitDescription(words)
    clean(parts)
    expect(parts.length).toBe(3)
    expect(parts.join(' ')).toBe(words)
    expect(parts[0].length).toBe(242)
    expect(splitDescription('Д'.repeat(200) + '\n' + 'Е'.repeat(100))).toEqual(['Д'.repeat(200), 'Е'.repeat(100)])
  })

  it('посреди слова — только слово длиннее 250; пустых частей нет', () => {
    expect(splitDescription('Х'.repeat(300) + ' ХВОСТ, КОНЕЦ')).toEqual(['Х'.repeat(250), 'Х'.repeat(50) + ' ХВОСТ, КОНЕЦ'])
    expect(splitDescription('  А  ')).toEqual(['А'])
    expect(splitDescription(' \t ')).toEqual([])
    expect(splitDescription(null)).toEqual([])
    expect(splitDescription('Ж'.repeat(250) + ' ,   ' + 'З'.repeat(10))).toEqual(['Ж'.repeat(250), 'З'.repeat(10)])
  })

  it('частей бывает больше, чем n / 250', () => {
    const words = Array.from({ length: 55 }, (_, i) => `ДЕТАЛЬ${String(i).padStart(2, '0')}`).join(' ') // 494 знака
    expect(Math.ceil(words.length / 250)).toBe(2)
    expect(splitDescription(words).length).toBe(3)
    const five = Array.from({ length: 5 }, (_, i) => String.fromCharCode(0x410 + i).repeat(180)).join(', ') // 908
    expect(splitDescription(five).length).toBe(5)
  })
})
