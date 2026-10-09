import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { vUppercase } from '@/directives/uppercase'
import { useClassifiersStore } from '@/stores/classifiers'
import type { BrokerFirmDto } from '@/api/brokerFirms'
import { emptyDtForm, type DtFormState } from '../dtPayload'
import SectionClosing from '../sections/SectionClosing.vue'

const refs = vi.hoisted(() => ({ listClassifiers: vi.fn(), listCountries: vi.fn() }))
const profile = vi.hoisted(() => ({ get: vi.fn() }))
const firmsApi = vi.hoisted(() => ({ listBrokerFirms: vi.fn(), getBrokerFirmByBin: vi.fn(), upsertBrokerFirm: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))
vi.mock('@/api/declarantProfile', () => ({ declarantProfileApi: profile }))
vi.mock('@/api/brokerFirms', () => firmsApi)
vi.mock('@/ui/message', () => ({ message: toast }))

const SelectStub = {
  props: ['value', 'options', 'disabled'],
  emits: ['update:value'],
  template: `<div data-select-stub :data-value="value ?? ''" :data-disabled="disabled ? 'true' : 'false'">
    <button v-for="o in options" :key="o.value" type="button" :data-option="o.value" @click="$emit('update:value', o.value)">{{ o.label }}</button>
    <button type="button" data-clear @click="$emit('update:value', null)">x</button>
  </div>`,
}
const item = (classifierCode: string, code: string, nameRu: string) => ({ id: `${classifierCode}-${code}`, classifierCode, code, nameRu, sortOrder: 0, isActive: true })
const firm = (o: Partial<BrokerFirmDto> = {}): BrokerFirmDto => ({
  id: 'f1', name: 'ТОО «БРОКЕР-1»', bin: '123456789012', address: 'Алматы', contractNumber: 'К-77', contractDate: '2026-01-10', contractValidUntil: '2027-01-10',
  createdAtUtc: '', updatedAtUtc: '', ...o,
})
const profileDto = (o: Record<string, unknown> = {}) => ({
  fullName: 'Иванов Иван', position: 'декларант', phone: '+7 700 111 22 33', iin: null, powerOfAttorneyNumber: 'д-5', powerOfAttorneyDate: '2026-02-01',
  powerOfAttorneyValidUntil: '2027-02-01', idDocTypeCode: '21', idDocNumber: 'n123', idDocIssueDate: '2020-03-04', idDocIssuedBy: 'мвд рк', idDocCountryCode: 'kz', ...o,
})

let w: VueWrapper
let pinia: ReturnType<typeof createPinia>
let form: DtFormState
beforeEach(() => {
  vi.clearAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
  form = reactive(emptyDtForm())
  refs.listCountries.mockResolvedValue([{ alpha2: 'KZ', name: 'Казахстан' }, { alpha2: 'CN', name: 'Китай' }])
  firmsApi.listBrokerFirms.mockResolvedValue([])
  firmsApi.getBrokerFirmByBin.mockResolvedValue(null)
  firmsApi.upsertBrokerFirm.mockResolvedValue(firm())
  profile.get.mockResolvedValue(profileDto())
  useClassifiersStore().cache = { 'id-doc-types': [item('id-doc-types', '21', 'Удостоверение личности'), item('id-doc-types', '22', 'Паспорт')] }
})
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

const mount = async (over: Partial<DtFormState> = {}, props: Record<string, unknown> = {}) => {
  Object.assign(form, over)
  w = mountWithI18n(SectionClosing, {
    props: { form, readonly: false, ...props },
    global: { plugins: [pinia], directives: { uppercase: vUppercase }, stubs: { ZSelect: SelectStub, DtGraphHelp: { props: ['graph'], template: '<i data-help />' } } },
    attachTo: document.body,
  })
  await flushPromises()
}
const type = async (sel: string, text: string) => {
  const el = w.get(sel).find('input').exists() ? w.get(sel).get('input') : w.get(sel)
  ;(el.element as HTMLInputElement).value = text
  await el.trigger('input')
}

describe('SectionClosing — гр. 48, 52, 54', () => {
  it('открытие форму не меняет; data-graph у граф 48, 52, 54', async () => {
    const before = JSON.stringify(form)
    await mount()
    expect(JSON.stringify(form)).toBe(before)
    for (const g of ['48', '52', '54']) expect(w.find(`[data-graph="${g}"]`).exists()).toBe(true)
  })

  it('текстовые поля — в верхнем регистре; пустое — null', async () => {
    await mount()
    await type('[data-deferral-type]', 'письмо')
    await type('[data-deferral-number]', 'ab-1')
    await type('[data-guarantee]', 'сша')
    await type('[data-signatory-name]', 'петров п.п.')
    await type('[data-contract-number]', 'д-9')
    expect(form).toMatchObject({ deferralDocType: 'ПИСЬМО', deferralNumber: 'AB-1', guaranteeInvalidFor: 'США', signatoryFullName: 'ПЕТРОВ П.П.', brokerContractNumber: 'Д-9' })
    await type('[data-contract-number]', '')
    expect(form.brokerContractNumber).toBeNull()
  })

  it('вид документа подписанта — по классификатору; страна документа — выбор по двухбуквенному коду', async () => {
    await mount()
    await w.get('[data-signatory-doctype]').get('[data-option="22"]').trigger('click')
    expect(form.signatoryDocTypeCode).toBe('22')
    expect(w.get('[data-signatory-country]').findAll('[data-option]').map((b) => b.text())).toEqual(['CN — Китай', 'KZ — Казахстан'])
    await w.get('[data-signatory-country]').get('[data-option="CN"]').trigger('click')
    expect(form.signatoryDocCountryCode).toBe('CN')
    await w.get('[data-signatory-country]').get('[data-clear]').trigger('click')
    expect(form.signatoryDocCountryCode).toBeNull()
  })

  it('страна документа вне справочника («Казахстан» текстом) показывается и помечается предупреждением', async () => {
    await mount({ signatoryDocCountryCode: 'Казахстан' })
    expect(w.get('[data-signatory-country]').attributes('data-value')).toBe('Казахстан')
    expect(w.text()).toContain('Казахстан')
    expect(w.text()).toMatch(/нет в справочнике/)
  })

  it('«Подставить из профиля декларанта»: текст — UPPER, номера/даты/коды как есть; пустое поле профиля форму не трогает', async () => {
    await mount({ signatoryPosition: 'СТАРАЯ' })
    profile.get.mockResolvedValue(profileDto({ position: '' }))
    await w.get('[data-from-profile]').trigger('click')
    await flushPromises()
    expect(form).toMatchObject({
      signatoryFullName: 'ИВАНОВ ИВАН', signatoryPosition: 'СТАРАЯ', signatoryPhone: '+7 700 111 22 33', powerOfAttorney: 'Д-5',
      powerOfAttorneyDate: '2026-02-01', powerOfAttorneyValidUntil: '2027-02-01', signatoryDocTypeCode: '21', signatoryDocNumber: 'N123',
      signatoryDocIssueDate: '2020-03-04', signatoryDocIssuedBy: 'МВД РК', signatoryDocCountryCode: 'KZ',
    })
    expect(toast.success).toHaveBeenCalled()
  })

  it('профиль пуст — подсказка, ошибка загрузки — сообщение; форма не меняется', async () => {
    await mount()
    const before = JSON.stringify(form)
    profile.get.mockResolvedValue(profileDto({ fullName: null, powerOfAttorneyNumber: null, idDocNumber: null, position: null, phone: null, powerOfAttorneyDate: null, powerOfAttorneyValidUntil: null, idDocTypeCode: null, idDocIssueDate: null, idDocIssuedBy: null, idDocCountryCode: null }))
    await w.get('[data-from-profile]').trigger('click')
    await flushPromises()
    expect(toast.info).toHaveBeenCalled()
    profile.get.mockRejectedValue(new Error('x'))
    await w.get('[data-from-profile]').trigger('click')
    await flushPromises()
    expect(toast.error).toHaveBeenCalled()
    expect(JSON.stringify(form)).toBe(before)
  })

  it('только чтение: поля недоступны, кнопки профиля и справочник фирм не показываются, справочник не грузится', async () => {
    await mount({ signatoryFullName: 'ИВАНОВ' }, { readonly: true })
    expect(w.find('[data-from-profile]').exists()).toBe(false)
    expect(w.find('[data-broker-firm]').exists()).toBe(false)
    expect(firmsApi.listBrokerFirms).not.toHaveBeenCalled()
    expect(w.findAll('input').every((i) => (i.element as HTMLInputElement).disabled)).toBe(true)
  })
})

describe('SectionClosing — брокерский договор и справочник фирм', () => {
  it('блок подписан как справочник: в ДТ уходит только номер договора', async () => {
    await mount()
    expect(w.get('[data-broker-firm]').text()).toContain('Справочник фирм-брокеров')
    expect(w.get('[data-broker-firm-note]').text()).toContain('только номер договора')
  })

  it('выбор фирмы вручную: номер договора пуст — подставляется; введённый декларантом не затирается', async () => {
    firmsApi.listBrokerFirms.mockResolvedValue([firm(), firm({ id: 'b', bin: '999999999999', name: 'ВТОРАЯ', contractNumber: 'В-2' })])
    await mount()
    await w.get('[data-firm-pick]').get('[data-option="999999999999"]').trigger('click')
    expect(form.brokerContractNumber).toBe('В-2')
    await w.get('[data-firm-pick]').get('[data-option="123456789012"]').trigger('click')
    expect(form.brokerContractNumber).toBe('В-2')
  })

  it('поиск по БИН: нашли — номер договора в ДТ; не нашли — сообщение; без БИН — предупреждение', async () => {
    await mount()
    await w.get('[data-firm-find]').trigger('click')
    expect(toast.warning).toHaveBeenCalled()
    await type('[data-firm-bin]', '123456789012')
    await w.get('[data-firm-find]').trigger('click')
    await flushPromises()
    expect(toast.info).toHaveBeenCalled()
    expect(form.brokerContractNumber).toBeNull()
    firmsApi.getBrokerFirmByBin.mockResolvedValue(firm())
    await w.get('[data-firm-find]').trigger('click')
    await flushPromises()
    expect(form.brokerContractNumber).toBe('К-77')
    expect(toast.success).toHaveBeenCalled()
  })

  it('«Сохранить в справочник»: нужны наименование и БИН; номер договора берётся из ДТ', async () => {
    await mount({ brokerContractNumber: 'К-5' })
    await w.get('[data-firm-save]').trigger('click')
    expect(firmsApi.upsertBrokerFirm).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalled()
    await type('[data-firm-bin]', '123456789012')
    await type('[data-firm-name]', 'ТОО НОВАЯ')
    await w.get('[data-firm-save]').trigger('click')
    await flushPromises()
    expect(firmsApi.upsertBrokerFirm).toHaveBeenCalledWith(expect.objectContaining({ name: 'ТОО НОВАЯ', bin: '123456789012', contractNumber: 'К-5' }))
    expect(firmsApi.listBrokerFirms).toHaveBeenCalledTimes(2)
  })

  it('справочник не загрузился — ручной ввод БИН остаётся, ДТ не меняется', async () => {
    firmsApi.listBrokerFirms.mockRejectedValue(new Error('x'))
    await mount()
    expect(w.find('[data-firm-list-failed]').exists()).toBe(true)
    expect(form.brokerContractNumber).toBeNull()
  })
})
