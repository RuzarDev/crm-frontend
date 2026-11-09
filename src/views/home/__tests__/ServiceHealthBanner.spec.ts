import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ServiceHealthCheck, ServiceHealthResponse } from '@/api/system'

const api = vi.hoisted(() => ({ health: vi.fn() }))
vi.mock('@/api/system', () => ({ systemApi: { serviceHealth: api.health } }))

import ServiceHealthBanner from '../ServiceHealthBanner.vue'
import { canSeeServiceHealth, formatSince, serviceAlerts } from '../serviceHealth'
import { useAuthStore } from '@/stores/auth'

// Плашка о сбое на «Главной» (09.11.2026): только администратору и РОП, только при подтверждённом сбое.
const check = (o: Partial<ServiceHealthCheck>): ServiceHealthCheck => ({
  name: 'ai-key', status: 'ok', active: false, consecutiveFailures: 0, failingSinceUtc: null, lastSuccessAtUtc: null,
  lastCheckedAtUtc: null, errorKind: null, error: null, alertSentAtUtc: null, ...o,
})
// 26.10 23:15 по местному времени теста — без зависимости от пояса машины.
const since = new Date(new Date().getFullYear(), 9, 26, 23, 15)
const aiDown = check({
  status: 'failing', active: true, consecutiveFailures: 3, failingSinceUtc: since.toISOString(),
  errorKind: 'key_rejected', error: 'HTTP 401: invalid x-api-key',
})
const zirconDown = check({ name: 'zircon-ai', status: 'failing', active: true, consecutiveFailures: 2, failingSinceUtc: since.toISOString(), errorKind: 'unreachable' })
const response = (checks: ServiceHealthCheck[], alertEmailsConfigured = true): ServiceHealthResponse => ({ checks, alertEmailsConfigured })

let w: VueWrapper
let pinia: Pinia
let router: Router

const setUser = (role: string, businessRoles: string[] = [], permissions: string[] = []) => {
  const auth = useAuthStore()
  auth.role = role
  auth.businessRoles = businessRoles
  auth.permissions = permissions
}
const mountIt = async () => {
  w = mountWithI18n(ServiceHealthBanner, { global: { plugins: [pinia, router] } })
  await flushPromises()
}

beforeEach(async () => {
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/home')
  api.health.mockResolvedValue(response([aiDown, check({ name: 'zircon-ai' })]))
})
afterEach(() => {
  w?.unmount()
  vi.clearAllMocks()
  localStorage.clear()
})

describe('serviceHealth', () => {
  it('показывает только подтверждённые сбои известных проверок, ИИ первым', () => {
    expect(serviceAlerts([zirconDown, aiDown, check({ name: 'other', active: true })]).map((a) => a.name)).toEqual(['ai-key', 'zircon-ai'])
    expect(serviceAlerts([check({ status: 'failing', consecutiveFailures: 1 }), check({ name: 'zircon-ai', status: 'skipped' })])).toEqual([])
    expect(serviceAlerts(null)).toEqual([])
    const [a] = serviceAlerts([check({ ...aiDown, errorKind: 'weird' })])
    expect(a.kindKey).toBe('home.serviceHealth.kind.other')
    expect(a.lineKey).toBe('home.serviceHealth.line.aiKey')
  })

  it('время сбоя: день первым, год — только если не текущий; без пояса — UTC', () => {
    const now = new Date(2026, 10, 9)
    expect(formatSince(new Date(2026, 9, 26, 23, 15), 'ru-RU', now)).toBe('26.10 23:15')
    expect(formatSince(new Date(2025, 9, 26, 23, 15), 'ru-RU', now)).toBe('26.10.2025 23:15')
    expect(formatSince(null, 'ru-RU', now)).toBe('')
    const [a] = serviceAlerts([check({ ...aiDown, failingSinceUtc: '2026-10-26T18:15:00' })])
    expect(a.since?.toISOString()).toBe('2026-10-26T18:15:00.000Z')
  })

  it('видят администратор и РОП (в том числе вторая роль), остальные — нет', () => {
    const who = (role: string, roles: string[]) => canSeeServiceHealth({ role, hasBusinessRole: (r) => roles.includes(r) })
    expect(who('Administrator', [])).toBe(true)
    expect(who('importer', ['kpp', 'rop'])).toBe(true)
    expect(who('importer', ['declarant'])).toBe(false)
    expect(who('client', ['client'])).toBe(false)
  })
})

describe('ServiceHealthBanner', () => {
  it('администратор: сбой ключа ИИ — строка с временем и причиной, текст ошибки сервера, письма уходят', async () => {
    setUser('administrator')
    await mountIt()

    expect(api.health).toHaveBeenCalledTimes(1)
    const banner = w.get('[data-home-service-health]')
    expect(banner.attributes('role')).toBe('alert')
    expect(banner.findAll('[data-service]')).toHaveLength(1)
    expect(banner.get('[data-service-line]').text()).toBe('ИИ-подбор ТН ВЭД не работает с 26.10 23:15: ключ отклонён')
    expect(banner.get('[data-service-error]').text()).toBe('HTTP 401: invalid x-api-key')
    expect(banner.get('[data-service-hint]').text()).toBe('Письма о сбое уходят на адреса из «Настройки → Организация».')
  })

  it('РОП: оба сбоя; адресов нет — подсказка, ссылка на настройки только тому, кто может их менять', async () => {
    api.health.mockResolvedValue(response([aiDown, zirconDown], false))
    setUser('importer', ['declarant', 'rop'])
    await mountIt()

    const lines = w.findAll('[data-service-line]').map((x) => x.text())
    expect(lines).toEqual([
      'ИИ-подбор ТН ВЭД не работает с 26.10 23:15: ключ отклонён',
      'Сервис разбора документов недоступен с 26.10 23:15: нет связи с сервисом',
    ])
    expect(w.get('[data-service-hint]').text()).toBe('Письма о сбое не уходят: не заданы адреса для оповещений.')
    expect(w.find('[data-service-settings]').exists()).toBe(false)

    w.unmount()
    setUser('importer', ['rop'], ['users.write'])
    await mountIt()
    expect(w.get('[data-service-settings]').attributes('href')).toBe('/settings/organization')
  })

  it('без сбоя, при ошибке запроса и у других ролей — ничего', async () => {
    setUser('administrator')
    api.health.mockResolvedValue(response([check({}), check({ name: 'zircon-ai', status: 'failing', consecutiveFailures: 1 })]))
    await mountIt()
    expect(w.find('[data-home-service-health]').exists()).toBe(false)

    w.unmount()
    api.health.mockRejectedValue(new Error('403'))
    await mountIt()
    expect(w.find('[data-home-service-health]').exists()).toBe(false)

    w.unmount()
    api.health.mockClear()
    setUser('importer', ['declarant', 'kpp'])
    await mountIt()
    expect(api.health).not.toHaveBeenCalled()
    expect(w.find('[data-home-service-health]').exists()).toBe(false)
  })
})
