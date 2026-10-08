import { afterEach, describe, expect, it } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import StatStrip from '../StatStrip.vue'

let w: VueWrapper
afterEach(() => w?.unmount())

const items = [
  { key: 'a', label: 'Выставлено', value: '12', hint: '4 312 400 ₸' },
  { key: 'b', label: 'Ждут оплаты', value: '3', tone: 'gold' as const },
  { key: 'c', label: 'Оплачено', value: '9', tone: 'done' as const },
  { key: 'd', label: 'Просрочено', value: '1', tone: 'danger' as const },
]

describe('StatStrip', () => {
  it('рисует ячейки со значением, подписью и подсказкой', () => {
    w = mountWithI18n(StatStrip, { props: { items } })
    const cells = w.findAll('[data-stat-cell]')
    expect(cells).toHaveLength(4)
    expect(cells[0].text()).toContain('Выставлено')
    expect(cells[0].text()).toContain('12')
    expect(cells[0].text()).toContain('4 312 400 ₸')
    expect(cells[0].find('.tabular-nums').text()).toBe('12')
  })

  it('точки по тонам; без tone точки нет', () => {
    w = mountWithI18n(StatStrip, { props: { items } })
    const cells = w.findAll('[data-stat-cell]')
    expect(cells[0].find('[data-stat-dot]').exists()).toBe(false)
    expect(cells[1].get('[data-stat-dot]').classes()).toContain('bg-gold')
    expect(cells[2].get('[data-stat-dot]').classes()).toContain('bg-tone-done-fg')
    expect(cells[3].get('[data-stat-dot]').classes()).toContain('bg-danger')
  })

  it('цвет подсказки: рост — зелёный, падение — красный, без hintTone — приглушённый', () => {
    w = mountWithI18n(StatStrip, {
      props: { items: [
        { key: 'a', label: 'A', value: '1', hint: '+14%', hintTone: 'up' as const },
        { key: 'b', label: 'B', value: '2', hint: '-5%', hintTone: 'down' as const },
        { key: 'c', label: 'C', value: '3', hint: 'без изменений' },
      ] },
    })
    const hints = w.findAll('[data-stat-hint]')
    expect(hints[0].classes()).toContain('text-tone-done-fg')
    expect(hints[1].classes()).toContain('text-tone-danger-fg')
    expect(hints[2].classes()).toContain('text-muted')
    expect(hints[2].classes()).not.toContain('text-tone-done-fg')
  })

  it('loading: скелетоны вместо значений и подсказок', () => {
    w = mountWithI18n(StatStrip, { props: { items, loading: true } })
    expect(w.findAll('[data-z-line]')).toHaveLength(4)
    expect(w.find('.tabular-nums').exists()).toBe(false)
    expect(w.text()).not.toContain('4 312 400')
    expect(w.text()).toContain('Выставлено')
  })

  it('разделители: слева у всех кроме первой, на телефоне сверху со второй строки', () => {
    w = mountWithI18n(StatStrip, { props: { items } })
    const cells = w.findAll('[data-stat-cell]')
    expect(cells[0].classes()).not.toContain('sm:border-l')
    expect(cells[1].classes()).toContain('sm:border-l')
    expect(cells[1].classes()).not.toContain('max-sm:border-t')
    expect(cells[2].classes()).toContain('max-sm:border-t')
  })
})
