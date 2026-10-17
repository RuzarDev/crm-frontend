import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useAuthStore } from '@/stores/auth'
import { resetAiTnvedStatus } from '@/components/aiTnved/aiTnved'

const api = vi.hoisted(() => ({ suggest: vi.fn(), select: vi.fn(), status: vi.fn(), settings: vi.fn(), saveSettings: vi.fn(), stats: vi.fn() }))
vi.mock('@/api/aiTnved', async (orig) => ({ ...(await orig<typeof import('@/api/aiTnved')>()), aiTnvedApi: api }))

import StepCargo from '../StepCargo.vue'

let w: VueWrapper
beforeEach(() => {
  setActivePinia(createPinia())
  useAuthStore().role = 'client'
  resetAiTnvedStatus()
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})
const draft = () => reactive({ cargo: 'Насосы центробежные', post: '', estimatedValue: null, currency: null }) as never

describe('StepCargo: «Подобрать код ТН ВЭД с ИИ»', () => {
  it('кнопка есть, если «ИИ для клиентов» включён; выбранный код дописывается к грузу', async () => {
    api.status.mockResolvedValue({ available: true, configured: true, clientsEnabled: true, provider: 'Anthropic', model: 'm' })
    const d = draft() as { cargo: string }
    w = mountWithI18n(StepCargo, { props: { draft: d, postOptions: [] }, attachTo: document.body })
    await flushPromises()
    expect(w.find('[data-wz-ai]').exists()).toBe(true)
    await w.get('[data-wz-ai]').trigger('click')
    await flushPromises()
    w.findComponent({ name: 'AiTnvedModal' }).vm.$emit('select', { code: '8413708100', name: 'насосы' })
    expect(d.cargo).toBe('Насосы центробежные (код ТН ВЭД 8413708100)')
    // Повторный выбор того же кода не дублирует.
    w.findComponent({ name: 'AiTnvedModal' }).vm.$emit('select', { code: '8413708100', name: 'насосы' })
    expect(d.cargo).toBe('Насосы центробежные (код ТН ВЭД 8413708100)')
  })

  it('«ИИ для клиентов» выключен — кнопки нет', async () => {
    api.status.mockResolvedValue({ available: false, configured: true, clientsEnabled: false, provider: 'Anthropic', model: 'm' })
    w = mountWithI18n(StepCargo, { props: { draft: draft(), postOptions: [] }, attachTo: document.body })
    await flushPromises()
    expect(w.find('[data-wz-ai]').exists()).toBe(false)
  })
})
