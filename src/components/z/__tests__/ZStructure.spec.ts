import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZTabs from '../ZTabs.vue'
import ZCollapse from '../ZCollapse.vue'
import ZCollapseItem from '../ZCollapseItem.vue'
import ZAlert from '../ZAlert.vue'
import ZSpin from '../ZSpin.vue'

let w: VueWrapper
afterEach(() => w?.unmount())

const items = [
  { key: 'all', label: 'Все', count: 38 },
  { key: 'mine', label: 'Мои задачи', count: 9 },
  { key: 'off', label: 'Архив', disabled: true },
]

describe('ZTabs', () => {
  it('вкладки со счётчиком, смена активной', async () => {
    w = mountWithI18n(ZTabs, { props: { activeKey: 'all', items: items.slice(0, 2) } })
    const tabs = w.findAll('[role="tab"]')
    expect(tabs.map((t) => t.text())).toEqual(['Все38', 'Мои задачи9'])
    expect(tabs[0].attributes('aria-selected')).toBe('true')
    await tabs[1].trigger('mousedown')
    await tabs[1].trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:activeKey')?.at(-1)).toEqual(['mine'])
  })

  it('change и update — по одному разу на реальную смену', async () => {
    w = mountWithI18n({
      components: { ZTabs },
      data: () => ({ key: 'all', changes: [] as string[], items }),
      template: '<ZTabs v-model:active-key="key" :items="items" @change="changes.push($event)" />',
    })
    const tabs = w.findAll('[role="tab"]')
    await tabs[1].trigger('mousedown')
    await tabs[1].trigger('keydown', { key: 'Enter' })
    await nextTick()
    const vm = w.vm as unknown as { key: string; changes: string[] }
    expect(vm.key).toBe('mine')
    expect(vm.changes).toEqual(['mine'])
  })

  it('клик по уже активной вкладке ничего не шлёт', async () => {
    w = mountWithI18n(ZTabs, { props: { activeKey: 'all', items } })
    await w.findAll('[role="tab"]')[0].trigger('mousedown')
    expect(w.emitted('change')).toBeUndefined()
  })

  it('выключенная вкладка не выбирается', async () => {
    w = mountWithI18n(ZTabs, { props: { activeKey: 'all', items } })
    const off = w.findAll('[role="tab"]')[2]
    expect(off.attributes('disabled')).toBeDefined()
    await off.trigger('mousedown')
    expect(w.emitted('change')).toBeUndefined()
  })

  it('стрелка вправо переводит на следующую вкладку (автоактивация)', async () => {
    w = mountWithI18n(ZTabs, { props: { activeKey: 'all', items }, attachTo: document.body })
    await nextTick()
    const tabs = w.findAll('[role="tab"]')
    ;(tabs[0].element as HTMLElement).focus()
    await tabs[0].trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(w.emitted('change')?.at(-1)).toEqual(['mine'])
  })

  it('активная вкладка выделена по data-state', () => {
    w = mountWithI18n(ZTabs, { props: { activeKey: 'mine', items } })
    const tabs = w.findAll('[role="tab"]')
    expect(tabs[1].attributes('data-state')).toBe('active')
    expect(tabs[1].classes().join(' ')).toContain('data-[state=active]:font-semibold')
    expect(tabs[0].attributes('data-state')).toBe('inactive')
  })
})

describe('ZCollapse', () => {
  const mountCollapse = () => mountWithI18n({
    components: { ZCollapse, ZCollapseItem },
    data: () => ({ open: [] as string[], extraClicks: 0 }),
    template: `<ZCollapse v-model:active-key="open">
      <ZCollapseItem value="a" header="Гр.31 — описание"><template #extra><span class="x" @click="extraClicks++">Ещё</span></template>Текст</ZCollapseItem>
      <ZCollapseItem value="b" header="Гр.33">Второй</ZCollapseItem>
    </ZCollapse>`,
  }, { attachTo: document.body })

  it('раскрывает пункт и отдаёт ключи', async () => {
    w = mountCollapse()
    const trigger = w.get('button')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await trigger.trigger('click')
    await nextTick()
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect((w.vm as unknown as { open: string[] }).open).toEqual(['a'])
  })

  it('можно открыть несколько пунктов', async () => {
    w = mountCollapse()
    const [a, b] = w.findAll('button')
    await a.trigger('click')
    await b.trigger('click')
    await nextTick()
    expect((w.vm as unknown as { open: string[] }).open).toEqual(['a', 'b'])
  })

  it('клик по extra не переключает пункт', async () => {
    w = mountCollapse()
    await w.get('.x').trigger('click')
    await nextTick()
    const vm = w.vm as unknown as { open: string[]; extraClicks: number }
    expect(vm.extraClicks).toBe(1)
    expect(vm.open).toEqual([])
    expect(w.get('button').attributes('aria-expanded')).toBe('false')
  })

  it('внешнее значение раскрывает пункт', async () => {
    w = mountCollapse()
    ;(w.vm as unknown as { open: string[] }).open = ['b']
    await flushPromises()
    expect(w.findAll('button')[1].attributes('aria-expanded')).toBe('true')
    expect(w.text()).toContain('Второй')
  })
})

