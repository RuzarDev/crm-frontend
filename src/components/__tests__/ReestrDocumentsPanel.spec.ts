import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api/reestr', () => ({ reestrApi: { listDocuments: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/ui/message', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

import ReestrDocumentsPanel from '../ReestrDocumentsPanel.vue'

const Pass = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })
const Autofill = defineComponent({ name: 'InvoiceAutofillButton', setup: () => () => h('button', { 'data-autofill': '' }) })

const mountAs = async (role: string, permissions: string[]) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = permissions
  const w = mountWithI18n(ReestrDocumentsPanel, {
    props: { reestrId: 'r1' },
    global: {
      stubs: {
        AUpload: Pass, ASpin: Pass, ASpace: Pass, AButton: Pass, ReestrDocumentList: Pass, InvoiceAutofillButton: Autofill,
      },
    },
  })
  await flushPromises()
  return w
}

beforeEach(() => setActivePinia(createPinia()))

// «Заполнить из инвойса» зовёт apply, а он на сервере требует reestr.write: клиент и экспедитор без права
// видели кнопку, но получали 403 после загрузки и распознавания.
describe('ReestrDocumentsPanel: «Заполнить из инвойса» только с reestr.write', () => {
  it('клиент без права — кнопки нет', async () => {
    const w = await mountAs('client', ['reestr.read'])
    expect(w.find('[data-autofill]').exists()).toBe(false)
  })
  it('экспедитор без права — кнопки нет', async () => {
    const w = await mountAs('expeditor', ['reestr.read'])
    expect(w.find('[data-autofill]').exists()).toBe(false)
  })
  it('экспедитор с reestr.write — кнопка есть', async () => {
    const w = await mountAs('expeditor', ['reestr.read', 'reestr.write'])
    expect(w.find('[data-autofill]').exists()).toBe(true)
  })
  it('администратор — кнопка есть', async () => {
    const w = await mountAs('administrator', [])
    expect(w.find('[data-autofill]').exists()).toBe(true)
  })
})
