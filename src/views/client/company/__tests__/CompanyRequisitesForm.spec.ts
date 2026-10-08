import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientCompanyProfileDto } from '@/api/import40Contract'

const api = vi.hoisted(() => ({ saveProfile: vi.fn() }))
const lookup = vi.hoisted(() => ({ byBin: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40Contract', async (orig) => ({ ...(await orig<object>()), import40ContractApi: api }))
vi.mock('@/api/companyLookup', async (orig) => ({ ...(await orig<object>()), companyLookupApi: lookup }))
vi.mock('@/ui/message', () => ({ message: msg }))

import CompanyRequisitesForm from '../CompanyRequisitesForm.vue'

const EMPTY: ClientCompanyProfileDto = {
  clientId: 'cl1', companyName: '', bin: '', directorName: '', directorBasis: '', legalAddress: '', bank: '', iik: '', bik: '',
  phone: '', email: '', legalCountryCode: null, legalRegion: null, legalCity: null, legalStreet: null, kbe: null, okpo: null,
  ownershipType: null, contactPersonName: null, contactPersonPosition: null, contactPhone: null, contactEmail: null,
  isComplete: false, updatedAtUtc: null,
}
const COUNTRIES = [{ value: '398', label: 'Казахстан (KZ)', searchText: 'казахстан kz 398' }]

let w: VueWrapper
const mountForm = async (profile: ClientCompanyProfileDto | null = EMPTY, cancellable = false) => {
  w = mountWithI18n(CompanyRequisitesForm, {
    attachTo: document.body,
    props: { clientId: 'cl1', profile, countryOptions: COUNTRIES, cancellable },
  })
  await flushPromises()
}
const input = (f: string) => w.get(`[data-f="${f}"] input, input[data-f="${f}"]`)
const setVal = async (f: string, v: string) => {
  await input(f).setValue(v)
  await flushPromises()
}
const submit = async () => {
  await w.get('form').trigger('submit')
  await flushPromises()
}
const errors = () => w.findAll('[data-z-field] .text-danger').map((e) => e.text()).filter((x) => x !== '*')

afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('CompanyRequisitesForm', () => {
  it('обязательные: наименование, БИН (12 цифр), руководитель — без них saveProfile не зовётся', async () => {
    await mountForm()
    await submit()
    expect(api.saveProfile).not.toHaveBeenCalled()
    expect(errors()).toEqual(['Заполните поле', 'Заполните поле', 'Заполните поле'])
    await setVal('bin', '12345')
    await submit()
    expect(errors()).toContain('БИН — 12 цифр')
    expect(api.saveProfile).not.toHaveBeenCalled()
  })

  it('поиск по БИН заполняет наименование, руководителя, адрес и его части (parseKzAddress)', async () => {
    lookup.byBin.mockResolvedValue({
      bin: '123456789012', nameRu: 'ТОО «Казахмыс Трейд»', nameKz: null,
      addressRu: 'Казахстан, Карагандинская область, г. Караганда, ул. Ерубаева, д. 2А, оф. 5',
      addressKz: null, director: 'ИВАНОВ ИВАН', okedRu: null, statusRu: null, dateReg: null, source: 'gbd', fetchedAtUtc: '', kind: 'ul', isActive: true,
    })
    await mountForm()
    expect(w.get('[data-bin-find]').attributes('disabled')).toBeDefined()
    await setVal('bin', '123456789012')
    await w.get('[data-bin-find]').trigger('click')
    await flushPromises()
    expect(lookup.byBin).toHaveBeenCalledWith('123456789012', false)
    expect((input('companyName').element as HTMLInputElement).value).toBe('ТОО «Казахмыс Трейд»')
    expect((input('directorName').element as HTMLInputElement).value).toBe('ИВАНОВ ИВАН')
    expect((input('legalAddress').element as HTMLInputElement).value).toContain('г. Караганда')
    expect((input('legalRegion').element as HTMLInputElement).value).toBe('Карагандинская область')
    expect((input('legalCity').element as HTMLInputElement).value).toBe('Караганда')
    expect((input('legalStreet').element as HTMLInputElement).value).toBe('ул. Ерубаева, д. 2А, пом. 5')
  })

  it('сохранение — saveProfile со всеми полями (тихо), затем saved с ответом сервера', async () => {
    const saved = { ...EMPTY, companyName: 'ТОО «А»', bin: '123456789012', directorName: 'Иванов', isComplete: true }
    api.saveProfile.mockResolvedValue(saved)
    await mountForm()
    await setVal('companyName', 'ТОО «А»')
    await setVal('bin', '123456789012')
    await setVal('directorName', 'Иванов')
    await setVal('iik', 'KZ123')
    await setVal('phone', '7001234567')
    await submit()
    expect(api.saveProfile).toHaveBeenCalledTimes(1)
    const [id, payload, opts] = api.saveProfile.mock.calls[0]
    expect(id).toBe('cl1')
    expect(opts).toEqual({ silent: true })
    expect(payload).toMatchObject({
      companyName: 'ТОО «А»', bin: '123456789012', directorName: 'Иванов', directorBasis: 'устава',
      iik: 'KZ123', phone: '+7 700 123 45 67', legalCountryCode: '398',
    })
    expect(Object.keys(payload).sort()).toEqual([
      'bank', 'bik', 'bin', 'companyName', 'contactEmail', 'contactPersonName', 'contactPersonPosition', 'contactPhone',
      'directorBasis', 'directorName', 'email', 'iik', 'kbe', 'legalAddress', 'legalCity', 'legalCountryCode', 'legalRegion',
      'legalStreet', 'okpo', 'ownershipType', 'phone',
    ])
    expect(w.emitted('saved')?.[0]).toEqual([saved])
    expect(msg.success).toHaveBeenCalledWith('Реквизиты сохранены')
  })

  it('ошибка сервера — текстом сервера на месте; «Отмена» — только когда можно закрыть', async () => {
    api.saveProfile.mockRejectedValue({ response: { status: 400, data: { error: 'БИН уже занят' } } })
    await mountForm({ ...EMPTY, companyName: 'А', bin: '123456789012', directorName: 'Б', isComplete: true }, true)
    await submit()
    expect(w.get('[data-requisites-error]').text()).toContain('БИН уже занят')
    await w.get('[data-requisites-cancel]').trigger('click')
    expect(w.emitted('cancel')).toHaveLength(1)
  })
})
