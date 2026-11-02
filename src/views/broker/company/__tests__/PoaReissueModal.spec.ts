import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'

const api = vi.hoisted(() => ({
  reissue: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/import40Contract', async (orig) => ({
  ...(await orig<typeof import('@/api/import40Contract')>()),
  import40ContractApi: { reissueDocument: api.reissue },
}))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import PoaReissueModal from '../PoaReissueModal.vue'
import { canReissuePoa, reissueDates, type Import40DocumentDto } from '@/api/import40Contract'

// Перевыпуск доверенности (02.11.2026, пакет I): окно с датой окончания и правило «кому показывать кнопку».

const ModalStub = {
  props: ['open', 'title', 'okButtonProps', 'confirmLoading'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal :data-title="title"><slot /><button data-ok type="button" :disabled="okButtonProps?.disabled" @click="$emit(\'ok\')" /></div>',
}
const DateStub = {
  props: ['value', 'min', 'max'], emits: ['update:value'],
  template: '<input data-date :value="value" :data-min="min" :data-max="max" @input="$emit(\'update:value\', $event.target.value || null)" />',
}

let w: VueWrapper
const mountModal = async () => {
  w = mountWithI18n(PoaReissueModal, {
    props: { open: true, clientId: 'c1', doc: { id: 'dp', number: '0007', year: 2026 } },
    attachTo: document.body,
    global: { stubs: { ZModal: ModalStub, ZDate: DateStub } },
  })
  await flushPromises()
}
const issued = (o: Partial<Import40DocumentDto> = {}): Import40DocumentDto => ({
  id: 'dn', clientId: 'c1', kind: 'poa', number: '0010', year: 2026, generatedAtUtc: '2026-11-02T08:00:00Z', status: 1,
  clientSigned: false, clientSignedAtUtc: null, providerSigned: false, providerSignedAtUtc: null, clientSignMethod: null, providerSignMethod: null,
  isSingleUse: false, validUntilUtc: '2026-12-31T23:59:59Z', consumedByCaseId: null, files: [], ...o,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 2, 10, 0, 0)) // 02.11.2026, местное время
  api.reissue.mockResolvedValue(issued())
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('reissueDates и canReissuePoa', () => {
  it('по умолчанию — 31.12 этого года, в декабре — следующего; выбрать — с завтра до +3 лет', () => {
    expect(reissueDates(new Date(2026, 10, 2))).toEqual({ def: '2026-12-31', min: '2026-11-03', max: '2029-11-02' })
    expect(reissueDates(new Date(2026, 11, 1))).toEqual({ def: '2027-12-31', min: '2026-12-02', max: '2029-12-01' })
    expect(reissueDates(new Date(2026, 11, 31)).min).toBe('2027-01-01')
  })

  it('только текущая многоразовая действующая доверенность', () => {
    const d = (o: Partial<Import40DocumentDto>) => issued({ id: 'dp', status: 2, generatedAtUtc: '2026-03-01T08:00:00Z', ...o })
    const cur = d({})
    expect(canReissuePoa([cur], cur)).toBe(true)
    expect(canReissuePoa([d({ kind: 'contract' })], d({ kind: 'contract' }))).toBe(false)
    expect(canReissuePoa([d({ isSingleUse: true })], d({ isSingleUse: true }))).toBe(false)
    expect(canReissuePoa([d({ status: 1 })], d({ status: 1 }))).toBe(false)
    expect(canReissuePoa([d({ status: 4 })], d({ status: 4 }))).toBe(false)
    expect(canReissuePoa([d({ replacedBy: '10/2026' })], d({ replacedBy: '10/2026' }))).toBe(false)
    // После неё выпущена другая многоразовая — ждёт подписи или действует; отозванная и разовая не мешают.
    expect(canReissuePoa([cur, issued({ status: 1 })], cur)).toBe(false)
    expect(canReissuePoa([cur, issued({ status: 2 })], cur)).toBe(false)
    expect(canReissuePoa([cur, issued({ status: 4 })], cur)).toBe(true)
    expect(canReissuePoa([cur, issued({ status: 1, isSingleUse: true })], cur)).toBe(true)
    // Старее этой — не мешает.
    expect(canReissuePoa([cur, issued({ status: 2, generatedAtUtc: '2026-01-01T08:00:00Z' })], cur)).toBe(true)
  })
})

describe('PoaReissueModal', () => {
  it('заголовок с номером, дата по умолчанию 31.12, границы календаря и подсказка', async () => {
    await mountModal()
    expect(w.get('[data-modal]').attributes('data-title')).toBe('Перевыпустить доверенность № 0007/2026')
    const date = w.get('[data-date]')
    expect((date.element as HTMLInputElement).value).toBe('2026-12-31')
    expect(date.attributes('data-min')).toBe('2026-11-03')
    expect(date.attributes('data-max')).toBe('2029-11-02')
    expect(w.text()).toContain('По умолчанию — до 31.12.2026. Можно выбрать другую дату: с завтрашнего дня и не позже 02.11.2029.')
    expect(w.get('[data-reissue-text]').text()).toContain('До подписи действует доверенность № 0007/2026')
  })

  it('дата по умолчанию — срок считает сервер (null); тост, событие, окно закрыто', async () => {
    await mountModal()
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.reissue).toHaveBeenCalledWith('c1', 'dp', { validUntilUtc: null }, { silent: true })
    expect(api.toast.success).toHaveBeenCalledWith('Доверенность № 0010/2026 выпущена и ждёт подписи клиента')
    expect(w.emitted('reissued')?.[0]).toEqual([issued()])
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('выбранная дата — конец этого дня UTC', async () => {
    await mountModal()
    await w.get('[data-date]').setValue('2027-06-30')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.reissue).toHaveBeenCalledWith('c1', 'dp', { validUntilUtc: '2027-06-30T23:59:59.000Z' }, { silent: true })
  })

  it('без даты кнопка неактивна; ошибка сервера — его текстом, окно не закрывается', async () => {
    await mountModal()
    await w.get('[data-date]').setValue('')
    expect(w.get('[data-ok]').attributes('disabled')).toBeDefined()
    await w.get('[data-date]').setValue('2027-01-15')
    api.reissue.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 409, data: { error: 'Доверенность №0010/Дов/2026 уже выпущена и ждёт подписи клиента — новая не нужна.' } } }))
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(w.get('[data-reissue-error]').text()).toContain('уже выпущена и ждёт подписи клиента')
    expect(w.emitted('update:open')).toBeUndefined()
  })
})
