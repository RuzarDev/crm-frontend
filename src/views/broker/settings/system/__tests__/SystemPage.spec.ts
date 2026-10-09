import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'

const api = vi.hoisted(() => ({ getEndpoints: vi.fn() }))
vi.mock('@/api/system', () => ({ systemApi: api }))

import SystemPage from '../SystemPage.vue'

const ROWS = [
  { route: '/api/auth/login', methods: ['POST'], allowsAnonymous: true, policies: [], roles: [] },
  { route: '/api/users', methods: ['GET', 'POST'], allowsAnonymous: false, policies: ['users.read'], roles: [] },
  { route: '/api/profile', methods: ['GET', 'PUT'], allowsAnonymous: false, policies: [], roles: [] },
  { route: '/api/reestr/{id}', methods: ['DELETE'], allowsAnonymous: false, policies: ['reestr.delete'], roles: [] },
]

const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru, kk, en } })
let w: VueWrapper
const mountIt = async () => {
  w = mount(SystemPage, { attachTo: document.body, global: { plugins: [i18n] } })
  await flushPromises()
}
const routes = () => w.findAll('[data-system-route]').map((r) => r.text())

beforeEach(() => {
  i18n.global.locale.value = 'ru'
  api.getEndpoints.mockResolvedValue({ data: ROWS })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('SystemPage («Система», каталог API)', () => {
  it('заголовок, пояснение для разработчиков, счётчик и строки; запрос тихий (свой экран ошибки)', async () => {
    await mountIt()
    expect(w.get('h1').text()).toBe('Каталог API')
    expect(w.get('[data-system-hint]').text()).toBe('Для разработчиков: какие адреса API есть и кто к ним допущен')
    expect(w.get('[data-system-count]').text()).toBe('4')
    expect(routes()).toEqual(['/api/auth/login', '/api/users', '/api/profile', '/api/reestr/{id}'])
    expect(api.getEndpoints).toHaveBeenCalledWith({ silent: true })
  })

  it('доступ: «анонимно» / политики / «авторизован»; метод — бейдж на каждый глагол', async () => {
    await mountIt()
    const cells = w.findAll('[data-system-access]')
    expect(cells[0].text()).toBe('анонимно')
    expect(cells[1].findAll('[data-system-policy]').map((p) => p.text())).toEqual(['users.read'])
    expect(cells[2].text()).toBe('авторизован')
    expect(w.findAll('[data-system-methods]')[1].findAll('[data-system-method]').map((m) => m.text())).toEqual(['GET', 'POST'])
  })

  it('поиск по адресу и по политике', async () => {
    await mountIt()
    await w.get('input[type="search"]').setValue('profile')
    expect(routes()).toEqual(['/api/profile'])
    await w.get('input[type="search"]').setValue('reestr.delete')
    expect(routes()).toEqual(['/api/reestr/{id}'])
    await w.get('input[type="search"]').setValue('zzz')
    expect(routes()).toEqual([])
    expect(w.text()).toContain('Ничего не нашлось по «zzz»')
  })

  it('заголовки колонок следуют за языком интерфейса (ошибка старого экрана)', async () => {
    await mountIt()
    const heads = () => w.findAll('th').map((h) => h.text())
    expect(heads()).toEqual(['Адрес', 'Методы', 'Доступ'])
    i18n.global.locale.value = 'en'
    await flushPromises()
    expect(heads()).toEqual(['Address', 'Methods', 'Access'])
    expect(w.get('h1').text()).toBe('API catalog')
    i18n.global.locale.value = 'kk'
    await flushPromises()
    expect(heads()).toEqual(['Мекенжай', 'Әдістер', 'Қолжетімділік'])
  })

  it('ошибка загрузки: текст и «Повторить», который грузит заново', async () => {
    api.getEndpoints.mockRejectedValueOnce(new Error('boom'))
    await mountIt()
    expect(w.get('[data-system-error]').text()).toContain('Не удалось загрузить каталог')
    expect(w.find('[data-system-table]').exists()).toBe(false)
    await w.get('[data-system-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-system-error]').exists()).toBe(false)
    expect(routes()).toHaveLength(4)
  })

  it('пустой каталог — отдельный текст', async () => {
    api.getEndpoints.mockResolvedValue({ data: [] })
    await mountIt()
    expect(w.text()).toContain('Каталог пуст')
  })
})
