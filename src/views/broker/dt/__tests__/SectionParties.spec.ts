import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useClassifiersStore } from '@/stores/classifiers'
import type { ClientCompanyProfileDto } from '@/api/import40Contract'
import { emptyDtForm, type DtFormState } from '../dtPayload'
import SectionParties from '../sections/SectionParties.vue'

const lookup = vi.hoisted(() => ({ byBin: vi.fn() }))
const refs = vi.hoisted(() => ({ search: vi.fn(), upsert: vi.fn() }))
const kato = vi.hoisted(() => ({ search: vi.fn(), get: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/companyLookup', async (orig) => ({ ...(await orig<typeof import('@/api/companyLookup')>()), companyLookupApi: lookup }))
vi.mock('@/api/partyRefs', () => ({ partyRefsApi: refs }))
vi.mock('@/api/kato', async (orig) => ({ ...(await orig<typeof import('@/api/kato')>()), katoApi: kato }))
vi.mock('@/ui/message', () => ({ message: toast }))

const countries = [
  { value: '398', label: '398 — Казахстан', alpha2: 'KZ' },
  { value: '156', label: '156 — Китай', alpha2: 'CN' },
]
const declarant = {
  declarantName: 'ТОО ДЕКЛАРАНТ', declarantShortName: 'ДЕКЛ', declarantBin: '111111111111', declarantCountryCode: '398',
  declarantRegion: 'D-REGION', declarantCity: 'D-CITY', declarantStreet: 'D-STREET', declarantHouse: '5', declarantApt: '6',
  declarantCategoryCode: '3', declarantKatoCode: '751110002',
}
const company = {
  bin: '201140012345', nameRu: 'ТОО «Казахмыс Трейд»', nameKz: null,
  addressRu: 'Республика Казахстан, г.Алматы, Алмалинский район, ул. Абая, д. 52, оф. 305',
  addressKz: null, director: null, okedRu: null, statusRu: 'Действующее', dateReg: null, source: 'egov', fetchedAtUtc: '', kind: 'ul', isActive: true,
}

let w: VueWrapper
let form: DtFormState
afterEach(() => { w?.unmount(); document.body.innerHTML = ''; vi.clearAllMocks(); vi.useRealTimers() })
beforeEach(() => {
  setActivePinia(createPinia())
  useClassifiersStore().cache = {
    'itn-categories': [{ id: '1', classifierCode: 'itn-categories', code: '2', nameRu: 'юрлицо', sortOrder: 0, isActive: true }],
  } as never
  form = reactive(emptyDtForm())
  refs.search.mockResolvedValue([])
  kato.search.mockResolvedValue([])
  kato.get.mockResolvedValue(null)
})

const mount = (over: Partial<DtFormState> = {}, props: Record<string, unknown> = {}) => {
  Object.assign(form, over)
  w = mountWithI18n(SectionParties, {
    props: { form, readonly: false, countryOptions: countries, clientProfile: null, ...props },
    global: { stubs: { DtGraphHelp: { props: ['graph'], template: '<i data-help :data-help-graph="graph" />' } } },
    attachTo: document.body,
  })
}
const party = (k: string) => w.get(`[data-party="${k}"]`)
const input = (k: string, f: string) => party(k).get(`[data-party-input="${f}"]`)
const sw = (k: 'receiver' | 'financialSubject') => party(k).get(`[data-party-same="${k}"]`)
const snapshot = () => JSON.stringify(form)

describe('SectionParties — открытие', () => {
  it('порядок блоков: гр. 14, 8, 9, 2; открытие раздела форму не меняет (и со «Совпадает», и с длинным домом)', async () => {
    const over = {
      ...declarant, consigneeEqualsDeclarant: true, financialSubjectEqualsDeclarant: false,
      receiver: { name: 'СТАРЫЙ ПОЛУЧАТЕЛЬ', countryCode: 'KZ', region: null, city: null, street: null },
      financialSubjectName: 'ФИН', senderHouse: 'BUILDING 7, ROOM 1205-1206',
    }
    Object.assign(form, over)
    const before = snapshot()
    mount()
    await flushPromises()
    expect(w.findAll('[data-party]').map((e) => e.attributes('data-party'))).toEqual(['declarant', 'receiver', 'financialSubject', 'sender'])
    expect(w.findAll('h2').map((h) => h.text().replace(/\s+/g, ' '))).toEqual([
      'Декларант гр. 14', 'Получатель гр. 8', 'Ответственный за финансовое урегулирование гр. 9', 'Отправитель гр. 2',
    ])
    expect(snapshot()).toBe(before)
  })

  it('гр. 2 — без БИН, категории и КАТО; у гр. 14 — всё', () => {
    mount()
    expect(party('sender').find('[data-party-input="bin"]').exists()).toBe(false)
    expect(party('sender').find('[data-party-input="categoryCode"]').exists()).toBe(false)
    expect(party('sender').find('[data-kato-field]').exists()).toBe(false)
    expect(party('declarant').find('[data-party-input="bin"]').exists()).toBe(true)
    expect(party('declarant').find('[data-party-input="categoryCode"]').exists()).toBe(true)
    expect(party('declarant').find('[data-kato-field]').exists()).toBe(true)
  })
})

describe('SectionParties — «Совпадает с декларантом» (гр. 8 / 9)', () => {
  it('включено: блок свёрнут в строку с наименованием и БИН декларанта, data-graph на переключателе', () => {
    mount({ ...declarant, consigneeEqualsDeclarant: true, financialSubjectEqualsDeclarant: true })
    expect(party('receiver').find('[data-party-fields]').exists()).toBe(false)
    expect(party('receiver').get('[data-party-same-summary]').text()).toBe('Те же данные, что в гр. 14 · ТОО ДЕКЛАРАНТ · 111111111111')
    expect(party('receiver').get('[data-graph="8"]').find('[role="switch"]').exists()).toBe(true)
    expect(party('financialSubject').get('[data-graph="9"]').exists()).toBe(true)
    expect(sw('receiver').attributes('aria-checked')).toBe('true')
    expect(party('receiver').find('[data-party-refs-open]').exists()).toBe(false)
  })

  it('правка гр. 14 при включённом — сразу в гр. 8 и 9; при выключенном — нет', async () => {
    mount({ ...declarant, consigneeEqualsDeclarant: true, financialSubjectEqualsDeclarant: false, financialSubjectName: 'ФИН' })
    await input('declarant', 'city').setValue('караганда')
    expect(form.declarantCity).toBe('КАРАГАНДА')
    expect(form.receiver.city).toBe('КАРАГАНДА')
    expect(form.receiverBin).toBe('111111111111')
    expect(form.financialSubjectCity).toBeNull()
    expect(form.financialSubjectName).toBe('ФИН')
  })

  it('включение копирует гр. 14; выключение раскрывает поля с текущими значениями', async () => {
    mount({ ...declarant, financialSubjectName: 'СВОЁ' })
    expect((input('financialSubject', 'name').element as HTMLInputElement).value).toBe('СВОЁ')
    await sw('financialSubject').trigger('click')
    expect(form.financialSubjectEqualsDeclarant).toBe(true)
    expect(form.financialSubjectName).toBe('ТОО ДЕКЛАРАНТ')
    expect(form.financialSubjectKatoCode).toBe('751110002')
    expect(party('financialSubject').find('[data-party-fields]').exists()).toBe(false)
    await sw('financialSubject').trigger('click')
    expect(form.financialSubjectEqualsDeclarant).toBe(false)
    expect((input('financialSubject', 'name').element as HTMLInputElement).value).toBe('ТОО ДЕКЛАРАНТ')
    expect((input('financialSubject', 'bin').element as HTMLInputElement).value).toBe('111111111111')
  })
})

describe('SectionParties — БИН-поиск', () => {
  it('гр. 14: наименование перезаписывается, краткое и адрес — только пустые; копия в гр. 8 при «Совпадает»', async () => {
    lookup.byBin.mockResolvedValue(company)
    mount({ declarantName: 'СТАРОЕ', declarantStreet: 'МОЯ УЛИЦА', consigneeEqualsDeclarant: true })
    const btn = party('declarant').get('[data-bin-lookup]')
    expect(btn.attributes('disabled')).toBeDefined()
    await input('declarant', 'bin').setValue('201140012345')
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    await flushPromises()
    expect(lookup.byBin).toHaveBeenCalledWith('201140012345', false)
    expect(form.declarantName).toBe('ТОО «КАЗАХМЫС ТРЕЙД»')
    expect(form.declarantShortName).toBe('ТОО «КАЗАХМЫС ТРЕЙД»')
    expect(form.declarantStreet).toBe('МОЯ УЛИЦА')
    expect(form.declarantCity).toBe('АЛМАТЫ')
    expect([form.declarantHouse, form.declarantApt]).toEqual(['52', '305'])
    expect(form.declarantCountryCode).toBe('398')
    expect(form.receiver.name).toBe('ТОО «КАЗАХМЫС ТРЕЙД»')
    expect(form.receiverBin).toBe('201140012345')
    expect(party('declarant').text()).toContain('Наименование и адрес из ГБД ЮЛ; заполненное не затираем')
  })

  it('ошибка поиска — форма не меняется', async () => {
    lookup.byBin.mockRejectedValue({ response: { status: 404 } })
    mount({ financialSubjectBin: '201140012345' })
    const before = snapshot()
    await party('financialSubject').get('[data-bin-lookup]').trigger('click')
    await flushPromises()
    expect(snapshot()).toBe(before)
    expect(toast.warning).toHaveBeenCalled()
  })
})

describe('SectionParties — справочник и профиль клиента', () => {
  const ref = { id: 'r1', name: 'Shenzhen Bright', shortName: null, bin: '123456789012', countryCode: '156', city: 'shenzhen', region: null, street: 'keji rd', house: '7', apt: null, categoryCode: '2', katoCode: '751110000' }

  it('гр. 8 «Из справочника»: поиск по наименованию стороны, выбор подставляет запись в UPPER', async () => {
    refs.search.mockResolvedValue([ref])
    mount({ receiver: { name: 'SHENZHEN', countryCode: null, region: null, city: null, street: null } })
    await party('receiver').get('[data-party-refs-open="receiver"]').trigger('click')
    await flushPromises()
    expect(refs.search).toHaveBeenCalledWith('SHENZHEN')
    expect(document.body.textContent).toContain('Справочник получателей')
    ;(document.body.querySelector('[data-party-ref]') as HTMLElement).click()
    await flushPromises()
    expect(form.receiver).toMatchObject({ name: 'SHENZHEN BRIGHT', countryCode: '156', city: 'SHENZHEN', street: 'KEJI RD' })
    expect([form.receiverBin, form.receiverHouse, form.receiverCategoryCode, form.receiverKatoCode]).toEqual(['123456789012', '7', '2', '751110000'])
  })

  it('«Сохранить в справочник»: без наименования — предупреждение; с наименованием — upsert', async () => {
    refs.upsert.mockResolvedValue({})
    mount()
    await party('receiver').get('[data-party-refs-save="receiver"]').trigger('click')
    expect(toast.warning).toHaveBeenCalledWith('Заполните наименование стороны перед сохранением в справочник')
    expect(refs.upsert).not.toHaveBeenCalled()
    await input('receiver', 'name').setValue('тоо получатель')
    await input('receiver', 'bin').setValue('222222222222')
    await party('receiver').get('[data-party-refs-save="receiver"]').trigger('click')
    await flushPromises()
    expect(refs.upsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'ТОО ПОЛУЧАТЕЛЬ', bin: '222222222222' }))
    expect(toast.success).toHaveBeenCalledWith('Сохранено в справочник сторон')
  })

  it('«Из профиля клиента» — только при загруженном профиле; адрес разбирается, всё UPPER', async () => {
    mount()
    expect(party('receiver').find('[data-party-from-client]').exists()).toBe(false)
    w.unmount()
    const profile = {
      clientId: 'c', companyName: 'тоо клиент', bin: '222222222222', legalAddress: 'г. Астана, ул. Кенесары, д. 40, кв. 12',
      legalCountryCode: null, legalRegion: null, legalCity: null, legalStreet: null,
    } as unknown as ClientCompanyProfileDto
    mount({}, { clientProfile: profile })
    await party('receiver').get('[data-party-from-client]').trigger('click')
    expect(form.receiver).toMatchObject({ name: 'ТОО КЛИЕНТ', city: 'АСТАНА', street: 'УЛ. КЕНЕСАРЫ' })
    expect([form.receiverBin, form.receiverHouse, form.receiverApt]).toEqual(['222222222222', '40', '12'])
    expect(toast.success).toHaveBeenCalledWith('Получатель заполнен из профиля клиента')
  })
})

describe('SectionParties — код страны и БИН отправителя', () => {
  it('старый «KZ» показывается как «398 — Казахстан» без предупреждения и без записи в форму', async () => {
    mount({ declarantCountryCode: 'KZ' })
    await flushPromises()
    expect((input('declarant', 'countryCode').element as HTMLInputElement).value).toBe('398 — Казахстан')
    expect(party('declarant').text()).not.toContain('нет в справочнике')
    expect(form.declarantCountryCode).toBe('KZ')
  })

  it('«Сохранить в справочник» у отправителя — с БИН записи из справочника; правка наименования его снимает', async () => {
    refs.search.mockResolvedValue([{ id: 's1', name: 'Shenzhen Bright', shortName: null, bin: '987654321098', countryCode: 'CN', city: null, region: null, street: null, house: null, apt: null, categoryCode: null, katoCode: null }])
    refs.upsert.mockResolvedValue({})
    mount()
    await party('sender').get('[data-party-refs-open="sender"]').trigger('click')
    await flushPromises()
    ;(document.body.querySelector('[data-party-ref]') as HTMLElement).click()
    await flushPromises()
    expect(form.sender).toMatchObject({ name: 'SHENZHEN BRIGHT', countryCode: '156' })
    await party('sender').get('[data-party-refs-save="sender"]').trigger('click')
    await flushPromises()
    expect(refs.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'SHENZHEN BRIGHT', bin: '987654321098' }))
    await input('sender', 'name').setValue('другая фирма')
    await party('sender').get('[data-party-refs-save="sender"]').trigger('click')
    await flushPromises()
    expect(refs.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'ДРУГАЯ ФИРМА', bin: null }))
  })

  it('отправитель из ГБД ЮЛ (поиск 12 цифр в справочнике) — БИН уходит в справочник', async () => {
    lookup.byBin.mockResolvedValue(company)
    refs.upsert.mockResolvedValue({})
    mount()
    await party('sender').get('[data-party-refs-open="sender"]').trigger('click')
    await flushPromises()
    const q = document.body.querySelector('[data-party-refs-search]') as HTMLInputElement
    q.value = '201140012345'
    q.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 400))
    await flushPromises()
    ;(document.body.querySelector('[data-party-refs-registry]') as HTMLElement).click()
    await flushPromises()
    expect(form.sender).toMatchObject({ name: 'ТОО «КАЗАХМЫС ТРЕЙД»', countryCode: '398' })
    await party('sender').get('[data-party-refs-save="sender"]').trigger('click')
    await flushPromises()
    expect(refs.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ bin: '201140012345' }))
  })
})

