import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { REESTR_TRANSIT_DEFAULTS } from '@/utils/reestrDtoMap'
import { TRANSIT_FIELD_SECTION, POST_KEY } from '../../recordModel'

vi.mock('@/api/references', async () => ({ referencesApi: (await import('./harness')).refsApi }))

import SectionMain from '../SectionMain.vue'
import { ComboStub, POST_LONG_NO_CODE, POST_WITH_CODE, SelectStub, newDraft, primeRefs, refsApi } from './harness'

let w: VueWrapper
const mount = async (o: { readonly?: boolean; stubs?: boolean; draft?: ReturnType<typeof newDraft> } = {}) => {
  const draft = o.draft ?? newDraft()
  w = mountWithI18n(SectionMain, {
    props: { draft, readonly: o.readonly ?? false },
    attachTo: document.body,
    global: o.stubs === false ? {} : { stubs: { ZSelect: SelectStub, ZCombobox: ComboStub } },
  })
  await flushPromises()
  return draft
}
const f = (key: string) => w.get(`[data-f="${key}"]`)
const pick = async (key: string, option: string) => { await f(key).get(`[data-option="${option}"]`).trigger('click') }
const type = async (key: string, text: string) => {
  const host = f(key)
  const input = host.element.tagName === 'INPUT' ? host : host.get('input')
  ;(input.element as HTMLInputElement).value = text
  await input.trigger('input')
}

beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); primeRefs() })
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

