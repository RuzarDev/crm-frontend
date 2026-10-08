import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { Import40CaseDto, Import40FileDto } from '@/api/import40'
import type { DeclarationReadiness } from '@/types/api'
import { confirmState } from '@/ui/confirm'
import type { CaseAuth } from '../casePermissions'
import { USERS, caseDto, declaration, fileDto } from './caseFixture'
import { mountStep } from './stepHarness'

const api = vi.hoisted(() => ({
  action: vi.fn(), createDeclaration: vi.fn(), deleteDeclaration: vi.fn(), downloadKedenXml: vi.fn(), downloadKedenBatch: vi.fn(),
  extractBatch: vi.fn(), caseQuotes: vi.fn(), importQuote: vi.fn(), kedenReadiness: vi.fn(), kedenReadinessSummary: vi.fn(),
}))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
vi.mock('@/ui/message', () => ({ message: msg }))

import StepDeclaring from '../steps/StepDeclaring.vue'

const DropdownStub = {
  props: ['items'], emits: ['select'],
  template: '<div data-dropdown><slot /><button v-for="it in items" :key="it.key" type="button" :data-menu-item="it.key" @click="$emit(\'select\', it.key)">{{ it.label }}</button></div>',
}
const ModalStub = { props: ['open'], template: '<div v-if="open" data-modal><slot /></div>' }

let w: VueWrapper
let router: Router
const mount = (user: CaseAuth, o: { kase?: Partial<Import40CaseDto>; readiness?: DeclarationReadiness[] | null; files?: Import40FileDto[]; mode?: 'current' | 'done' } = {}) => {
  const m = mountStep(StepDeclaring, {
    user, step: 3, mode: o.mode ?? 'current', kase: { status: 2, ...o.kase }, readiness: o.readiness ?? null, files: o.files ?? [],
    plugins: [router], stubs: { ZDropdown: DropdownStub, ZModal: ModalStub },
  })
  w = m.w
  return m
}
const tipOf = (selector: string) => w.get(selector).element.closest('[data-tip]')!.getAttribute('data-title')
const leftItems = () => w.findAll('[data-left-item]').map((li) => [li.text().replace(/ — (сделано|не сделано)$/, ''), li.attributes('data-left-done')])

const rd = (o: Partial<DeclarationReadiness> & { declarationId: string }): DeclarationReadiness =>
  ({ declarationNumber: '', isReady: false, missing: [], filled: 0, total: 22, ...o })
const docs = (n: number) => Array.from({ length: n }, (_, i) => fileDto({ id: `f${i}` }))

