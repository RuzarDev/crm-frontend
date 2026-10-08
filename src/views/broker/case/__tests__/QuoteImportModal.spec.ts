import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { Import40CaseDto } from '@/api/import40'
import { confirmState } from '@/ui/confirm'
import { USERS, declaration } from './caseFixture'
import { mountStep } from './stepHarness'

const api = vi.hoisted(() => ({ caseQuotes: vi.fn(), importQuote: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
vi.mock('@/ui/message', () => ({ message: msg }))

import DeclarationsList from '../steps/DeclarationsList.vue'

// «Импорт из КП» открывается из полосы списка ДТ. Окно и радиогруппа — заглушки: проверяются запросы и порядок шагов.
const ModalStub = {
  props: ['open', 'okButtonProps', 'title', 'confirmLoading'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal :data-title="title"><slot /><slot name="footer" /><button data-ok type="button" :disabled="okButtonProps?.disabled" @click="$emit(\'ok\')" /></div>',
}
const RadioStub = {
  props: ['value', 'options'], emits: ['update:value'],
  template: '<div data-radio><button v-for="o in options" :key="o.value" type="button" :data-radio-option="o.value" :disabled="o.disabled" @click="$emit(\'update:value\', o.value)">{{ o.label }}</button></div>',
}

let w: VueWrapper
let router: Router
const quotes = [
  { id: 'q1', number: '12', year: 2026, clientName: 'ТОО «Казахмыс Трейд»', status: 1, grandTotal: 1, createdByName: '', createdAtUtc: '' },
  { id: 'q2', number: '15', year: 2026, clientName: 'ТОО «Казахмыс Трейд»', status: 1, grandTotal: 1, createdByName: '', createdAtUtc: '' },
]
const open = async (kase: Partial<Import40CaseDto> = {}) => {
  const m = mountStep(DeclarationsList, {
    user: USERS.declarant, step: 3, kase: { status: 2, ...kase }, plugins: [router], stubs: { ZModal: ModalStub, ZRadioGroup: RadioStub },
  })
  w = m.w
  await w.get('[data-dt-quote]').trigger('click')
  await flushPromises()
  return m
}
const conflict = () => Object.assign(new Error('409'), { response: { status: 409 } })

beforeEach(async () => {
  const stub = { template: '<div/>' }
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/import-40/:id', component: stub }, { path: '/import-40/:id/dt/:dtId', component: stub }] })
  await router.push('/import-40/c1')
  api.caseQuotes.mockResolvedValue(quotes)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('QuoteImportModal', () => {
  it('КП клиента заявки списком; «Импортировать» доступна после выбора КП; «Существующая ДТ» — только если ДТ есть', async () => {
    await open()
    expect(api.caseQuotes).toHaveBeenCalledWith('c1')
    expect(w.get('[data-quote-select]').findAll('[data-option]').map((b) => b.text())).toEqual(['№12/2026 — ТОО «Казахмыс Трейд»', '№15/2026 — ТОО «Казахмыс Трейд»'])
    expect(w.get('[data-ok]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-radio-option="existing"]').attributes('disabled')).toBeDefined()
    await w.get('[data-quote-select] [data-option="q1"]').trigger('click')
    expect(w.get('[data-ok]').attributes('disabled')).toBeUndefined()
  })

  it('новая ДТ: прежнее тело, тост «Добавлено товаров: N», перечитывание и переход к ДТ', async () => {
    api.importQuote.mockResolvedValue({ declarationId: 'n1', addedGoods: 3 })
    const m = await open()
    await w.get('[data-quote-select] [data-option="q1"]').trigger('click')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.importQuote).toHaveBeenCalledWith('c1', { quoteId: 'q1', targetDeclarationId: null, force: false })
    expect(msg.success).toHaveBeenCalledWith('Добавлено товаров: 3')
    expect(m.reload).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/import-40/c1/dt/n1')
    expect(w.find('[data-modal]').exists()).toBe(false)
  })

  it('существующая ДТ: без выбора ДТ кнопка выключена, затем тело с targetDeclarationId', async () => {
    api.importQuote.mockResolvedValue({ declarationId: 'd2', addedGoods: 1 })
    await open({ declarations: [declaration({ id: 'd1' }), declaration({ id: 'd2', declarationNumber: '0012240' })] })
    await w.get('[data-quote-select] [data-option="q2"]').trigger('click')
    await w.get('[data-radio-option="existing"]').trigger('click')
    expect(w.get('[data-ok]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-quote-dt]').findAll('[data-option]').map((b) => b.text())).toEqual(['ДТ 1', '0012240'])
    await w.get('[data-quote-dt] [data-option="d2"]').trigger('click')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.importQuote).toHaveBeenCalledWith('c1', { quoteId: 'q2', targetDeclarationId: 'd2', force: false })
  })

  it('409 (КП уже импортирован) — вопрос «Добавить ещё раз?», «Добавить» — повтор с force', async () => {
    api.importQuote.mockRejectedValueOnce(conflict()).mockResolvedValueOnce({ declarationId: 'n1', addedGoods: 2 })
    await open()
    await w.get('[data-quote-select] [data-option="q1"]').trigger('click')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('КП уже импортирован')
    expect(confirmState.content).toBe('Добавить ещё раз?')
    expect(confirmState.okText).toBe('Добавить')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.importQuote).toHaveBeenCalledTimes(2)
    expect(api.importQuote).toHaveBeenLastCalledWith('c1', { quoteId: 'q1', targetDeclarationId: null, force: true })
    expect(router.currentRoute.value.path).toBe('/import-40/c1/dt/n1')
  })

  it('409 и отказ — второго запроса нет, окно остаётся', async () => {
    api.importQuote.mockRejectedValueOnce(conflict())
    await open()
    await w.get('[data-quote-select] [data-option="q1"]').trigger('click')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    confirmState.resolve(false)
    await flushPromises()
    expect(api.importQuote).toHaveBeenCalledTimes(1)
    expect(w.find('[data-modal]').exists()).toBe(true)
  })

  it('прочая ошибка импорта — без вопроса и без второго тоста (его показал перехватчик), окно остаётся', async () => {
    api.importQuote.mockRejectedValueOnce(Object.assign(new Error('400'), { response: { status: 400 } }))
    await open()
    await w.get('[data-quote-select] [data-option="q1"]').trigger('click')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(confirmState.open).toBe(false)
    expect(msg.error).not.toHaveBeenCalled()
    expect(w.find('[data-modal]').exists()).toBe(true)
  })

  it('список КП не загрузился — сообщение и «Повторить»', async () => {
    api.caseQuotes.mockRejectedValueOnce(new Error('500'))
    await open()
    expect(w.get('[data-quote-load-error]').text()).toContain('Не удалось загрузить список КП')
    await w.get('[data-quote-retry]').trigger('click')
    await flushPromises()
    expect(api.caseQuotes).toHaveBeenCalledTimes(2)
    expect(w.find('[data-quote-load-error]').exists()).toBe(false)
  })
})
