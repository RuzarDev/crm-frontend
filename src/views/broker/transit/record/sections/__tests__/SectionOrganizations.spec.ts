import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import kk from '@/i18n/locales/kk'
import ru from '@/i18n/locales/ru'
import { companyLookupApi, type CompanyLookupDto } from '@/api/companyLookup'
import { mountWithI18n } from '@/test/mountWithI18n'

vi.mock('@/api/references', async () => ({ referencesApi: (await import('./harness')).refsApi }))
vi.mock('@/api/companyLookup', async (orig) => ({
  ...(await orig<typeof import('@/api/companyLookup')>()),
  companyLookupApi: { byBin: vi.fn() },
}))

import SectionOrganizations from '../SectionOrganizations.vue'
import { ComboStub, SelectStub, emptyDraft, primeRefs } from './harness'

let w: VueWrapper
const stubs = { ZSelect: SelectStub, ZCombobox: ComboStub }
const mountSection = async (draft = emptyDraft(), o: { readonly?: boolean; locale?: 'ru' | 'kk' | 'en' } = {}) => {
  const props = { draft, readonly: o.readonly ?? false }
  if (o.locale && o.locale !== 'ru') {
    const i18n = createI18n({ legacy: false, locale: o.locale, messages: { ru, kk, en } })
    w = mount(SectionOrganizations, { props, attachTo: document.body, global: { plugins: [i18n], stubs } })
  } else {
    w = mountWithI18n(SectionOrganizations, { props, attachTo: document.body, global: { stubs } })
  }
  await flushPromises()
  return draft
}
const row = (i: number) => w.findAll('[data-repeat-item]')[i]
const f = (i: number, key: string) => row(i).get(`[data-f="${key}"]`)
const type = async (i: number, key: string, text: string) => {
  const input = f(i, key)
  ;(input.element as HTMLInputElement).value = text
  await input.trigger('input')
}
const add = async () => { await w.get('[data-section-add]').trigger('click') }
const company = (o: Partial<CompanyLookupDto> = {}): CompanyLookupDto => ({
  bin: '123456789012', nameRu: 'ТОО «Найдено»', nameKz: null, addressRu: 'г. Алматы, пр. Абая 1', addressKz: null, director: null, okedRu: null,
  statusRu: null, dateReg: null, source: 'gbd', fetchedAtUtc: '2026-10-09T00:00:00Z', kind: 'ul', isActive: true, ...o,
})

beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); primeRefs() })
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

