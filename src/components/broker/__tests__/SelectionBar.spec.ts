import { afterEach, describe, expect, it } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import SelectionBar from '../SelectionBar.vue'

let w: VueWrapper
afterEach(() => w?.unmount())

const mount = (count: number) => {
  w = mountWithI18n(SelectionBar, {
    props: { count },
    slots: { default: '<template #default="{ actionClass }"><button type="button" id="act" :class="actionClass">Назначить</button></template>' },
  })
  return w
}

describe('SelectionBar', () => {
  it('при 0 не рисуется', () => {
    mount(0)
    expect(w.find('[role="group"]').exists()).toBe(false)
    expect(w.text()).toBe('')
  })

  it('показывает «Выбрано: N», слот и «Снять выбор»', () => {
    mount(2)
    expect(w.text()).toContain('Выбрано: 2')
    expect(w.text()).toContain('Назначить')
    expect(w.find('#act').classes()).toContain('bg-white/10')
    expect(w.get('[role="group"]').classes()).toContain('bg-navy')
  })

  it('«Снять выбор» эмитит clear', async () => {
    mount(3)
    const btn = w.findAll('button').find((b) => b.text() === 'Снять выбор')!
    await btn.trigger('click')
    expect(w.emitted('clear')).toHaveLength(1)
  })
})
