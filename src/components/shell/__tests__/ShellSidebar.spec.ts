import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import ShellSidebar from '@/components/shell/ShellSidebar.vue'
import ShellSectionTabs from '@/components/shell/ShellSectionTabs.vue'
import { buildBrokerNav, buildClientNav, type NavAccess } from '@/shell/navModel'

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
const acc = (role: string, extra: Partial<NavAccess> = {}): NavAccess => ({
  role, hasPermission: () => role === 'administrator', clientHasModule: (m) => m === 'import40',
  canUseImport40: true, canUseSales: true, isFinanceOnly: false, registrationIncomplete: false, ...extra,
})
const mountIt = (props: Record<string, unknown>) => mountWithI18n(ShellSidebar, { props, global: { plugins: [router] } })

describe('ShellSidebar', () => {
  it('подсвечивает активный раздел через aria-current', async () => {
    const w = mountIt({ model: buildBrokerNav(acc('administrator')), path: '/import-40/manage', attention: null })
    const cur = w.findAll('a[aria-current="page"]')
    expect(cur).toHaveLength(1)
    expect(cur[0].text()).toContain('Заявки')
  })
  it('бейдж внимания — только при n > 0', () => {
    expect(mountIt({ model: buildBrokerNav(acc('administrator')), path: '/home', attention: 0 }).text()).not.toContain('требует внимания')
    const w = mountIt({ model: buildBrokerNav(acc('administrator')), path: '/home', attention: 3 })
    expect(w.text()).toContain('требует внимания: 3')
  })
  it('ссылка раздела ведёт на первую видимую вкладку', () => {
    const w = mountIt({ model: buildBrokerNav(acc('administrator')), path: '/home', attention: null })
    expect(w.find('a[href="/finance"]').exists()).toBe(true)
    expect(w.find('a[href="/billing"]').exists()).toBe(false)
  })
  it('клиент: точка «нужно действие» у компании и действие «Оформить поставку»', () => {
    const w = mountIt({ model: buildClientNav(acc('client', { registrationIncomplete: true })), path: '/home', attention: null, comfortable: true })
    expect(w.text()).toContain('нужно действие')
    expect(w.find('a[href="/import-40/new"]').attributes('aria-current')).toBeUndefined()
  })
  it('клиент в мастере (/import-40/new): не подсвечен ни один пункт', () => {
    const w = mountIt({ model: buildClientNav(acc('client')), path: '/import-40/new', attention: null, comfortable: true })
    expect(w.find('[aria-current]').exists()).toBe(false)
  })
  it('кнопка поиска эмитит search', async () => {
    const w = mountIt({ model: buildBrokerNav(acc('administrator')), path: '/home', attention: null })
    await w.get('button').trigger('click')
    expect(w.emitted('search')).toHaveLength(1)
  })
  it('клик по пункту эмитит navigate', async () => {
    const w = mountIt({ model: buildBrokerNav(acc('administrator')), path: '/home', attention: null })
    await w.get('a[href="/reestr"]').trigger('click')
    expect(w.emitted('navigate')).toBeTruthy()
  })
  it('клик с Ctrl/⌘ (новая вкладка) не эмитит navigate — ящик остаётся открытым', async () => {
    const w = mountIt({ model: buildBrokerNav(acc('administrator')), path: '/home', attention: null })
    const link = w.get('a[href="/reestr"]')
    // Наш обработчик срабатывает первым; этот лишь гасит нативный переход jsdom (он не реализован).
    link.element.addEventListener('click', (e) => e.preventDefault())
    await link.trigger('click', { ctrlKey: true })
    expect(w.emitted('navigate')).toBeUndefined()
  })
  it('без searchable кнопки поиска нет', () => {
    const w = mountIt({ model: buildClientNav(acc('client')), path: '/home', attention: null, searchable: false })
    expect(w.find('button').exists()).toBe(false)
  })
})

describe('ShellSectionTabs', () => {
  it('вкладки раздела с aria-current у активной', () => {
    const fin = buildBrokerNav(acc('administrator')).groups.flatMap((g) => g.sections).find((s) => s.key === 'finance')!
    const w = mountWithI18n(ShellSectionTabs, { props: { section: fin, activeKey: 'billing' }, global: { plugins: [router] } })
    expect(w.findAll('a').map((a) => a.text())).toEqual(['Обзор', 'Счета и акты'])
    expect(w.get('a[href="/billing"]').attributes('aria-current')).toBe('page')
  })
})
