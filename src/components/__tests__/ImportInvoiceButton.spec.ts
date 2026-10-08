import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import en from '@/i18n/locales/en'

const api = vi.hoisted(() => ({
  create: vi.fn(), uploadDocument: vi.fn(), getExtraction: vi.fn(), getById: vi.fn(), update: vi.fn(), del: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/reestr', () => ({
  reestrApi: {
    create: api.create, uploadDocument: api.uploadDocument, getExtraction: api.getExtraction,
    getById: api.getById, update: api.update, delete: api.del,
  },
}))
vi.mock('@/ui/message', () => ({ message: api.toast }))
vi.mock('@/utils/reestrDtoMap', () => ({ reestrEntryToUpsertBody: () => ({ cargoDescription: 'x' }) }))
vi.mock('@/components/ExtractionReviewModal.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'ExtractionReviewModal',
      emits: ['applied', 'cancel'],
      setup: (_, { emit }) => () => h('button', { type: 'button', 'data-apply': '', onClick: () => emit('applied', 1) }),
    }),
  }
})

import ImportInvoiceButton from '../ImportInvoiceButton.vue'

const Pass = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })
let beforeUpload: ((f: File) => unknown) | null = null
const Upload = defineComponent({
  props: ['beforeUpload'],
  setup: (p, { slots }) => {
    beforeUpload = p.beforeUpload
    return () => h('div', slots.default?.())
  },
})
const Select = defineComponent({
  props: ['value'], emits: ['update:value'],
  setup: (_, { emit }) => () => h('button', { type: 'button', 'data-pick': '', onClick: () => emit('update:value', 'c1') }),
})

describe('ImportInvoiceButton', () => {
  it('на английском очищает заглушку груза по ключу данных «Груз»', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'ru', messages: { ru, en } })
    api.create.mockResolvedValue({ id: 'd1' })
    api.uploadDocument.mockResolvedValue({ id: 'doc1' })
    api.getExtraction.mockResolvedValue({ status: 'ok' })
    // Данные реестра всегда с русскими ключами; значение — заглушка на языке интерфейса.
    api.getById.mockResolvedValue({ id: 'd1', data: { 'Груз': en.transit.importIzInvoysa } })
    api.update.mockResolvedValue({})

    const w = mount(ImportInvoiceButton, {
      props: { clientOptions: [{ value: 'c1', label: 'Альфа' }], hideTrigger: true },
      global: {
        plugins: [i18n],
        stubs: { AModal: Pass, ASpace: Pass, AFormItem: Pass, AButton: Pass, ASelect: Select, AUpload: Upload },
      },
    })
    ;(w.vm as unknown as { open: () => void }).open()
    await w.find('[data-pick]').trigger('click')
    await beforeUpload!(new File(['x'], 'inv.pdf'))
    await flushPromises()
    await w.find('[data-apply]').trigger('click')
    await flushPromises()

    expect(api.update).toHaveBeenCalledWith('d1', { cargoDescription: null })
    expect(w.emitted('imported')?.[0]).toEqual([1])
  })
})
