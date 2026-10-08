import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40CaseDto } from '@/api/import40'
import { confirmState } from '@/ui/confirm'
import { caseDto } from './caseFixture'

const api = vi.hoisted(() => ({
  get: vi.fn(), create: vi.fn(), update: vi.fn(), addContainer: vi.fn(), updateContainer: vi.fn(), deleteContainer: vi.fn(),
}))
const refs = vi.hoisted(() => ({ listCountries: vi.fn(), listCustomsPosts: vi.fn() }))
const contract = vi.hoisted(() => ({ getProfile: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const reg = vi.hoisted(() => ({
  loaded: null as unknown as { value: boolean },
  complete: null as unknown as { value: boolean },
  reason: null as unknown as { value: string | null },
  needNew: null as unknown as { value: string | null },
  refresh: vi.fn(),
}))
vi.mock('@/api/import40', () => ({ import40Api: api }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))
vi.mock('@/api/import40Contract', () => ({ import40ContractApi: contract }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/composables/useClientRegistration', () => ({
  useClientRegistration: () => ({ loaded: reg.loaded, complete: reg.complete, reason: reg.reason, needNew: reg.needNew, refresh: reg.refresh }),
}))

import ClientWizardView from '../ClientWizardView.vue'
import { useAuthStore } from '@/stores/auth'

let w: VueWrapper
let pinia: Pinia
let router: Router
let server: Import40CaseDto
const stub = { template: '<div/>' }

const mountAt = async (path: string) => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(ClientWizardView, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
}

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.userId = 'u1'
  auth.username = 'romashka'
  reg.loaded = ref(true)
  reg.complete = ref(true)
  reg.reason = ref(null)
  reg.needNew = ref(null)
  reg.refresh.mockResolvedValue(undefined)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/import-40', name: 'list', component: stub },
      { path: '/import-40/company', name: 'company', component: stub },
      { path: '/import-40/new', name: 'client-wizard', component: stub },
      { path: '/import-40/new/:id', name: 'client-wizard-draft', component: stub },
      { path: '/import-40/:id', name: 'import-40-detail', component: stub },
    ],
  })
  server = caseDto({ id: 'c1', number: 'ИМ-2026-0184', status: 0, cargo: '', post: '', clientSenderName: '', clientSenderCountryCode: '', containers: [] })
  api.create.mockImplementation(async (body: { cargo: string; post: string }) => {
    server = { ...server, cargo: body.cargo, post: body.post }
    return server
  })
  api.get.mockImplementation(async () => server)
  api.update.mockImplementation(async () => server)
  refs.listCountries.mockResolvedValue([
    { id: 'r1', code: '398', name: 'Казахстан', alpha2: 'KZ', isActive: true },
    { id: 'r2', code: '156', name: 'Китай', alpha2: 'CN', isActive: true },
  ])
  refs.listCustomsPosts.mockResolvedValue([{ id: 'p1', name: 'Хоргос — ЦТО', isActive: true }])
  contract.getProfile.mockResolvedValue({ clientId: 'u1', companyName: 'ТОО «Ромашка»', bin: '123456789012', legalCountryCode: 'KZ' })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('ClientWizardView', () => {
  it('регистрация не завершена — панель «Завершить регистрацию», формы нет', async () => {
    reg.complete.value = false
    reg.reason.value = 'Подпишите договор'
    reg.needNew.value = 'contract'
    await mountAt('/import-40/new')
    expect(reg.refresh).toHaveBeenCalled()
    const gate = w.get('[data-wz-gate]')
    expect(gate.text()).toContain('Завершите регистрацию компании')
    expect(gate.text()).toContain('Подпишите договор')
    expect(w.find('[data-step]').exists()).toBe(false)
    expect(w.find('[data-wz-next]').exists()).toBe(false)

    const action = gate.findAll('button').find((b) => b.text() === 'Завершить регистрацию')!
    await action.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40/company?step=contract')
  })

  it('регистрация не завершена — черновик по ссылке тоже не открывается', async () => {
    reg.complete.value = false
    await mountAt('/import-40/new/c1')
    expect(w.find('[data-wz-gate]').exists()).toBe(true)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('шаг 1: «Далее» выключена при пустом грузе; после ввода — черновик создан, в шапке его номер', async () => {
    await mountAt('/import-40/new')
    expect(w.get('[data-step="cargo"]').exists()).toBe(true)
    expect(w.get('[data-wz-step="cargo"]').attributes('aria-current')).toBe('step')
    expect(w.get('[data-wz-step-of]').text()).toBe('Шаг 1 из 4')
    const nextBtn = () => w.get('[data-wz-next]')
    expect(nextBtn().text()).toBe('Далее: транспорт')
    expect(nextBtn().attributes('disabled')).toBeDefined()
    expect(w.find('[data-wz-status]').exists()).toBe(false)
    // Будущие шаги недоступны, пока груз не описан.
    expect(w.get('[data-wz-step="transport"]').attributes('disabled')).toBeDefined()

    await w.get('[data-wz-cargo]').setValue('Ноутбуки Lenovo ThinkPad, 120 шт.')
    expect(nextBtn().attributes('disabled')).toBeUndefined()
    await nextBtn().trigger('click')
    await flushPromises()

    expect(api.create).toHaveBeenCalledTimes(1)
    expect(api.create).toHaveBeenCalledWith({ clientId: 'u1', clientName: 'ТОО «Ромашка»', cargo: 'Ноутбуки Lenovo ThinkPad, 120 шт.', post: '' })
    expect(router.currentRoute.value.fullPath).toBe('/import-40/new/c1')
    expect(w.get('[data-wz-status]').text()).toContain('ИМ-2026-0184')
    expect(w.find('[data-step="transport"]').exists()).toBe(true)
    expect(w.get('[data-wz-step-of]').text()).toBe('Шаг 2 из 4')
    expect(w.findAll('[data-wz-segment]').map((s) => s.classes().includes('bg-navy'))).toEqual([true, true, false, false])
    // Пройденный шаг — с галочкой; при смене шага черновик сохранён сразу (получатель — из профиля).
    expect(w.get('[data-wz-step="cargo"] svg').exists()).toBe(true)
    expect(api.update).toHaveBeenCalledTimes(1)
    expect(api.update.mock.calls[0][1]).toMatchObject({ clientReceiverName: 'ТОО «Ромашка»', clientReceiverBin: '123456789012', clientReceiverCountryCode: '398' })
    expect(api.get).not.toHaveBeenCalled()
  })

  it('/import-40/new/:id — поля черновика заполнены, открыт первый незаполненный шаг', async () => {
    server = caseDto({
      id: 'c1', number: 'ИМ-2026-0184', status: 0, cargo: 'Станки', post: 'Хоргос — ЦТО', transportMode: 0,
      wagonNumber: '', containers: [{ id: 'k1', containerNumber: 'MSKU1234567', containerType: '40HC', notes: '' }],
      clientSenderName: '', clientReceiverName: 'ТОО «Ромашка»',
    })
    await mountAt('/import-40/new/c1')
    expect(api.get).toHaveBeenCalledWith('c1', { silent: true })
    // Груз есть, транспорт (контейнер) есть, отправителя нет — шаг 3.
    expect(w.find('[data-step="parties"]').exists()).toBe(true)
    expect((w.get('[data-wz-receiver-name]').element as HTMLInputElement).value).toBe('ТОО «Ромашка»')
    expect(w.get('[data-wz-status]').text()).toBe('Черновик ИМ-2026-0184')

    await w.get('[data-wz-step="transport"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-wz-mode] [data-state="on"]').text()).toBe('ЖД')
    expect((w.get('[data-wz-container-number]').element as HTMLInputElement).value).toBe('MSKU1234567')

    await w.get('[data-wz-step="cargo"]').trigger('click')
    await flushPromises()
    expect((w.get('[data-wz-cargo]').element as HTMLTextAreaElement).value).toBe('Станки')
    // Без правок переходы не шлют ни PUT, ни контейнеры (раньше продолжение дублировало контейнеры).
    expect(api.update).not.toHaveBeenCalled()
    expect(api.addContainer).not.toHaveBeenCalled()
  })

  it('/import-40/new/:id для отправленной поставки — на карточку', async () => {
    server = caseDto({ id: 'c1', status: 2 })
    const replace = vi.spyOn(router, 'replace')
    await mountAt('/import-40/new/c1')
    expect(replace).toHaveBeenCalledWith('/import-40/c1')
    expect(router.currentRoute.value.fullPath).toBe('/import-40/c1')
  })

  it('автосохранение: правка — PUT через 800 мс, в шапке «сохранён в»', async () => {
    server = caseDto({ id: 'c1', status: 0, cargo: 'Станки', clientSenderName: 'Lenovo', clientReceiverName: 'ТОО «Ромашка»' })
    await mountAt('/import-40/new/c1')
    vi.useFakeTimers()
    await w.get('[data-wz-step="cargo"]').trigger('click')
    await w.get('[data-wz-cargo]').setValue('Станки ЧПУ')
    await vi.advanceTimersByTimeAsync(799)
    expect(api.update).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(api.update).toHaveBeenCalledTimes(1)
    expect(api.update.mock.calls[0][1]).toMatchObject({ cargo: 'Станки ЧПУ' })
    await flushPromises()
    expect(w.get('[data-wz-status]').text()).toMatch(/Черновик ИМ-2026-0166 сохранён в \d\d:\d\d/)
  })

  it('сбой сохранения — «Не удалось сохранить — Повторить»; уход спрашивает «Изменения не сохранены. Уйти?»', async () => {
    server = caseDto({ id: 'c1', status: 0, cargo: 'Станки', clientSenderName: 'Lenovo', clientReceiverName: 'ТОО «Ромашка»' })
    await mountAt('/import-40/new/c1')
    api.update.mockRejectedValue(new Error('network'))
    await w.get('[data-wz-step="cargo"]').trigger('click')
    await w.get('[data-wz-cargo]').setValue('Станки ЧПУ')
    await w.get('[data-wz-later]').trigger('click')
    await flushPromises()
    expect(w.get('[data-wz-status]').text()).toContain('Не удалось сохранить')
    expect(w.find('[data-wz-save-retry]').exists()).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/import-40/new/c1')
    expect(msg.success).not.toHaveBeenCalled()

    const nav = router.push('/import-40')
    await flushPromises()
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Изменения не сохранены. Уйти?')
    confirmState.resolve(false)
    await nav
    expect(router.currentRoute.value.fullPath).toBe('/import-40/new/c1')

    // Сеть вернулась — уход сохраняет без вопроса.
    api.update.mockResolvedValue(server)
    await router.push('/import-40')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40')
    expect(api.update.mock.calls.at(-1)?.[1]).toMatchObject({ cargo: 'Станки ЧПУ' })
  })

  it('«Дозаполнить позже» — сохраняет, тост, «Мои поставки»', async () => {
    server = caseDto({ id: 'c1', number: 'ИМ-2026-0184', status: 0, cargo: 'Станки', clientSenderName: 'Lenovo', clientReceiverName: 'ТОО «Ромашка»' })
    await mountAt('/import-40/new/c1')
    await w.get('[data-wz-later]').trigger('click')
    await flushPromises()
    expect(msg.success).toHaveBeenCalledWith('Черновик ИМ-2026-0184 сохранён — он в «Моих поставках»')
    expect(router.currentRoute.value.fullPath).toBe('/import-40')
  })

  it('шаг 3: БИН не из 12 цифр — «Далее» выключена', async () => {
    server = caseDto({ id: 'c1', status: 0, cargo: 'Станки', vehicleNumber: '123ABC01', clientSenderName: '', clientReceiverName: 'ТОО «Ромашка»' })
    await mountAt('/import-40/new/c1')
    expect(w.find('[data-step="parties"]').exists()).toBe(true)
    await w.get('[data-wz-receiver-bin]').setValue('12345')
    expect(w.get('[data-wz-next]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-wz-step="docs"]').attributes('disabled')).toBeDefined()
    await w.get('[data-wz-receiver-bin]').setValue('123456789012')
    expect(w.get('[data-wz-next]').attributes('disabled')).toBeUndefined()
  })
})
