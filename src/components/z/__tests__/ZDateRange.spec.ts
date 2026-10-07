import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountInField } from '@/test/fieldContext'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZDateRange from '../ZDateRange.vue'

let w: VueWrapper
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

type Pair = [string | null, string | null]
// Как v-model родителя: update:value обновляет props.
const mount = (value: Pair, props: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}) => {
  w = mountWithI18n(ZDateRange, {
    props: { value, 'onUpdate:value': (v: Pair) => w.setProps({ value: v }), ...props },
    attrs,
    attachTo: document.body,
  })
  return w
}
const inputs = () => w.findAll('input').map((i) => i.element as HTMLInputElement)
const typeIn = async (i: number, value: string) => {
  const el = inputs()[i]
  el.focus()
  el.value = value
  el.setSelectionRange(value.length, value.length)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}
const leave = async () => {
  const other = document.createElement('button')
  document.body.appendChild(other)
  other.focus()
  await nextTick()
  await nextTick()
}
const commitEnter = async (i: number) => {
  inputs()[i].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await nextTick()
  await nextTick()
}

describe('ZDateRange', () => {
  it('показывает пару как ДД.ММ.ГГГГ, подсказки по умолчанию и свои', () => {
    mount(['2026-09-01', '2026-09-30'])
    expect(inputs().map((i) => i.value)).toEqual(['01.09.2026', '30.09.2026'])
    w.unmount()
    mount([null, null], { placeholder: ['С даты', 'По дату'] })
    expect(inputs().map((i) => i.placeholder)).toEqual(['С даты', 'По дату'])
    w.unmount()
    mount([null, null])
    expect(inputs().map((i) => i.placeholder)).toEqual(['ДД.ММ.ГГГГ', 'ДД.ММ.ГГГГ'])
  })

  it('ввод пары — на каждый конец один update:value и один change', async () => {
    mount([null, null])
    await typeIn(0, '01092026')
    await commitEnter(0)
    expect(w.emitted('change')).toEqual([[['2026-09-01', null]]])
    await typeIn(1, '30092026')
    await leave()
    expect(w.emitted('change')).toEqual([[['2026-09-01', null]], [['2026-09-01', '2026-09-30']]])
    expect(w.emitted('update:value')).toEqual([[['2026-09-01', null]], [['2026-09-01', '2026-09-30']]])
    expect(inputs().map((i) => i.value)).toEqual(['01.09.2026', '30.09.2026'])
  })

  it('без правки — событий нет', async () => {
    mount(['2026-09-01', '2026-09-30'])
    inputs()[0].focus()
    await leave()
    expect(w.emitted('change')).toBeUndefined()
  })

  it('«по» раньше «с» — пара меняется местами при фиксации, один change', async () => {
    mount(['2026-09-10', '2026-09-20'])
    await typeIn(1, '01092026')
    await commitEnter(1)
    expect(w.emitted('change')).toEqual([[['2026-09-01', '2026-09-10']]])
    expect(inputs().map((i) => i.value)).toEqual(['01.09.2026', '10.09.2026'])
  })

  it('«с» позже «по» — тоже меняется местами, поля показывают итог даже при равных исходных концах', async () => {
    mount(['2026-09-10', '2026-09-10'])
    await typeIn(0, '25092026')
    await commitEnter(0)
    await nextTick()
    await nextTick()
    expect(w.emitted('change')).toEqual([[['2026-09-10', '2026-09-25']]])
    expect(inputs().map((i) => i.value)).toEqual(['10.09.2026', '25.09.2026'])
  })

  it('пустой другой конец — без перестановки', async () => {
    mount([null, '2026-09-10'])
    await typeIn(0, '01092026')
    await commitEnter(0)
    expect(w.emitted('change')).toEqual([[['2026-09-01', '2026-09-10']]])
  })

  it('очистка одной даты — [null, to] / [from, null]', async () => {
    mount(['2026-09-01', '2026-09-30'])
    await typeIn(0, '')
    await commitEnter(0)
    expect(w.emitted('change')).toEqual([[[null, '2026-09-30']]])
    await typeIn(1, '')
    await commitEnter(1)
    expect(w.emitted('change')?.[1]).toEqual([[null, null]])
  })

  it('allow-clear: у каждого конца своя кнопка очистки', async () => {
    mount(['2026-09-01', '2026-09-30'], { allowClear: true })
    const clears = w.findAll('button[aria-label="Очистить"]')
    expect(clears).toHaveLength(2)
    await clears[1].trigger('click')
    expect(w.emitted('change')).toEqual([[['2026-09-01', null]]])
  })

  it('disabled — поля и кнопки календаря отключены', () => {
    mount(['2026-09-01', '2026-09-30'], { disabled: true })
    expect(inputs().every((i) => i.disabled)).toBe(true)
    expect(w.findAll('button').every((b) => b.attributes('disabled') !== undefined)).toBe(true)
  })

  it('группа и подписи полей: С / По', () => {
    mount([null, null], {}, { 'aria-label': 'Период' })
    const group = w.get('[role="group"]')
    expect(group.attributes('aria-label')).toBe('Период')
    expect(inputs().map((i) => i.getAttribute('aria-label'))).toEqual(['С', 'По'])
    expect(w.get('[aria-hidden="true"]').text()).toBe('—')
  })

  it('class и style — на корень группы', () => {
    mount([null, null], {}, { class: 'mine', style: 'width: 300px' })
    const group = w.get('[role="group"]')
    expect(group.classes()).toContain('mine')
    expect(group.attributes('style')).toContain('300px')
  })

  it('min/max пробрасываются: дата вне границ на уходе откатывается', async () => {
    mount(['2026-09-10', null], { min: '2026-09-05', max: '2026-09-30' })
    await typeIn(0, '01092026')
    await leave()
    expect(w.emitted('change')).toBeUndefined()
    expect(inputs()[0].value).toBe('10.09.2026')
  })

  it('expose focus() — фокус в поле «с»', () => {
    mount([null, null])
    ;(w.vm as unknown as { focus: () => void }).focus()
    expect(document.activeElement).toBe(inputs()[0])
  })

  it('внутри ZField: подпись — на «с», описание/ошибка — на оба, change/blur полю', async () => {
    const r = mountInField(ZDateRange, { value: [null, null] })
    w = r.w
    const [from, to] = inputs()
    expect(from.id).toBe('f-1')
    expect(to.id).not.toBe('f-1')
    // Поле занимает сама группа (первой), вложенные ZDate — следом и без связи.
    expect(r.claimed[0].value()).toEqual([null, null])
    for (const el of [from, to]) {
      expect(el.getAttribute('aria-describedby')).toBe('f-1-msg')
      expect(el.getAttribute('aria-invalid')).toBe('true')
    }
    await typeIn(1, '30092026')
    await leave()
    expect(r.ctx.onChange).toHaveBeenCalledTimes(1)
    expect(r.ctx.onBlur).toHaveBeenCalledTimes(1)
    r.claimed[0].focus()
    expect(document.activeElement).toBe(from)
  })

  it('внутри ZField: уход с «с» на «по» — blur полю не шлётся', async () => {
    const r = mountInField(ZDateRange, { value: [null, null] })
    w = r.w
    inputs()[0].focus()
    inputs()[1].focus()
    await nextTick()
    await nextTick()
    expect(r.ctx.onBlur).not.toHaveBeenCalled()
  })
})