beforeEach(async () => {
  const stub = { template: '<div/>' }
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/import-40/:id', component: stub }, { path: '/import-40/:id/dt/:dtId', component: stub }] })
  await router.push('/import-40/c1')
  api.action.mockResolvedValue(caseDto({ status: 3 }))
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('StepDeclaring: «Что осталось до подачи»', () => {
  const dts = [declaration({ id: 'd1' }), declaration({ id: 'd2', declarationNumber: '55210/031026/0012240' })]

  it.each([
    {
      name: 'ДТ есть, одна не готова, документы есть, проблема',
      kase: { declarations: dts, isProblem: true },
      readiness: [rd({ declarationId: 'd1', filled: 15 }), rd({ declarationId: 'd2', isReady: true, filled: 22 })],
      files: docs(4),
      items: [['ДТ создана', 'true'], ['Заполнить ДТ 1 — 15 из 22 граф', 'false'], ['Документы клиента — 4 файла', 'true'], ['Снять запрос таможни', 'false']],
    },
    {
      name: 'ничего нет: ни ДТ, ни документов, сводки нет',
      kase: {},
      readiness: null,
      files: [],
      items: [['Создать ДТ', 'false'], ['Нет документов клиента', 'false']],
    },
    {
      name: 'всё готово',
      kase: { declarations: dts },
      readiness: [rd({ declarationId: 'd1', isReady: true, filled: 22 }), rd({ declarationId: 'd2', isReady: true, filled: 22 })],
      files: docs(1),
      items: [['ДТ создана', 'true'], ['Документы клиента — 1 файл', 'true']],
    },
    {
      name: 'обе ДТ не готовы, номер в подписи; документов нет',
      kase: { declarations: dts },
      readiness: [rd({ declarationId: 'd1', filled: 3 }), rd({ declarationId: 'd2', filled: 20 })],
      files: [fileDto({ section: 'svh-invoice' })],
      items: [['ДТ создана', 'true'], ['Заполнить ДТ 1 — 3 из 22 граф', 'false'], ['Заполнить 55210/031026/0012240 — 20 из 22 граф', 'false'], ['Нет документов клиента', 'false']],
    },
  ])('$name', ({ kase, readiness, files, items }) => {
    mount(USERS.declarant, { kase, readiness, files })
    expect(leftItems()).toEqual(items)
  })

  it('«Подать ДТ» не блокируется готовностью: подтверждение «Подать ДТ в КЕДЕН?», затем submit-declaration и тост', async () => {
    mount(USERS.declarant, { kase: { declarations: dts }, readiness: [rd({ declarationId: 'd1', filled: 3 })] })
    const btn = w.get('[data-declaring-submit]')
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    expect(confirmState.title).toBe('Подать ДТ в КЕДЕН?')
    expect(api.action).not.toHaveBeenCalled()
    confirmState.resolve(true)
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'submit-declaration', undefined, undefined)
    expect(msg.success).toHaveBeenCalledWith('ДТ подана')
  })

  it('отказ в подтверждении — действия нет', async () => {
    mount(USERS.declarant, { kase: { declarations: dts } })
    await w.get('[data-declaring-submit]').trigger('click')
    confirmState.resolve(false)
    await flushPromises()
    expect(api.action).not.toHaveBeenCalled()
  })

  it('без ДТ «Подать ДТ» выключена с подсказкой; без права декларанта — «Действие выполняет декларант»', () => {
    mount(USERS.declarant)
    expect(w.get('[data-declaring-submit]').attributes('disabled')).toBeDefined()
    expect(tipOf('[data-declaring-submit]')).toBe('Сначала создайте хотя бы одну ДТ')
    w.unmount()
    mount(USERS.accountant, { kase: { declarations: dts } })
    expect(w.get('[data-declaring-submit]').attributes('disabled')).toBeDefined()
    expect(tipOf('[data-declaring-submit]')).toBe('Действие выполняет декларант')
    expect(w.get('[data-declaring-return]').attributes('disabled')).toBeDefined()
  })

  it('шаг ведёт другой декларант: «Заявку ведёт …»', () => {
    mount(USERS.declarant, { kase: { declarations: dts, assignedDeclarantId: 'u2', assignedDeclarantName: 'Айгерим К.' } })
    expect(w.get('[data-declaring-submit]').attributes('disabled')).toBeDefined()
    expect(tipOf('[data-declaring-submit]')).toBe('Заявку ведёт Айгерим К.')
  })

  it('«Вернуть клиенту» открывает окно причины', async () => {
    const m = mount(USERS.declarant)
    await w.get('[data-declaring-return]').trigger('click')
    expect((m.w.vm as unknown as { reasonKind: string }).reasonKind).toBe('return')
  })
})

describe('StepDeclaring: ДТ подана (статус 3)', () => {
  it('«Зафиксировать выпуск»: подтверждение, release-declaration; без «Что осталось» и «Вернуть клиенту»', async () => {
    api.action.mockResolvedValue(caseDto({ status: 4 }))
    mount(USERS.declarant, { kase: { status: 3, declarations: [declaration()] } })
    expect(w.find('[data-whats-left]').exists()).toBe(false)
    expect(w.find('[data-declaring-return]').exists()).toBe(false)
    expect(w.find('[data-declaring-submit]').exists()).toBe(false)
    expect(w.get('[data-declaring-submitted]').text()).toContain('ДТ подана в КЕДЕН')
    await w.get('[data-declaring-release]').trigger('click')
    expect(confirmState.title).toBe('Зафиксировать выпуск?')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'release-declaration', undefined, undefined)
    expect(msg.success).toHaveBeenCalledWith('Выпуск зафиксирован')
  })

  it('после выпуска (mode done): ДТ списком только для чтения — «Открыть», без правки', () => {
    mount(USERS.declarant, { kase: { status: 5, declarations: [declaration(), declaration({ id: 'd2' })] }, mode: 'done' })
    expect(w.findAll('[data-dt-open]')).toHaveLength(2)
    expect(w.get('[data-dt-open]').attributes('href')).toBe('/import-40/c1/dt/d1')
    for (const sel of ['[data-dt-fill]', '[data-dt-xml]', '[data-dt-more]', '[data-dt-toolbar]', '[data-dt-xml-batch]', '[data-declaring-release]', '[data-whats-left]']) {
      expect(w.find(sel).exists()).toBe(false)
    }
  })
})
