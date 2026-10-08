import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import type { Import40CaseDto, Import40FileDto } from '@/api/import40'
import { confirmState } from '@/ui/confirm'
import type { CaseAuth } from '../casePermissions'
import { USERS, caseDto, fileDto } from './caseFixture'
import { mountStep } from './stepHarness'

const api = vi.hoisted(() => ({
  update: vi.fn(), action: vi.fn(), addContainer: vi.fn(), deleteContainer: vi.fn(), uploadFile: vi.fn(), deleteFile: vi.fn(), downloadFile: vi.fn(),
}))
const refs = vi.hoisted(() => ({ listCountries: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))
vi.mock('@/ui/message', () => ({ message: msg }))

import StepDraft from '../steps/StepDraft.vue'

let w: VueWrapper
let state: { kase: Import40CaseDto; files: Import40FileDto[] }
const mount = (user: CaseAuth, kase: Partial<Import40CaseDto> = {}, files: Import40FileDto[] = [], mode: 'current' | 'done' = 'current') => {
  const m = mountStep(StepDraft, { user, step: 1, mode, kase: { status: 0, containers: [], ...kase }, files })
  w = m.w
  state = m.state
}
const field = (name: string) => w.get(`[data-draft-field="${name}"]`)
const edit = async (name: string, value: string, how: 'blur' | 'enter' = 'blur') => {
  const el = field(name)
  await el.setValue(value)
  await el.trigger(how === 'blur' ? 'blur' : 'keydown', how === 'enter' ? { key: 'Enter' } : undefined)
  await flushPromises()
}

beforeEach(() => {
  api.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({ ...state.kase, ...patch }))
  api.action.mockResolvedValue(caseDto())
  api.addContainer.mockResolvedValue(caseDto())
  api.deleteContainer.mockResolvedValue(caseDto())
  refs.listCountries.mockResolvedValue([{ code: 'CN', name: 'Китай' }])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('StepDraft — кто видит правку и отправку', () => {
  it.each([['администратор', USERS.admin], ['декларант', USERS.declarant], ['руководитель', USERS.rop]])('%s ведёт черновик: поля и «Отправить на оформление»', (_n, user) => {
    mount(user)
    expect(w.find('[data-draft-form]').exists()).toBe(true)
    expect(w.find('[data-draft-submit]').exists()).toBe(true)
  })

  it.each([['КПП', USERS.kpp], ['бухгалтер', USERS.accountant]])('%s видит шаг в режиме чтения: ни полей, ни отправки', (_n, user) => {
    mount(user, { cargo: 'Ноутбуки' }, [fileDto()])
    expect(w.find('[data-draft-form]').exists()).toBe(false)
    expect(w.find('[data-draft-submit]').exists()).toBe(false)
    expect(w.find('[data-slot-upload]').exists()).toBe(false)
    expect(w.get('[data-draft-row="cargo"]').text()).toBe('Ноутбуки')
    expect(w.findAll('[data-slot-file]')).toHaveLength(1)
  })

  it('пройденный шаг (mode done) — только чтение, даже у администратора; данные от клиента и контейнеры на месте', async () => {
    mount(USERS.admin, { status: 2, containers: [{ id: 'k1', containerNumber: 'MRSU 488584 9', containerType: '40HC', notes: '' }] }, [fileDto()], 'done')
    await flushPromises()
    expect(w.find('[data-draft-form]').exists()).toBe(false)
    expect(w.find('[data-draft-submit]').exists()).toBe(false)
    expect(w.find('[data-draft-container-remove]').exists()).toBe(false)
    expect(w.get('[data-draft-container]').text()).toContain('MRSU 488584 9')
    expect(w.get('[data-client-row="sender"]').text()).toContain('Lenovo PC HK Ltd')
    expect(w.get('[data-slot-download]').exists()).toBe(true)
  })
})

describe('StepDraft — сохранение полей', () => {
  it('blur с новым значением шлёт PUT с одним полем; ответ заменяет заявку, перечитывания нет', async () => {
    mount(USERS.declarant, { cargo: 'Ноутбуки' })
    await edit('cargo', '  Телефоны  ')
    expect(api.update).toHaveBeenCalledWith('c1', { cargo: 'Телефоны' })
    expect(state.kase.cargo).toBe('Телефоны')
    expect((field('cargo').element as HTMLInputElement).value).toBe('Телефоны')
  })

  it('Enter сохраняет так же; без изменений запроса нет', async () => {
    mount(USERS.declarant, { post: 'Хоргос' })
    await edit('post', 'Алтынколь', 'enter')
    expect(api.update).toHaveBeenCalledWith('c1', { post: 'Алтынколь' })
    api.update.mockClear()
    await edit('post', 'Алтынколь')
    expect(api.update).not.toHaveBeenCalled()
  })

  it('(баг) пустой груз не отправляется и не откатывается молча: под полем «Нельзя оставить пустым», ввод снимает подсказку', async () => {
    mount(USERS.declarant, { cargo: 'Ноутбуки' })
    await edit('cargo', '')
    expect(api.update).not.toHaveBeenCalled()
    expect(w.text()).toContain('Нельзя оставить пустым')
    expect((field('cargo').element as HTMLInputElement).value).toBe('')
    await field('cargo').setValue('Т')
    expect(w.text()).not.toContain('Нельзя оставить пустым')
  })

  it('прицеп можно очистить — пустое значение уходит на сервер', async () => {
    mount(USERS.declarant, { transportMode: 1, trailerNumber: '12 KZ 3456' })
    await edit('trailerNumber', '')
    expect(api.update).toHaveBeenCalledWith('c1', { trailerNumber: '' })
    expect(w.text()).not.toContain('Нельзя оставить пустым')
  })

  it('телефон водителя: пустое нельзя; поля по виду транспорта меняются вместе с видом', async () => {
    mount(USERS.declarant, { transportMode: 1, driverPhone: '+7 700 111 22 33' })
    expect(w.findAll('[data-draft-mode-fields] [data-draft-field]').map((e) => e.attributes('data-draft-field'))).toEqual(['vehicleNumber', 'trailerNumber', 'driverPhone'])
    await edit('driverPhone', '')
    expect(api.update).not.toHaveBeenCalled()
    expect(w.text()).toContain('Нельзя оставить пустым')
    const rail = w.findAll('[data-draft-mode] button').find((b) => b.text() === 'ЖД')!
    await rail.trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith('c1', { transportMode: 0 })
    expect(w.findAll('[data-draft-mode-fields] [data-draft-field]').map((e) => e.attributes('data-draft-field'))).toEqual(['wagonNumber', 'station'])
  })

  it('сохранение по blur во время другого действия не теряется: ждёт замок и доходит до PUT', async () => {
    mount(USERS.declarant, { cargo: 'Ноутбуки' })
    let release!: () => void
    api.action.mockImplementationOnce(() => new Promise((r) => { release = () => r(caseDto()) }))
    const wrapper = w.vm as unknown as { actions: { run: (a: string) => Promise<boolean>; busy: () => boolean } }
    const running = wrapper.actions.run('claim')
    await flushPromises()
    expect(wrapper.actions.busy()).toBe(true)
    await edit('cargo', 'Телефоны')
    expect(api.update).not.toHaveBeenCalled()
    release()
    await running
    await vi.waitFor(() => expect(api.update).toHaveBeenCalledWith('c1', { cargo: 'Телефоны' }))
    expect(state.kase.cargo).toBe('Телефоны')
  })

  it('замок не освободился за 10 с — правка не уходит, тост «Не сохранено…», значение остаётся в поле', async () => {
    vi.useFakeTimers()
    try {
      mount(USERS.declarant, { cargo: 'Ноутбуки' })
      api.action.mockImplementationOnce(() => new Promise(() => {}))
      const wrapper = w.vm as unknown as { actions: { run: (a: string) => Promise<boolean>; busy: () => boolean } }
      void wrapper.actions.run('claim')
      await flushPromises()
      const el = field('cargo')
      await el.setValue('Телефоны')
      await el.trigger('blur')
      await vi.advanceTimersByTimeAsync(10_100)
      expect(api.update).not.toHaveBeenCalled()
      expect(msg.warning).toHaveBeenCalledWith('Не сохранено: идёт другое действие. Повторите правку чуть позже')
      expect((field('cargo').element as HTMLInputElement).value).toBe('Телефоны')
    } finally {
      vi.useRealTimers()
    }
  })

  it('телефон водителя: «+7» без номера — «Нельзя оставить пустым», без PUT; тот же номер — без PUT', async () => {
    mount(USERS.declarant, { transportMode: 1, driverPhone: '+77001112233' })
    await edit('driverPhone', '+7')
    expect(api.update).not.toHaveBeenCalled()
    expect(w.text()).toContain('Нельзя оставить пустым')
    await edit('driverPhone', '+7 700 111 22 33')
    expect(api.update).not.toHaveBeenCalled()
  })

  it('непринятая правка не затирается перечитыванием заявки, пока поле не сохранено', async () => {
    mount(USERS.declarant, { cargo: 'Ноутбуки', post: 'Хоргос' })
    await field('cargo').setValue('Телефоны')
    state.kase = { ...state.kase, post: 'Алтынколь' } // перечитали: пост изменился на сервере, груз — нет
    await flushPromises()
    expect((field('cargo').element as HTMLInputElement).value).toBe('Телефоны')
    expect((field('post').element as HTMLInputElement).value).toBe('Алтынколь')
  })
})

describe('StepDraft — контейнеры', () => {
  const kase = { containers: [{ id: 'k1', containerNumber: 'MRSU 488584 9', containerType: '40HC', notes: '' }] }

  it('добавление: тело как раньше (номер, тип или null), поля очищаются, тост', async () => {
    mount(USERS.declarant, kase)
    const add = w.get('[data-draft-container-add-btn]')
    expect(add.attributes('disabled')).toBeDefined()
    await w.get('[data-draft-container-number] , input[data-draft-container-number]').setValue(' TGHU 310224 1 ')
    await add.trigger('click')
    await flushPromises()
    expect(api.addContainer).toHaveBeenCalledWith('c1', { containerNumber: 'TGHU 310224 1', containerType: null, notes: null })
    expect(msg.success).toHaveBeenCalledWith('Контейнер добавлен')
  })

  it('«×» спрашивает подтверждение и удаляет контейнер', async () => {
    mount(USERS.declarant, kase)
    await w.get('[data-draft-container-remove]').trigger('click')
    expect(confirmState.title).toBe('Удалить контейнер «MRSU 488584 9»?')
    expect(confirmState.cancelText).toBe('Не удалять')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.deleteContainer).toHaveBeenCalledWith('c1', 'k1')
  })
})

describe('StepDraft — документы и отправка', () => {
  it('без документов «Отправить на оформление» выключена с подсказкой', () => {
    mount(USERS.declarant)
    expect(w.get('[data-draft-submit]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-tip]').attributes('data-title')).toBe('Прикрепите минимум один документ')
  })

  it('с документом: подтверждение «…за клиента?», затем действие submit-for-processing с прежним телом', async () => {
    mount(USERS.declarant, {}, [fileDto()])
    expect(w.get('[data-tip]').attributes('data-title')).toBe('')
    await w.get('[data-draft-submit]').trigger('click')
    expect(confirmState.title).toBe('Отправить заявку на оформление за клиента?')
    expect(confirmState.cancelText).toBe('Отмена')
    expect(api.action).not.toHaveBeenCalled()
    confirmState.resolve(true)
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'submit-for-processing', undefined, undefined)
    expect(msg.success).toHaveBeenCalledWith('Заявка отправлена на оформление')
  })

  it('отказ в подтверждении — ничего не отправляется', async () => {
    mount(USERS.declarant, {}, [fileDto()])
    await w.get('[data-draft-submit]').trigger('click')
    confirmState.resolve(false)
    await flushPromises()
    expect(api.action).not.toHaveBeenCalled()
  })

  it('загрузка двух файлов с видом идёт в раздел documents; удалять файлы может только администратор', async () => {
    mount(USERS.declarant, {}, [fileDto()])
    expect(w.find('[data-slot-remove]').exists()).toBe(false)
    await w.get('[data-slot-kind] [data-option="invoice"]').trigger('click')
    const input = w.get('[data-docs-slot="documents"]').element.querySelector('input[type="file"]') as HTMLInputElement
    const [a, b] = [new File(['1'], 'a.pdf', { type: 'application/pdf' }), new File(['2'], 'b.pdf', { type: 'application/pdf' })]
    api.uploadFile.mockResolvedValue(fileDto({ id: 'n' }))
    Object.defineProperty(input, 'files', { value: [a, b], configurable: true })
    input.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(api.uploadFile).toHaveBeenNthCalledWith(1, 'c1', 'documents', a, 'invoice')
    expect(api.uploadFile).toHaveBeenNthCalledWith(2, 'c1', 'documents', b, 'invoice')
    w.unmount()
    mount(USERS.admin, {}, [fileDto()])
    expect(w.find('[data-slot-remove]').exists()).toBe(true)
  })
})