describe('SectionMain', () => {
  it('три группы с подзаголовками и подсказкой про итоги; каркас sec-main', async () => {
    await mount()
    expect(w.get('section#sec-main').attributes('aria-labelledby')).toBeTruthy()
    expect(w.get('h2').text()).toBe('Основное')
    expect(w.findAll('h3').map((h) => h.text())).toEqual(['Декларация', 'Маршрут', 'Итоги'])
    expect(w.get('[data-main-totals-hint]').text()).toBe('Считаются по товарам; можно поправить вручную.')
    expect(w.find('[data-section-count]').exists()).toBe(false)
  })

  it('каждое поле transit из «Основного» редактируется (кроме packagingInfoCode — это «Упаковка»)', async () => {
    await mount()
    const mine = (Object.keys(TRANSIT_FIELD_SECTION) as (keyof typeof TRANSIT_FIELD_SECTION)[]).filter((k) => TRANSIT_FIELD_SECTION[k] === 'main')
    expect(mine.length).toBe(22)
    for (const k of mine) expect(w.find(`[data-f="${k}"]`).exists(), k).toBe(true)
    expect(w.find('[data-f="packagingInfoCode"]').exists()).toBe(false)
    for (const k of ['tempStoragePlace', 'destinationPlace', 'submitterType']) expect(w.find(`[data-f="${k}"]`).exists(), k).toBe(false)
    expect(w.find('[data-f="post"]').exists()).toBe(true)
  })

  it('списки: выбор пишет в свой ключ transit (классификаторы, страны, иностранная таможня, валюта)', async () => {
    const d = await mount()
    const cases: [string, string, string][] = [
      ['purposeCode', 'A2', 'A2'], ['entryMethodCode', 'A1', 'A1'], ['movementDirectionCode', 'A2', 'A2'], ['usedAsDeclarationCode', 'A1', 'A1'],
      ['transportModeCode', 'A2', 'A2'], ['transportDocTypeCode', 'A1', 'A1'],
      ['departureCountryCode', '398', '398'], ['destinationCountryCode', '156', '156'],
      ['loadingCountryCode', '398', '398'], ['unloadingCountryCode', '156', '156'],
      ['destinationCustomsOffice', '10001', '10001'], ['docCurrencyCode', 'CNY', 'CNY'],
    ]
    for (const [key, option, expected] of cases) {
      await pick(key, option)
      expect((d.transit as unknown as Record<string, unknown>)[key], key).toBe(expected)
    }
  })

  it('страна — числовой код ОКСМ, подпись «398 — Казахстан»; очистка пишет null', async () => {
    const d = await mount()
    expect(f('departureCountryCode').get('[data-option="398"]').text()).toBe('398 — Казахстан')
    expect(f('destinationCountryCode').get('[data-option="156"]').text()).toBe('156 — Китай')
    await f('departureCountryCode').get('[data-clear]').trigger('click')
    expect(d.transit.departureCountryCode).toBeNull()
  })

  it('станции погрузки/разгрузки — свободный ввод и выбор из справочника (значение — название)', async () => {
    const d = await mount()
    await pick('loadingRailStation', 'Алтынколь')
    expect(d.transit.loadingRailStation).toBe('Алтынколь')
    await type('unloadingRailStation', 'Нурлы жол')
    expect(d.transit.unloadingRailStation).toBe('Нурлы жол')
    await type('unloadingRailStation', '')
    expect(d.transit.unloadingRailStation).toBeNull()
  })

  it('«Пост» пишет в fields[«Пост»] — по названию из справочника и свободным вводом', async () => {
    const d = await mount()
    await pick('post', 'КПП Хоргос')
    expect(d.fields[POST_KEY]).toBe('КПП Хоргос')
    await type('post', 'Какой-то пост')
    expect(d.fields[POST_KEY]).toBe('Какой-то пост')
    await type('post', '')
    expect(d.fields[POST_KEY]).toBeNull()
  })

  it('таможня отправления: выбор поста сохраняет код («57507 — …» → 57507); без ошибки', async () => {
    const d = await mount()
    expect(f('departureCustomsOffice').get(`[data-option="57507"]`).text()).toBe(POST_WITH_CODE)
    await pick('departureCustomsOffice', '57507')
    expect(d.transit.departureCustomsOffice).toBe('57507')
    expect(w.text()).not.toContain('длиннее 32 знаков')
  })

  it('таможня отправления: пост без кода — короткое название сохраняется; длинное — ошибка у поля', async () => {
    const d = await mount()
    await pick('departureCustomsOffice', 'КПП Хоргос')
    expect(d.transit.departureCustomsOffice).toBe('КПП Хоргос')
    expect(w.text()).not.toContain('длиннее 32 знаков')
    await pick('departureCustomsOffice', POST_LONG_NO_CODE)
    expect(d.transit.departureCustomsOffice).toBe(POST_LONG_NO_CODE)
    expect(w.text()).toContain('название длиннее 32 знаков')
    await pick('departureCustomsOffice', '57507')
    expect(w.text()).not.toContain('длиннее 32 знаков')
  })

  it('старое значение таможни отправления, которого нет в списке, показывается как есть (настоящий ZSelect)', async () => {
    const draft = newDraft()
    draft.transit.departureCustomsOffice = 'KZ12345-старое'
    await mount({ stubs: false, draft })
    expect((f('departureCustomsOffice').element as HTMLInputElement).value).toBe('KZ12345-старое')
    // код поста из списка показывается названием поста
    draft.transit.departureCustomsOffice = '57507'
    await flushPromises()
    expect((f('departureCustomsOffice').element as HTMLInputElement).value).toBe(POST_WITH_CODE)
  })

  it('текстовые поля транспортного документа и «Мультимодальная»', async () => {
    const d = await mount()
    await type('transportDocNumber', 'ЖД 52147')
    expect(d.transit.transportDocNumber).toBe('ЖД 52147')
    await type('transportDocNumber', '')
    expect(d.transit.transportDocNumber).toBeNull()
    expect(d.transit.isMultimodal).toBe(true)
    await f('isMultimodal').trigger('click')
    expect(d.transit.isMultimodal).toBe(false)
  })

  it('дата транспортного документа: ДД.ММ.ГГГГ на экране, ISO в черновике', async () => {
    const d = await mount()
    expect((f('transportDocDate').element as HTMLInputElement).value).toBe('28.09.2026')
    await type('transportDocDate', '05.10.2026')
    await f('transportDocDate').trigger('keydown', { key: 'Enter' })
    expect(d.transit.transportDocDate).toBe('2026-10-05')
    d.transit.transportDocDate = '2026-01-31'
    await flushPromises()
    expect((f('transportDocDate').element as HTMLInputElement).value).toBe('31.01.2026')
  })

  it('итоги: числа (запятая и точка); товаров и мест — целые', async () => {
    const d = await mount()
    await type('grossWeightKg', '1 234,5')
    await f('grossWeightKg').trigger('blur')
    expect(d.transit.grossWeightKg).toBe(1234.5)
    await type('totalValue', '99.25')
    await f('totalValue').trigger('blur')
    expect(d.transit.totalValue).toBe(99.25)
    await type('goodsQuantity', '7')
    await f('goodsQuantity').trigger('blur')
    expect(d.transit.goodsQuantity).toBe(7)
    await type('cargoPlacesCount', '40')
    await f('cargoPlacesCount').trigger('blur')
    expect(d.transit.cargoPlacesCount).toBe(40)
    await type('goodsQuantity', '')
    await f('goodsQuantity').trigger('blur')
    expect(d.transit.goodsQuantity).toBeNull()
  })

  it('новая запись: значения по умолчанию из REESTR_TRANSIT_DEFAULTS видны в полях', async () => {
    const draft = newDraft()
    Object.assign(draft.transit, REESTR_TRANSIT_DEFAULTS)
    await mount({ draft })
    expect(f('purposeCode').attributes('data-value')).toBe('06')
    expect(f('entryMethodCode').attributes('data-value')).toBe('RW')
    expect(f('movementDirectionCode').attributes('data-value')).toBe('ПИ')
    expect(f('usedAsDeclarationCode').attributes('data-value')).toBe('СД')
  })

  it('сбой справочников не ломает раздел: поля на месте, варианты пустые', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    refsApi_failAll()
    await mount()
    expect(refsApi.listCountries).toHaveBeenCalledTimes(1)
    expect(refsApi.listCountries).toHaveBeenCalledWith({ silent: true })
    expect(w.findAll('[data-f]').length).toBeGreaterThan(20)
    expect(f('departureCountryCode').findAll('[data-option]')).toHaveLength(0)
    expect(f('departureCustomsOffice').findAll('[data-option]')).toHaveLength(0)
  })

  it('только чтение: все поля выключены, кнопок раздела нет', async () => {
    await mount({ readonly: true })
    expect(w.find('[data-section-actions]').exists()).toBe(false)
    for (const input of w.findAll('input')) expect(input.attributes('disabled'), input.html()).toBeDefined()
    for (const s of w.findAll('[data-select-stub], [data-combo-stub]')) expect(s.attributes('data-disabled')).toBe('true')
    expect(f('isMultimodal').attributes('disabled')).toBeDefined()
    expect(f('isMultimodal').attributes('data-disabled')).toBeDefined()
  })

  it('телефон: поля ≥ 44px и одна колонка', async () => {
    await mount()
    expect(f('transportDocNumber').element.parentElement!.className).toContain('max-sm:h-11')
    expect(f('goodsQuantity').element.parentElement!.className).toContain('max-sm:h-11')
    expect(w.get('[data-main-group="declaration"] > div').classes()).toContain('grid-cols-1')
  })
})

function refsApi_failAll() {
  for (const k of ['listStations', 'listCustomsPosts', 'listCountries', 'listForeignCustomsOffices', 'listOkeiUnits', 'listClassifiers'] as const) {
    refsApi[k].mockRejectedValue(new Error('boom'))
  }
}