describe('SectionParties — поля', () => {
  it('UPPERCASE при вводе текстовых полей; БИН — как есть', async () => {
    mount()
    await input('sender', 'name').setValue('shenzhen co')
    await input('sender', 'street').setValue('keji rd')
    expect(form.sender).toMatchObject({ name: 'SHENZHEN CO', street: 'KEJI RD' })
    await input('declarant', 'settlement').setValue('с. абай')
    expect(form.declarantSettlement).toBe('С. АБАЙ')
  })

  it('дом / квартира длиннее 20 знаков — ошибка под полем с текущей длиной; населённый пункт ≤ 120', async () => {
    mount({ senderHouse: 'BUILDING 7, ROOM 1205-1206' })
    expect(party('sender').text()).toContain('Не длиннее 20 знаков — сейчас 26')
    await input('receiver', 'apt').setValue('12345678901234567890')
    expect(party('receiver').text()).not.toContain('Не длиннее')
    await input('receiver', 'apt').setValue('123456789012345678901')
    expect(party('receiver').text()).toContain('Не длиннее 20 знаков — сейчас 21')
    expect(input('declarant', 'settlement').attributes('maxlength')).toBe('120')
  })

  it('просмотр: поля и переключатели недоступны, кнопок действий нет', () => {
    mount({ ...declarant }, { readonly: true })
    expect(input('declarant', 'name').attributes('disabled')).toBeDefined()
    expect(sw('receiver').attributes('disabled')).toBeDefined()
    expect(w.find('[data-bin-lookup]').exists()).toBe(false)
    expect(w.find('[data-party-refs-open]').exists()).toBe(false)
    expect(w.find('[data-party-refs-save]').exists()).toBe(false)
  })

  it('выбор страны и категории пишет код', async () => {
    mount()
    await input('sender', 'countryCode').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    ;([...document.body.querySelectorAll('[role="option"]')].find((e) => e.textContent?.includes('Китай')) as HTMLElement).click()
    await nextTick()
    expect(form.sender.countryCode).toBe('156')
    await input('declarant', 'categoryCode').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    ;([...document.body.querySelectorAll('[role="option"]')].find((e) => e.textContent?.includes('юрлицо')) as HTMLElement).click()
    await nextTick()
    expect(form.declarantCategoryCode).toBe('2')
  })
})
