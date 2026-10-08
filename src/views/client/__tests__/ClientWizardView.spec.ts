import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40CaseDto } from '@/api/import40'
import { confirmState } from '@/ui/confirm'
import { caseDto, fileDto } from './caseFixture'

const api = vi.hoisted(() => ({
  get: vi.fn(), create: vi.fn(), update: vi.fn(), addContainer: vi.fn(), updateContainer: vi.fn(), deleteContainer: vi.fn(),
  listFiles: vi.fn(), uploadFile: vi.fn(), deleteFile: vi.fn(), action: vi.fn(),
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
  api.listFiles.mockResolvedValue([])
  api.action.mockImplementation(async () => ({ ...server, status: 1 }))
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

  it('уход во время создания черновика — без вопроса «введённое пропадёт», без возврата в мастер, черновик сохранён', async () => {
    let release!: () => void
    api.create.mockImplementationOnce((body: { cargo: string; post: string }) => new Promise((r) => {
      release = () => {
        server = { ...server, cargo: body.cargo, post: body.post }
        r(server)
      }
    }))
    await mountAt('/import-40/new')
    await w.get('[data-wz-cargo]').setValue('Ноутбуки Lenovo')
    await w.get('[data-wz-next]').trigger('click')
    await flushPromises()
    expect(api.create).toHaveBeenCalledTimes(1)

    const replace = vi.spyOn(router, 'replace')
    const nav = router.push('/import-40')
    await flushPromises()
    expect(confirmState.open).toBe(false)
    release()
    await nav
    await flushPromises()

    expect(confirmState.open).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/import-40')
    expect(replace).not.toHaveBeenCalled()
    expect(api.update).toHaveBeenCalledTimes(1)
    expect(api.update.mock.calls[0][1]).toMatchObject({ cargo: 'Ноутбуки Lenovo', clientReceiverName: 'ТОО «Ромашка»' })
    expect(api.create).toHaveBeenCalledTimes(1)
  })

  it('/new → черновик создан, адрес /new/:id → правка → уход: PUT с правкой', async () => {
    await mountAt('/import-40/new')
    await w.get('[data-wz-cargo]').setValue('Ноутбуки Lenovo')
    await w.get('[data-wz-next]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40/new/c1')
    api.update.mockClear()

    await w.get('[data-wz-vehicle]').setValue('123ABC01')
    await router.push('/import-40')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40')
    expect(confirmState.open).toBe(false)
    expect(api.update).toHaveBeenCalledTimes(1)
    expect(api.update.mock.calls[0][1]).toMatchObject({ vehicleNumber: '123ABC01' })
  })

  it('после размонтирования страж снят: переход ничего не сохраняет', async () => {
    server = caseDto({ id: 'c1', status: 0, cargo: 'Станки', clientSenderName: 'Lenovo', clientReceiverName: 'ТОО «Ромашка»' })
    await mountAt('/import-40/new/c1')
    await w.get('[data-wz-step="cargo"]').trigger('click')
    await w.get('[data-wz-cargo]').setValue('Станки ЧПУ')
    w.unmount()
    await router.push('/import-40')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 900))
    expect(router.currentRoute.value.fullPath).toBe('/import-40')
    expect(api.update).not.toHaveBeenCalled()
    expect(confirmState.open).toBe(false)
  })

  describe('шаг 4 «Документы» и отправка', () => {
    const fullDraft = () => caseDto({
      id: 'c1', number: 'ИМ-2026-0184', status: 0, cargo: 'Станки', vehicleNumber: '123ABC01',
      clientSenderName: 'Lenovo', clientReceiverName: 'ТОО «Ромашка»',
    })
    const submitBtn = () => w.get('[data-wz-submit]')
    const vmDraft = () => (w.vm as unknown as { draft: { cargo: string } }).draft
    const pickInvoice = async (name: string) => {
      const input = w.get('[data-doc-kind="invoice"] [data-doc-input]')
      Object.defineProperty(input.element, 'files', { value: [new File(['%PDF'], name)], configurable: true })
      await input.trigger('change')
      await flushPromises()
    }

    it('кнопка отправки неактивна без файла и без отметки ответственности', async () => {
      server = fullDraft()
      await mountAt('/import-40/new/c1')
      expect(w.find('[data-step="docs"]').exists()).toBe(true)
      expect(w.find('[data-wz-next]').exists()).toBe(false)
      expect(submitBtn().text()).toBe('Отправить на оформление')
      expect(submitBtn().attributes('disabled')).toBeDefined()
      expect(w.get('[data-wz-submit-why]').text()).toBe('Приложите хотя бы один документ')

      // Отметка есть, файла нет — всё ещё нельзя (сервер требует ≥ 1 файла).
      await w.get('[data-docs-resp]').trigger('click')
      expect(submitBtn().attributes('disabled')).toBeDefined()
      await w.get('[data-docs-resp]').trigger('click')

      api.uploadFile.mockResolvedValue(fileDto({ id: 'up1', docKind: 'invoice', originalFileName: 'inv.pdf' }))
      const input = w.get('[data-doc-kind="invoice"] [data-doc-input]')
      Object.defineProperty(input.element, 'files', { value: [new File(['%PDF'], 'inv.pdf')], configurable: true })
      await input.trigger('change')
      await flushPromises()
      expect(submitBtn().attributes('disabled')).toBeDefined()
      expect(w.get('[data-wz-submit-why]').text()).toBe('Отметьте, что документы полные и достоверные')

      await w.get('[data-docs-resp]').trigger('click')
      expect(submitBtn().attributes('disabled')).toBeUndefined()
      expect(w.find('[data-wz-submit-why]').exists()).toBe(false)
      expect(api.action).not.toHaveBeenCalled()
    })

    it('не хватает обязательных — вопрос со списком; «Приложить» — к строке, «Отправить» — отправка и карточка', async () => {
      server = fullDraft()
      api.listFiles.mockResolvedValue([fileDto({ id: 'f1', docKind: 'invoice', originalFileName: 'inv.pdf' })])
      await mountAt('/import-40/new/c1')
      await w.get('[data-docs-resp]').trigger('click')

      await submitBtn().trigger('click')
      await flushPromises()
      expect(confirmState.open).toBe(true)
      expect(confirmState.title).toBe('Не приложены: Транспортный документ, Упаковочный лист, Внешнеторговый контракт')
      expect(confirmState.content).toBe('Отправить без них? Декларант запросит недостающее.')
      expect(confirmState.okText).toBe('Отправить')
      expect(confirmState.cancelText).toBe('Приложить')
      confirmState.resolve(false)
      await flushPromises()
      expect(api.action).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(w.get('[data-doc-kind="transport"] [data-doc-attach]').element)

      await submitBtn().trigger('click')
      await flushPromises()
      confirmState.resolve(true)
      await flushPromises()
      expect(api.action).toHaveBeenCalledWith('c1', 'submit-for-processing')
      expect(msg.success).toHaveBeenCalledWith('Поставка отправлена на оформление')
      expect(router.currentRoute.value.fullPath).toBe('/import-40/c1')
      expect(confirmState.open).toBe(false)
      expect(api.update).not.toHaveBeenCalled()
    })

    it('все обязательные приложены — без вопроса; несохранённое уходит до отправки, не сохранилось — не отправляем', async () => {
      server = fullDraft()
      api.listFiles.mockResolvedValue(['invoice', 'transport', 'packing', 'contract'].map((k, i) =>
        fileDto({ id: `f${i}`, docKind: k, originalFileName: `${k}.pdf` })))
      await mountAt('/import-40/new/c1')
      await w.get('[data-wz-step="cargo"]').trigger('click')
      await w.get('[data-wz-cargo]').setValue('Станки ЧПУ')
      // Сохранение при смене шага и первое при отправке не прошли — правка всё ещё не на сервере.
      api.update.mockRejectedValueOnce(new Error('net')).mockRejectedValueOnce(new Error('net'))
      await w.get('[data-wz-step="docs"]').trigger('click')
      await flushPromises()
      await w.get('[data-docs-resp]').trigger('click')

      await submitBtn().trigger('click')
      await flushPromises()
      expect(confirmState.open).toBe(false)
      expect(msg.error).toHaveBeenCalledWith('Черновик не сохранился, поставка не отправлена — повторите')
      expect(api.action).not.toHaveBeenCalled()

      await submitBtn().trigger('click')
      await flushPromises()
      expect(api.update).toHaveBeenCalledTimes(3)
      expect(api.update.mock.calls[2][1]).toMatchObject({ cargo: 'Станки ЧПУ' })
      expect(api.action).toHaveBeenCalledTimes(1)
      expect(api.update.mock.invocationCallOrder[2]).toBeLessThan(api.action.mock.invocationCallOrder[0])
      expect(router.currentRoute.value.fullPath).toBe('/import-40/c1')
    })

    it('сервер отклонил отправку — остаёмся в мастере, кнопка доступна, страж снова охраняет', async () => {
      server = fullDraft()
      api.listFiles.mockResolvedValue(['invoice', 'transport', 'packing', 'contract'].map((k, i) =>
        fileDto({ id: `f${i}`, docKind: k, originalFileName: `${k}.pdf` })))
      api.action.mockRejectedValueOnce(new Error('400'))
      await mountAt('/import-40/new/c1')
      await w.get('[data-docs-resp]').trigger('click')
      await submitBtn().trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.fullPath).toBe('/import-40/new/c1')
      expect(msg.success).not.toHaveBeenCalled()
      expect(submitBtn().attributes('disabled')).toBeUndefined()

      // Несохраняемая правка и уход — страж спрашивает (leaving не остался взведённым).
      vmDraft().cargo = 'Станки ЧПУ'
      api.update.mockRejectedValue(new Error('net'))
      const nav = router.push('/import-40')
      await flushPromises()
      expect(confirmState.open).toBe(true)
      confirmState.resolve(false)
      await nav
      expect(router.currentRoute.value.fullPath).toBe('/import-40/new/c1')
    })

    it('после отправки страж не спрашивает и не сохраняет, даже если черновик «грязный»', async () => {
      server = fullDraft()
      api.listFiles.mockResolvedValue(['invoice', 'transport', 'packing', 'contract'].map((k, i) =>
        fileDto({ id: `f${i}`, docKind: k, originalFileName: `${k}.pdf` })))
      await mountAt('/import-40/new/c1')
      await w.get('[data-docs-resp]').trigger('click')
      // Пока шла отправка, черновик стал «грязным», а сохранение не проходит: без leaving страж спросил бы «Уйти?».
      api.action.mockImplementationOnce(async () => {
        vmDraft().cargo = 'Станки ЧПУ'
        api.update.mockRejectedValue(new Error('net'))
        return { ...server, status: 1 }
      })
      await submitBtn().trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.fullPath).toBe('/import-40/c1')
      expect(confirmState.open).toBe(false)
      expect(api.update).not.toHaveBeenCalled()
    })

    it('переход после отправки сорвался — страж снова охраняет', async () => {
      server = fullDraft()
      api.listFiles.mockResolvedValue(['invoice', 'transport', 'packing', 'contract'].map((k, i) =>
        fileDto({ id: `f${i}`, docKind: k, originalFileName: `${k}.pdf` })))
      await mountAt('/import-40/new/c1')
      await w.get('[data-docs-resp]').trigger('click')
      // Чужой страж отменяет переход на карточку.
      const stop = router.beforeEach((to) => to.fullPath !== '/import-40/c1')
      await submitBtn().trigger('click')
      await flushPromises()
      stop()
      expect(api.action).toHaveBeenCalledTimes(1)
      expect(router.currentRoute.value.fullPath).toBe('/import-40/new/c1')

      vmDraft().cargo = 'Станки ЧПУ'
      api.update.mockRejectedValue(new Error('net'))
      const nav = router.push('/import-40')
      await flushPromises()
      expect(confirmState.open).toBe(true)
      confirmState.resolve(false)
      await nav
    })

    it('загрузка закончилась, пока клиент был на другом шаге: файл в списке, отправка доступна', async () => {
      server = fullDraft()
      await mountAt('/import-40/new/c1')
      await w.get('[data-docs-resp]').trigger('click')
      let release!: () => void
      api.uploadFile.mockImplementationOnce(() => new Promise((r) => {
        release = () => r(fileDto({ id: 'up1', docKind: 'invoice', originalFileName: 'inv.pdf' }))
      }))
      await pickInvoice('inv.pdf')
      expect(w.get('[data-wz-submit-why]').text()).toBe('Дождитесь, пока файлы загрузятся')

      await w.get('[data-wz-back]').trigger('click')
      await flushPromises()
      expect(w.find('[data-step="parties"]').exists()).toBe(true)
      release()
      await flushPromises()

      await w.get('[data-wz-next]').trigger('click')
      await flushPromises()
      expect(w.get('[data-doc-kind="invoice"]').text()).toContain('inv.pdf')
      expect(submitBtn().attributes('disabled')).toBeUndefined()
    })

    it('сбой загрузки, пока клиент был на другом шаге: ошибка в строке и «Повторить» на месте', async () => {
      server = fullDraft()
      await mountAt('/import-40/new/c1')
      let fail!: () => void
      api.uploadFile.mockImplementationOnce(() => new Promise((_r, reject) => {
        fail = () => reject({ response: { status: 400, data: { error: 'Файл повреждён' } } })
      }))
      await pickInvoice('inv.pdf')
      await w.get('[data-wz-back]').trigger('click')
      await flushPromises()
      fail()
      await flushPromises()

      await w.get('[data-wz-next]').trigger('click')
      await flushPromises()
      const row = w.get('[data-doc-kind="invoice"]')
      expect(row.get('[data-doc-error]').text()).toContain('inv.pdf: Файл повреждён')
      expect(row.find('[data-doc-retry]').exists()).toBe(true)
      expect(submitBtn().attributes('disabled')).toBeDefined()
      expect(w.get('[data-wz-submit-why]').text()).toBe('Приложите хотя бы один документ')
    })
  })
})
