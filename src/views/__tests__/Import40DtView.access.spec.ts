import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'

// Хотфикс 09.10 (R1–R3, B2, B4): страница ДТ в режиме просмотра не шлёт PUT (печать бланка без сохранения,
// без автоповтора), а готовность КЕДЕН спрашивает только у тех, кого пускает сервер.

const api = vi.hoisted(() => ({
  get: vi.fn(),
  updateDeclaration: vi.fn(),
  blankPdf: vi.fn(),
  kedenReadiness: vi.fn(),
  ratesOnDate: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { caseId: 'case-1', dtId: 'dt-1' }, query: {}, path: '/import-40/case-1/dt/dt-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}))
vi.mock('@/api/import40', async (orig) => ({ ...(await orig<typeof import('@/api/import40')>()), import40Api: api }))
vi.mock('@/api/references', () => ({
  referencesApi: {
    listCountries: vi.fn().mockResolvedValue([]),
    listCustomsPosts: vi.fn().mockResolvedValue([]),
    listExpenseTypes: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('@/api/tnved', () => ({ tnvedApi: { currencies: vi.fn().mockResolvedValue({ data: [] }) } }))
vi.mock('@/api/import40Contract', () => ({ import40ContractApi: { getProfile: vi.fn().mockRejectedValue(new Error('403')) } }))
vi.mock('@/stores/classifiers', () => ({ useClassifiersStore: () => ({ loadMany: vi.fn().mockResolvedValue(undefined) }) }))

import { Modal } from 'ant-design-vue'
import Import40DtView from '../Import40DtView.vue'
import { useAuthStore } from '@/stores/auth'

const ME = 'user-me'

const STAMP = '2026-10-09T10:00:00.123456Z'
const decl = {
  id: 'dt-1',
  updatedAtUtc: STAMP,
  declarationNumber: '',
  goodsItems: [],
  doc44Items: [],
  prevDocItems: [],
  expenses: [],
  factPayments: [],
}
const theCase = (status: number, assignedDeclarantId: string | null) => ({
  id: 'case-1', number: 'И-1', clientName: 'ТОО', cargo: 'груз', clientId: null,
  status, assignedDeclarantId, declarations: [decl],
})

let w: VueWrapper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vm = () => w.vm as any

const mountAs = async (opts: { permissions: string[]; status: number; assigned: string | null; businessRoles?: string[] }) => {
  const auth = useAuthStore()
  auth.role = 'Employee'
  auth.permissions = opts.permissions
  auth.businessRoles = opts.businessRoles ?? []
  auth.userId = ME
  api.get.mockResolvedValue(theCase(opts.status, opts.assigned))
  w = mountWithI18n(Import40DtView, {
    shallow: true,
    global: { stubs: { 'router-link': true, 'a-tooltip': { template: '<span><slot /></span>' } } },
  })
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  for (const f of Object.values(api)) f.mockReset()
  api.updateDeclaration.mockRejectedValue(Object.assign(new Error('403'), { response: { status: 403 } }))
  api.blankPdf.mockResolvedValue({ blob: new Blob(['%PDF']), fileName: 'dt.pdf' })
  api.kedenReadiness.mockResolvedValue({ missing: [], filled: 0, total: 0, blankFilled: 3, blankTotal: 46, blankEmptyGraphs: [] })
  api.ratesOnDate.mockResolvedValue({ date: '', official: true, rates: {} })
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x')
  globalThis.URL.revokeObjectURL = vi.fn()
  vi.spyOn(window, 'open').mockImplementation(() => null)
})
afterEach(() => {
  w?.unmount()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Import40DtView — доступ и печать', () => {
  it('B2: декларант на чужой ДТ (статус 2) печатает бланк без сохранения и без автоповтора', async () => {
    await mountAs({ permissions: ['import40.declarant'], status: 2, assigned: 'user-other' })
    expect(vm().readOnly).toBe(true)

    await vm().printBlank()
    await flushPromises()
    expect(api.updateDeclaration).not.toHaveBeenCalled()
    expect(api.blankPdf).toHaveBeenCalledWith('case-1', 'dt-1')
    expect(window.open).toHaveBeenCalled()

    // saveDt в просмотре — ничего не делает, 15-секундный автоповтор не заводится
    await expect(vm().saveDt()).resolves.toBe(false)
    vi.advanceTimersByTime(60_000)
    await flushPromises()
    expect(api.updateDeclaration).not.toHaveBeenCalled()
  })

  it('B4: декларанту в просмотре готовность приходит (сервер пускает), тихим запросом', async () => {
    await mountAs({ permissions: ['import40.declarant'], status: 2, assigned: 'user-other' })
    expect(api.kedenReadiness).toHaveBeenCalledWith('case-1', 'dt-1', { silent: true })
    expect(vm().readiness?.blankFilled).toBe(3)
  })

  it('R1/B4: сотрудник без права import40.declarant — просмотр уже до «Декларирования», готовность не спрашиваем', async () => {
    await mountAs({ permissions: ['import40.read'], status: 0, assigned: null })
    expect(vm().readOnly).toBe(true)
    expect(api.kedenReadiness).not.toHaveBeenCalled()
    expect(vm().readiness).toBeNull()

    await vm().printBlank()
    await flushPromises()
    expect(api.updateDeclaration).not.toHaveBeenCalled()
    expect(api.blankPdf).toHaveBeenCalled()
  })

  it('назначенный декларант: перед печатью сохраняет; ошибка сохранения — без печати', async () => {
    await mountAs({ permissions: ['import40.declarant'], status: 2, assigned: ME })
    expect(vm().readOnly).toBe(false)

    await vm().printBlank()
    await flushPromises()
    expect(api.updateDeclaration).toHaveBeenCalledOnce()
    expect(api.blankPdf).not.toHaveBeenCalled()

    api.updateDeclaration.mockResolvedValue(decl)
    await vm().printBlank()
    await flushPromises()
    expect(api.blankPdf).toHaveBeenCalledOnce()
  })

  it('XML в просмотре доступен декларанту (сервер пускает по CanManageDeclarations), без сохранения', async () => {
    await mountAs({ permissions: ['import40.declarant'], status: 2, assigned: 'user-other' })
    expect(vm().readOnly).toBe(true)
    expect(w.find('[data-dt-xml]').exists()).toBe(true)
  })

  it('решение 09.10: РОП (роль rop, даже без права декларанта) правит чужую ДТ после выпуска', async () => {
    await mountAs({ permissions: ['import40.read'], businessRoles: ['kpp', 'rop'], status: 8, assigned: 'user-other' })
    expect(vm().readOnly).toBe(false)
    expect(vm().showDtsSection).toBe(true)
    expect(api.kedenReadiness).toHaveBeenCalled()
  })
})

describe('Import40DtView — оптимистичная блокировка', () => {
  const conflictError = () => Object.assign(new Error('409'), {
    response: { status: 409, data: { detail: 'ДТ изменена в другом окне или другим пользователем — перезагрузите' } },
  })

  it('PUT несёт отметку ДТ, следующий — отметку из ответа сервера', async () => {
    await mountAs({ permissions: ['import40.declarant'], status: 2, assigned: ME })
    api.updateDeclaration.mockResolvedValueOnce({ ...decl, updatedAtUtc: '2026-10-09T10:05:00.654321Z' })
    api.updateDeclaration.mockResolvedValueOnce({ ...decl, updatedAtUtc: '2026-10-09T10:06:00.000001Z' })

    await expect(vm().saveDt(true)).resolves.toBe(true)
    await expect(vm().saveDt(true)).resolves.toBe(true)
    expect(api.updateDeclaration.mock.calls[0][2].expectedUpdatedAtUtc).toBe(STAMP)
    expect(api.updateDeclaration.mock.calls[1][2].expectedUpdatedAtUtc).toBe('2026-10-09T10:05:00.654321Z')
  })

  it('(ревью 09.10) сохранения по очереди: печать во время автосейва ждёт его и шлёт отметку из его ответа — без 409', async () => {
    await mountAs({ permissions: ['import40.declarant'], status: 2, assigned: ME })
    let release!: (v: unknown) => void
    api.updateDeclaration.mockImplementationOnce(() => new Promise((r) => { release = r }))
    api.updateDeclaration.mockResolvedValueOnce({ ...decl, updatedAtUtc: '2026-10-09T10:07:00.000002Z' })

    const autosave = vm().saveDt(true)
    const print = vm().printBlank()
    await flushPromises()
    expect(api.updateDeclaration).toHaveBeenCalledOnce() // второй PUT не ушёл, пока идёт первый

    release({ ...decl, updatedAtUtc: '2026-10-09T10:06:30.111111Z' })
    await expect(autosave).resolves.toBe(true)
    await print
    await flushPromises()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(2)
    expect(api.updateDeclaration.mock.calls[0][2].expectedUpdatedAtUtc).toBe(STAMP)
    expect(api.updateDeclaration.mock.calls[1][2].expectedUpdatedAtUtc).toBe('2026-10-09T10:06:30.111111Z')
    expect(api.blankPdf).toHaveBeenCalledOnce()
    expect(vm().conflict).toBe(false)
  })

  it('409: плашка «ДТ изменена в другом окне», без автоповтора и автосейва; «Перезагрузить» перечитывает ДТ', async () => {
    await mountAs({ permissions: ['import40.declarant'], status: 2, assigned: ME })
    api.updateDeclaration.mockRejectedValue(conflictError())

    await expect(vm().saveDt(true)).resolves.toBe(false)
    await flushPromises()
    expect(vm().conflict).toBe(true)
    expect(w.find('[data-dt-conflict]').exists()).toBe(true)

    // Правка на экране после 409 не уходит ни автосейвом, ни автоповтором.
    vm().dtForm.declarationNumber = 'X'
    await flushPromises()
    vi.advanceTimersByTime(60_000)
    await flushPromises()
    expect(api.updateDeclaration).toHaveBeenCalledOnce()
    await expect(vm().saveDt()).resolves.toBe(false)
    expect(api.updateDeclaration).toHaveBeenCalledOnce()

    // Есть несохранённое — сначала подтверждение; «Перезагрузить» — ДТ перечитывается, плашка уходит.
    const confirm = vi.spyOn(Modal, 'confirm').mockImplementation(((o: { onOk: () => unknown }) => { void o.onOk() }) as never)
    api.get.mockClear()
    await vm().reloadAfterConflict()
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(api.get).toHaveBeenCalledOnce()
    expect(vm().conflict).toBe(false)
    expect(vm().dirty).toBe(false)
    expect(w.find('[data-dt-conflict]').exists()).toBe(false)
  })
})