describe('SectionOrganizations', () => {
  it('каркас sec-organizations со счётчиком; пусто — текст', async () => {
    await mountSection()
    expect(w.get('section#sec-organizations h2').text()).toBe('Организации')
    expect(w.get('[data-section-count]').text()).toBe('0')
    expect(w.get('[data-repeat-empty]').text()).toBe('Организаций пока нет')
  })

  it.each(['ru', 'kk', 'en'] as const)('новая строка — роль «Декларант» (значение из списка) на языке %s', async (locale) => {
    const d = await mountSection(emptyDraft(), { locale })
    await add()
    expect(d.organizations).toEqual([{ role: 'Декларант', subjectType: null, bin: null, name: null, shortName: null, address: null, phone: null, email: null }])
    expect(f(0, 'role').attributes('data-value')).toBe('Декларант')
    expect(w.get('[data-section-count]').text()).toBe('1')
  })

  it('каждое поле пишет в строку черновика; пустое — null', async () => {
    const d = await mountSection()
    await add()
    await f(0, 'role').get('[data-option="Получатель"]').trigger('click')
    await f(0, 'subjectType').get('[data-option="ИП"]').trigger('click')
    await type(0, 'bin', '123456789012')
    await type(0, 'name', 'ТОО «Альфа»')
    await type(0, 'shortName', 'Альфа')
    await type(0, 'address', 'Алматы')
    await type(0, 'phone', '+7 700 000 00 00')
    await type(0, 'email', 'a@b.kz')
    expect(d.organizations[0]).toEqual({ role: 'Получатель', subjectType: 'ИП', bin: '123456789012', name: 'ТОО «Альфа»', shortName: 'Альфа', address: 'Алматы', phone: '+7 700 000 00 00', email: 'a@b.kz' })
    await type(0, 'shortName', '')
    expect(d.organizations[0].shortName).toBeNull()
  })

  it('подписи списков — на языке интерфейса, значения — русские строки', async () => {
    await mountSection(emptyDraft(), { locale: 'kk' })
    await add()
    const role = f(0, 'role')
    expect(role.get('[data-option="Получатель"]').text()).toBe('Алушы')
    expect(f(0, 'subjectType').get('[data-option="Иностранная организация"]').text()).toBe('Шетелдік ұйым')
  })

  it('«Найти по БИН» подставляет наименование, краткое наименование и адрес, только если они пусты', async () => {
    vi.mocked(companyLookupApi.byBin).mockResolvedValue(company())
    const d = await mountSection()
    await add()
    await type(0, 'bin', '123456789012')
    await row(0).get('[data-bin-lookup]').trigger('click')
    await flushPromises()
    expect(companyLookupApi.byBin).toHaveBeenCalledWith('123456789012', false)
    expect(d.organizations[0]).toMatchObject({ name: 'ТОО «Найдено»', shortName: 'ТОО «Найдено»', address: 'г. Алматы, пр. Абая 1', bin: '123456789012' })

    // Заполненные поля не затираются.
    await type(0, 'name', 'Моё название')
    await type(0, 'shortName', '')
    await type(0, 'address', 'Мой адрес')
    await row(0).get('[data-bin-lookup]').trigger('click')
    await flushPromises()
    expect(d.organizations[0]).toMatchObject({ name: 'Моё название', shortName: 'ТОО «Найдено»', address: 'Мой адрес' })
  })

  it('«Найти по БИН»: не БИН — кнопка выключена, запроса нет; нет карточки — поля не меняются', async () => {
    vi.mocked(companyLookupApi.byBin).mockRejectedValue({ response: { status: 404 } })
    const d = await mountSection()
    await add()
    const btn = () => row(0).get('[data-bin-lookup]')
    expect(btn().attributes('disabled')).toBeDefined()
    await type(0, 'bin', '12345')
    expect(btn().attributes('disabled')).toBeDefined()
    await type(0, 'bin', '123456789012')
    expect(btn().attributes('disabled')).toBeUndefined()
    await btn().trigger('click')
    await flushPromises()
    expect(d.organizations[0].name).toBeNull()
  })

  it('поиск по БИН подставляет данные в ту строку, где нажали', async () => {
    vi.mocked(companyLookupApi.byBin).mockResolvedValue(company())
    const d = await mountSection()
    await add()
    await add()
    await type(1, 'bin', '123456789012')
    await row(1).get('[data-bin-lookup]').trigger('click')
    await flushPromises()
    expect(d.organizations[0].name).toBeNull()
    expect(d.organizations[1].name).toBe('ТОО «Найдено»')
  })

  it('удаление строки; readonly — без «Добавить», «Удалить» и «Найти», поля выключены', async () => {
    const draft = emptyDraft()
    draft.organizations.push({ role: 'Декларант', subjectType: null, bin: '123456789012', name: 'А', shortName: null, address: null, phone: null, email: null })
    draft.organizations.push({ role: 'Получатель', subjectType: null, bin: null, name: 'Б', shortName: null, address: null, phone: null, email: null })
    await mountSection(draft)
    await w.findAll('[data-repeat-delete]')[0].trigger('click')
    expect(draft.organizations.map((o) => o.name)).toEqual(['Б'])
    w.unmount()
    await mountSection(draft, { readonly: true })
    expect(w.find('[data-section-add]').exists()).toBe(false)
    expect(w.find('[data-repeat-delete]').exists()).toBe(false)
    expect(w.find('[data-bin-lookup]').exists()).toBe(false)
    expect(f(0, 'name').attributes('disabled')).toBeDefined()
    expect(f(0, 'role').attributes('data-disabled')).toBe('true')
  })
})
