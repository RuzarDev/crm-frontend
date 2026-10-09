import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useAuthStore } from '@/stores/auth'
import type { TnvedRegulationDto } from '@/types/api'

const api = vi.hoisted(() => ({ regulations: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: api }))

import RegulationsPage from '../RegulationsPage.vue'

const reg = (id: number, number: string, date: string | null, url: string | null, dateStr: string | null = null): TnvedRegulationDto =>
  ({ id, number, date, dateStr, url })
const REGS = [
  reg(1, 'Решение ЕЭК № 80', '2021-09-14T00:00:00', 'https://eec.example/80'),
  reg(2, 'Решение КТС № 130', '2010-11-27T00:00:00', 'https://eec.example/130'),
  reg(3, 'Приказ № 5', null, null),
  reg(4, 'Решение ЕЭК № 9', '2024-08-05T00:00:00', 'javascript:alert(1)'),
]
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })

let w: VueWrapper
const mountPage = async (role = 'administrator') => {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore().role = role
  w = mountWithI18n(RegulationsPage, { attachTo: document.body, global: { plugins: [pinia] } })
  await flushPromises()
}
const ids = () => w.findAll('[data-regulation-row]').map((r) => Number(r.attributes('data-regulation-row')))

beforeEach(() => api.regulations.mockResolvedValue({ data: REGS }))
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('RegulationsPage', () => {
  it('сначала новые; без даты — в конце; дата по языку интерфейса', async () => {
    await mountPage()
    expect(api.regulations).toHaveBeenCalledWith({ silent: true })
    expect(w.get('h1').text()).toBe('Нормативные акты')
    expect(ids()).toEqual([4, 1, 2, 3])
    expect(w.get('[data-regulation-row="1"] [data-regulation-date]').text()).toBe('14.09.2021')
    expect(w.get('[data-regulation-row="3"] [data-regulation-date]').text()).toBe('без даты')
  })

  it('кнопка порядка переключает «сначала старые»', async () => {
    await mountPage()
    expect(w.get('[data-regulations-sort]').text()).toBe('Сначала новые')
    await w.get('[data-regulations-sort]').trigger('click')
    expect(w.get('[data-regulations-sort]').text()).toBe('Сначала старые')
    expect(ids()).toEqual([2, 1, 4, 3])
  })

  it('поиск по номеру и по дате', async () => {
    await mountPage()
    await w.get('[data-regulations-search]').setValue('ктс')
    expect(ids()).toEqual([2])
    await w.get('[data-regulations-search]').setValue('2021')
    expect(ids()).toEqual([1])
    await w.get('[data-regulations-search]').setValue('08.2024')
    expect(ids()).toEqual([4])
    await w.get('[data-regulations-search]').setValue('zzz')
    expect(w.get('[data-regulations-nothing]').text()).toContain('По запросу «zzz» ничего не нашлось')
    expect(w.find('[data-regulations-table]').exists()).toBe(false)
  })

  it('ссылка открывает документ в новой вкладке; не-http ссылка не выводится', async () => {
    await mountPage()
    const a = w.get('[data-regulation-row="1"] [data-regulation-link]')
    expect(a.attributes('href')).toBe('https://eec.example/80')
    expect(a.attributes('target')).toBe('_blank')
    expect(a.attributes('rel')).toContain('noopener')
    expect(w.find('[data-regulation-row="4"] a').exists()).toBe(false)
    expect(w.get('[data-regulation-row="4"]').text()).toContain('Решение ЕЭК № 9')
    expect(w.find('[data-regulation-row="3"] a').exists()).toBe(false)
  })

  it('клиент видит тот же экран; заголовок в клиентском размере', async () => {
    await mountPage('Client')
    expect(ids()).toEqual([4, 1, 2, 3])
    expect(w.get('h1').classes().join(' ')).toContain('text-[26px]')
    await mountPage('administrator')
    expect(w.get('h1').classes().join(' ')).toContain('text-[22px]')
  })

  it('пусто, ошибка и лимит — разные состояния', async () => {
    api.regulations.mockResolvedValueOnce({ data: [] })
    await mountPage()
    expect(w.get('[data-regulations-empty]').text()).toContain('Нормативных актов пока нет')
    w.unmount()

    api.regulations.mockRejectedValueOnce(httpError(500)).mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce({ data: REGS })
    await mountPage()
    expect(w.find('[data-regulations-empty]').exists()).toBe(false)
    expect(w.get('[data-regulations-error]').text()).toContain('Не удалось загрузить')
    await w.get('[data-regulations-retry]').trigger('click')
    await flushPromises()
    expect(w.get('[data-regulations-error]').text()).toContain('Слишком много запросов')
    await w.get('[data-regulations-retry]').trigger('click')
    await flushPromises()
    expect(ids()).toEqual([4, 1, 2, 3])
  })
})
