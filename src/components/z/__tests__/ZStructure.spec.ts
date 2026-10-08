import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
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
    expect(tabs.map((t) => t.text())).toEqual(['Все 38', 'Мои задачи 9'])
    expect(tabs[0].attributes('aria-selected')).toBe('true')
    await tabs[1].trigger('mousedown')
    await tabs[1].trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:activeKey')?.at(-1)).toEqual(['mine'])
  })

  it('variant="line": активная вкладка — акцентным цветом, по умолчанию — чернилами', () => {
    w = mountWithI18n(ZTabs, { props: { activeKey: 'all', items: items.slice(0, 2), variant: 'line' } })
    expect(w.get('[role="tab"]').classes()).toContain('data-[state=active]:text-zircon-ink')
    expect(w.get('[role="tab"]').classes()).not.toContain('data-[state=active]:text-ink')
    w.unmount()
    w = mountWithI18n(ZTabs, { props: { activeKey: 'all', items: items.slice(0, 2) } })
    expect(w.get('[role="tab"]').classes()).toContain('data-[state=active]:text-ink')
    expect(w.get('[role="tab"]').classes()).not.toContain('data-[state=active]:text-zircon-ink')
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

  it('без слота панелей — у вкладок нет висячего aria-controls', () => {
    w = mountWithI18n(ZTabs, { props: { activeKey: 'all', items } })
    const tabs = w.findAll('[role="tab"]')
    expect(tabs).toHaveLength(3)
    for (const t of tabs) expect(t.element.hasAttribute('aria-controls')).toBe(false)
    expect(w.find('[role="tabpanel"]').exists()).toBe(false)
  })

  it('слот #default="{ key }" — панель активной вкладки в tabpanel, связи aria-controls/aria-labelledby', async () => {
    w = mountWithI18n(ZTabs, {
      props: { activeKey: 'all', items },
      slots: { default: (p: { key: string }) => h('p', `Панель ${p.key}`) },
    })
    await nextTick() // панели регистрируются в Reka на монтировании — aria-controls появляется следующим рендером
    const tabs = w.findAll('[role="tab"]')
    expect(tabs.every((t) => !!t.attributes('aria-controls'))).toBe(true)
    for (const t of tabs) {
      const panel = w.element.querySelector(`[id="${t.attributes('aria-controls')}"]`)
      expect(panel?.getAttribute('role')).toBe('tabpanel')
      expect(panel?.getAttribute('aria-labelledby')).toBe(t.attributes('id'))
    }
    const visible = () => w.findAll('[role="tabpanel"]').filter((p) => !p.element.hasAttribute('hidden'))
    expect(visible()).toHaveLength(1)
    expect(visible()[0].text()).toBe('Панель all')
    await w.setProps({ activeKey: 'mine' })
    await flushPromises() // Presence снимает уходящую панель после проверки анимации
    expect(visible()).toHaveLength(1)
    expect(visible()[0].text()).toBe('Панель mine')
    expect(w.text()).not.toContain('Панель all')
  })

  describe('прокрутка полосы', () => {
    const far = [
      { key: 'a', label: 'Все' }, { key: 'b', label: 'Мои' }, { key: 'c', label: 'Оплата' }, { key: 'd', label: 'Архив' },
    ]
    const restore: Array<() => void> = []
    // jsdom не считает раскладку: вкладка i — offsetLeft i*100, ширина 100, ширина полосы 150.
    const stub = (proto: object, prop: string, get: (el: HTMLElement) => number) => {
      const old = Object.getOwnPropertyDescriptor(proto, prop)
      Object.defineProperty(proto, prop, { configurable: true, get(this: HTMLElement) { return get(this) } })
      restore.push(() => (old ? Object.defineProperty(proto, prop, old) : delete (proto as Record<string, unknown>)[prop]))
    }
    const stubLayout = () => {
      stub(HTMLElement.prototype, 'offsetLeft', (el) => (el.getAttribute('role') === 'tab' ? [...(el.parentElement?.children ?? [])].indexOf(el) * 100 : 0))
      stub(HTMLElement.prototype, 'offsetWidth', (el) => (el.getAttribute('role') === 'tab' ? 100 : 0))
      stub(Element.prototype, 'clientWidth', (el) => (el.getAttribute('role') === 'tablist' ? 150 : 0))
    }
    afterEach(() => { while (restore.length) restore.pop()!() })

    it('полоса не раздвигает контейнер и прокручивается', () => {
      w = mountWithI18n(ZTabs, { props: { activeKey: 'all', items } })
      const strip = w.get('[role="tablist"]')
      for (const c of ['min-w-0', 'max-w-full', 'overflow-x-auto', 'px-1']) expect(strip.classes()).toContain(c)
    })

    it('смена активной на дальнюю вкладку прокручивает только полосу', async () => {
      stubLayout()
      const into = vi.spyOn(Element.prototype, 'scrollIntoView' as never).mockImplementation(() => {})
      const to = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      w = mountWithI18n(ZTabs, { props: { activeKey: 'a', items: far }, attachTo: document.body })
      await nextTick()
      const strip = w.get('[role="tablist"]').element as HTMLElement
      expect(strip.scrollLeft).toBe(0)
      await w.setProps({ activeKey: 'd' })
      await nextTick()
      await nextTick()
      // правый край вкладки d = 400 + 4 отступа; видимая ширина 150 → scrollLeft 254
      expect(strip.scrollLeft).toBe(254)
      await w.setProps({ activeKey: 'a' })
      await nextTick()
      await nextTick()
      expect(strip.scrollLeft).toBe(0)
      expect(into).not.toHaveBeenCalled()
      expect(to).not.toHaveBeenCalled()
      into.mockRestore()
      to.mockRestore()
    })

    it('дальняя активная вкладка показывается сразу при монтировании', async () => {
      stubLayout()
      w = mountWithI18n(ZTabs, { props: { activeKey: 'c', items: far }, attachTo: document.body })
      await nextTick()
      await nextTick()
      // правый край вкладки c = 300 + 4; ширина 150 → 154
      expect((w.get('[role="tablist"]').element as HTMLElement).scrollLeft).toBe(154)
    })
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

  it('подпись резервирует ширину под жирный шрифт', () => {
    w = mountWithI18n(ZTabs, { props: { activeKey: 'all', items } })
    const label = w.get('[role="tab"] span')
    expect(label.attributes('data-label')).toBe('Все')
    expect(label.classes().join(' ')).toContain('after:content-[attr(data-label)]')
    expect(label.classes().join(' ')).toContain('after:font-semibold')
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

  it('extra не входит в заголовок h3 и его имя', () => {
    w = mountCollapse()
    const h = w.get('h3')
    expect(h.text()).toBe('Гр.31 — описание')
    expect(h.find('div').exists()).toBe(false)
    expect(h.find('.x').exists()).toBe(false)
    expect(w.get('.x').element.closest('h3')).toBeNull()
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

  it('spinning — содержимое без inert (фокус в поле не теряется), только pointer-events-none; aria-busy на корне', async () => {
    w = mountWithI18n({
      components: { ZSpin },
      data: () => ({ on: false }),
      template: '<ZSpin :spinning="on"><input class="i"><button class="b">Ок</button></ZSpin>',
    }, { attachTo: document.body })
    const input = w.get('.i').element as HTMLInputElement
    input.focus()
    ;(w.vm as unknown as { on: boolean }).on = true
    await nextTick()
    const wrap = input.parentElement as HTMLElement
    expect(wrap.hasAttribute('inert')).toBe(false)
    expect(wrap.className).toContain('pointer-events-none')
    expect(document.activeElement).toBe(input)
    expect(w.attributes('aria-busy')).toBe('true')
    ;(w.vm as unknown as { on: boolean }).on = false
    await nextTick()
    expect(wrap.className).not.toContain('pointer-events-none')
    expect(w.attributes('aria-busy')).toBeUndefined()
  })

  it.each([
    [undefined, 'size-5'], ['sm', 'size-3.5'], ['md', 'size-5'], ['lg', 'size-7'],
    ['small', 'size-3.5'], ['default', 'size-5'], ['large', 'size-7'],
  ])('size=%s — кольцо %s', (size, cls) => {
    w = mountWithI18n(ZSpin, { props: { spinning: true, size } })
    const ring = w.get('[data-z-spin]').classes()
    expect(ring).toContain(cls)
    for (const other of ['size-3.5', 'size-5', 'size-7'].filter((c) => c !== cls)) expect(ring).not.toContain(other)
  })

  it('без слота — строчный индикатор (inline-flex span), годится рядом с текстом', () => {
    w = mountWithI18n(ZSpin, { props: { spinning: true, tip: 'Считаем', size: 'small' } })
    expect(w.element.tagName).toBe('SPAN')
    expect(w.classes()).toContain('inline-flex')
    expect(w.classes()).not.toContain('min-h-10')
    expect(w.find('.absolute').exists()).toBe(false)
    expect(w.attributes('aria-busy')).toBe('true')
    expect(w.text()).toContain('Считаем')
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
