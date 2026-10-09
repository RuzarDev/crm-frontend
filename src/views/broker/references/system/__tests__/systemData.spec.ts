import { describe, expect, it } from 'vitest'
import { formatCount, formatDateTime, formatDay, formatDayMonth, scrollItemIntoBox } from '../systemData'

describe('даты и числа «Данных системы»: день перед месяцем во всех языках', () => {
  const iso = '2026-10-06T14:20:00Z'
  const d = new Date(iso)
  const localDay = String(d.getDate()).padStart(2, '0')
  const localMonth = String(d.getMonth() + 1).padStart(2, '0')

  it('en — не en-US: 06/10, а не 10/06; 24-часовое время', () => {
    const text = formatDateTime(iso, 'en')
    expect(text.startsWith(`${localDay}/${localMonth}/2026`)).toBe(true)
    expect(text).not.toMatch(/AM|PM/i)
    expect(formatDayMonth(iso, 'en')).toBe(`${localDay}/${localMonth}`)
  })

  it('день без времени и числа по языку', () => {
    expect(formatDay('2028-08-26', 'en')).toBe('26/08/2028')
    expect(formatDay('2028-08-26', 'ru')).toBe('26.08.2028')
    expect(formatDay(null, 'en')).toBe('—')
    expect(formatCount(1482, 'ru').replace(/\s/g, ' ')).toBe('1 482')
  })
})

describe('scrollItemIntoBox', () => {
  const rect = (o: Partial<DOMRect>) => ({ top: 0, bottom: 0, left: 0, right: 0, ...o }) as DOMRect
  const make = (box: Partial<HTMLElement> & { r: Partial<DOMRect> }, el: Partial<DOMRect>) => {
    const b = { scrollTop: 0, scrollLeft: 0, scrollHeight: 100, clientHeight: 100, scrollWidth: 100, clientWidth: 100, getBoundingClientRect: () => rect(box.r), ...box } as unknown as HTMLElement
    const e = { getBoundingClientRect: () => rect(el) } as unknown as HTMLElement
    return { b, e }
  }

  it('пункт ниже видимой области колонки — колонка прокручивается вниз', () => {
    const { b, e } = make({ r: { top: 0, bottom: 200 }, scrollHeight: 600, clientHeight: 200 }, { top: 500, bottom: 532 })
    scrollItemIntoBox(b, e)
    expect(b.scrollTop).toBe(340)
  })

  it('пункт правее ленты — лента прокручивается вправо; уже видимый — ничего не двигает', () => {
    const { b, e } = make({ r: { left: 0, right: 300 }, scrollWidth: 900, clientWidth: 300 }, { left: 700, right: 800 })
    scrollItemIntoBox(b, e)
    expect(b.scrollLeft).toBe(508)
    const v = make({ r: { top: 0, bottom: 200, left: 0, right: 300 }, scrollHeight: 600, clientHeight: 200, scrollWidth: 900, clientWidth: 300 }, { top: 40, bottom: 72, left: 10, right: 90 })
    scrollItemIntoBox(v.b, v.e)
    expect([v.b.scrollTop, v.b.scrollLeft]).toEqual([0, 0])
  })

  it('нет блока или пункта — без ошибки', () => {
    expect(() => scrollItemIntoBox(null, null)).not.toThrow()
  })
})