describe('ZAlert', () => {
  it('error — role=alert, текст и описание', () => {
    w = mountWithI18n(ZAlert, { props: { type: 'error', message: 'Не сохранено', description: 'Нет связи с сервером' } })
    expect(w.attributes('role')).toBe('alert')
    expect(w.text()).toContain('Не сохранено')
    expect(w.text()).toContain('Нет связи с сервером')
    expect(w.classes()).toContain('bg-tone-danger-bg')
  })

  it('info — role=status', () => {
    w = mountWithI18n(ZAlert, { props: { type: 'info', message: 'Курсы на 28.09' } })
    expect(w.attributes('role')).toBe('status')
  })

  it('warning — role=alert, золотой тон', () => {
    w = mountWithI18n(ZAlert, { props: { type: 'warning', message: 'Внимание' } })
    expect(w.attributes('role')).toBe('alert')
    expect(w.classes()).toContain('bg-gold-soft')
    expect(w.classes()).toContain('border-gold-line')
  })

  it('иконка только при showIcon', () => {
    w = mountWithI18n(ZAlert, { props: { type: 'success', message: 'Готово' } })
    expect(w.find('svg').exists()).toBe(false)
    w.unmount()
    w = mountWithI18n(ZAlert, { props: { type: 'success', message: 'Готово', showIcon: true } })
    expect(w.find('svg').exists()).toBe(true)
  })

  it('слоты default и action', () => {
    w = mountWithI18n(ZAlert, {
      props: { message: 'Заголовок' },
      slots: { default: '<i class="d">Тело</i>', action: '<button class="act">Повторить</button>' },
    })
    expect(w.get('.d').text()).toBe('Тело')
    expect(w.get('.act').exists()).toBe(true)
  })

  it('closable — кнопка с z.close, шлёт close и прячет плашку', async () => {
    w = mountWithI18n(ZAlert, { props: { message: 'Закрой меня', closable: true } })
    const btn = w.get('button')
    expect(btn.attributes('aria-label')).toBe('Закрыть')
    await btn.trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    expect(w.find('[role="status"]').exists()).toBe(false)
    expect(w.text()).not.toContain('Закрой меня')
  })

  it('без closable кнопки закрытия нет', () => {
    w = mountWithI18n(ZAlert, { props: { message: 'Просто' } })
    expect(w.find('button').exists()).toBe(false)
  })
})

describe('ZSpin', () => {
  it('spinning — aria-busy и приглушённое содержимое', () => {
    w = mountWithI18n(ZSpin, { props: { spinning: true }, slots: { default: '<div class="c">Таблица</div>' } })
    expect(w.attributes('aria-busy')).toBe('true')
    expect(w.get('.c').element.parentElement?.className).toContain('opacity-50')
  })

  it('не spinning — содержимое как есть, без индикатора', () => {
    w = mountWithI18n(ZSpin, { props: { spinning: false }, slots: { default: '<div class="c">Таблица</div>' } })
    expect(w.attributes('aria-busy')).toBeUndefined()
    expect(w.get('.c').element.parentElement?.className).not.toContain('opacity-50')
    expect(w.find('[data-z-spin]').exists()).toBe(false)
    expect(w.find('[role="status"]').exists()).toBe(false)
  })

  it('содержимое остаётся смонтированным и недоступно для кликов', () => {
    w = mountWithI18n(ZSpin, { props: { spinning: true }, slots: { default: '<div class="c">Таблица</div>' } })
    expect(w.find('.c').exists()).toBe(true)
    expect(w.get('.c').element.parentElement?.className).toContain('pointer-events-none')
    expect(w.find('[data-z-spin]').exists()).toBe(true)
  })

  it('без tip — sr-only «Загрузка…», с tip — подпись', () => {
    w = mountWithI18n(ZSpin, { props: { spinning: true } })
    expect(w.get('.sr-only').text()).toBe('Загрузка…')
    w.unmount()
    w = mountWithI18n(ZSpin, { props: { spinning: true, tip: 'Считаем платежи' } })
    expect(w.text()).toContain('Считаем платежи')
    expect(w.find('.sr-only').exists()).toBe(false)
  })

  it('без слота и без spinning — пусто', () => {
    w = mountWithI18n(ZSpin, { props: { spinning: false } })
    expect(w.find('[data-z-spin]').exists()).toBe(false)
  })
})
