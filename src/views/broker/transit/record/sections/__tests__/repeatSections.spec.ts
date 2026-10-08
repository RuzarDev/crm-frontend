import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Component } from 'vue'
import { mountWithI18n } from '@/test/mountWithI18n'
import { COLLECTION_SECTION, TRANSIT_FIELD_SECTION } from '../../recordModel'

vi.mock('@/api/references', async () => ({ referencesApi: (await import('./harness')).refsApi }))

import SectionCarriers from '../SectionCarriers.vue'
import SectionContainers from '../SectionContainers.vue'
import SectionGuarantees from '../SectionGuarantees.vue'
import SectionMisc from '../SectionMisc.vue'
import SectionPackaging from '../SectionPackaging.vue'
import SectionPreceding from '../SectionPreceding.vue'
import SectionSeals from '../SectionSeals.vue'
import SectionTransport from '../SectionTransport.vue'
import { ComboStub, SelectStub, emptyDraft, primeRefs } from './harness'

let w: VueWrapper
const mount = async (component: Component, o: { readonly?: boolean; draft?: ReturnType<typeof emptyDraft> } = {}) => {
  const draft = o.draft ?? emptyDraft()
  w = mountWithI18n(component, {
    props: { draft, readonly: o.readonly ?? false },
    attachTo: document.body,
    global: { stubs: { ZSelect: SelectStub, ZCombobox: ComboStub } },
  })
  await flushPromises()
  return draft
}
const rows = () => w.findAll('[data-repeat-item]')
const f = (key: string, i = 0) => rows()[i].get(`[data-f="${key}"]`)
const pick = async (key: string, option: string, i = 0) => { await f(key, i).get(`[data-option="${option}"]`).trigger('click') }
const typeInto = async (el: ReturnType<typeof f>, text: string) => {
  ;(el.element as HTMLInputElement).value = text
  await el.trigger('input')
}
const type = (key: string, text: string, i = 0) => typeInto(f(key, i), text)
const add = async () => { await w.get('[data-section-add]').trigger('click') }
const sectionField = (key: string) => w.get(`[data-f="${key}"]`)

beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); primeRefs() })
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

describe('SectionCarriers', () => {
  it('новая строка — роль «Перевозчик»; поля пишут в черновик; страна — код ОКСМ', async () => {
    const d = await mount(SectionCarriers)
    expect(w.get('section#sec-carriers h2').text()).toBe('Перевозчики')
    expect(w.get('[data-repeat-empty]').text()).toBe('Перевозчиков и представителей пока нет')
    await add()
    expect(d.carriers[0]).toEqual({ role: 'Перевозчик', subjectType: null, bin: null, name: null, countryCode: null, phone: null, email: null })
    await pick('role', 'Представитель')
    await pick('subjectType', 'ЮЛ')
    await type('bin', '987654321098')
    await type('name', 'КТЖ')
    expect(f('countryCode').get('[data-option="398"]').text()).toBe('398 — Казахстан')
    await pick('countryCode', '398')
    await type('phone', '+7 701')
    await type('email', 'k@tj.kz')
    expect(d.carriers[0]).toEqual({ role: 'Представитель', subjectType: 'ЮЛ', bin: '987654321098', name: 'КТЖ', countryCode: '398', phone: '+7 701', email: 'k@tj.kz' })
    expect(w.find('[data-bin-lookup]').exists()).toBe(false)
  })
})

describe('SectionTransport', () => {
  it('поля и четыре флажка пишут в строку; номер — моно', async () => {
    const d = await mount(SectionTransport)
    await add()
    expect(d.transportMeans[0]).toEqual({
      transportModeCode: null, purposeCode: null, vehicleTypeCode: null, wagonOrContainerNumber: null,
      isEmpty: false, isWagonReturn: false, inContainer: false, matchesTransitVehicle: false,
    })
    await pick('transportModeCode', 'A1')
    await pick('purposeCode', 'A2')
    await pick('vehicleTypeCode', 'A1')
    await type('wagonOrContainerNumber', '52147890')
    for (const k of ['isEmpty', 'isWagonReturn', 'inContainer', 'matchesTransitVehicle']) await f(k).trigger('click')
    expect(d.transportMeans[0]).toEqual({
      transportModeCode: 'A1', purposeCode: 'A2', vehicleTypeCode: 'A1', wagonOrContainerNumber: '52147890',
      isEmpty: true, isWagonReturn: true, inContainer: true, matchesTransitVehicle: true,
    })
    expect(f('wagonOrContainerNumber').classes().join(' ')).toContain('font-mono')
  })
})

describe('SectionSeals', () => {
  it('поля пишут в строку; «Без пломбы» отключает поля и ОЧИЩАЕТ их', async () => {
    const d = await mount(SectionSeals)
    await add()
    await pick('meansTypeCode', 'A1')
    await type('quantity', '2')
    await f('quantity').trigger('blur')
    await type('number', 'SL-123')
    expect(d.identificationMeans[0]).toEqual({ noSeal: false, meansTypeCode: 'A1', quantity: 2, number: 'SL-123' })

    await f('noSeal').trigger('click')
    expect(d.identificationMeans[0]).toEqual({ noSeal: true, meansTypeCode: null, quantity: null, number: null })
    expect(f('meansTypeCode').attributes('data-disabled')).toBe('true')
    expect(f('quantity').attributes('disabled')).toBeDefined()
    expect(f('number').attributes('disabled')).toBeDefined()

    // Снятие флажка поля включает, но старые значения не возвращает.
    await f('noSeal').trigger('click')
    expect(d.identificationMeans[0]).toEqual({ noSeal: false, meansTypeCode: null, quantity: null, number: null })
    expect(f('number').attributes('disabled')).toBeUndefined()
  })
})

describe('SectionContainers', () => {
  it('номер — в верхнем регистре при вводе, заметка — как есть; строка в одну линию (без карточки)', async () => {
    const d = await mount(SectionContainers)
    await add()
    expect(rows()[0].classes().join(' ')).not.toContain('border')
    await type('containerNumber', 'mrsu4885849')
    expect(d.containers[0].containerNumber).toBe('MRSU4885849')
    await type('note', 'пломба сорвана')
    expect(d.containers[0].note).toBe('пломба сорвана')
    await type('containerNumber', '')
    expect(d.containers[0].containerNumber).toBeNull()
    expect(f('containerNumber').classes().join(' ')).toContain('font-mono')
  })
})

describe('SectionPackaging', () => {
  it('скаляр «Сведения об упаковке» (transit.packagingInfoCode) и строки упаковки', async () => {
    const d = await mount(SectionPackaging)
    expect(w.get('section#sec-packaging h2').text()).toBe('Упаковка')
    expect(TRANSIT_FIELD_SECTION.packagingInfoCode).toBe('packaging')
    expect(COLLECTION_SECTION.packages).toBe('packaging')
    await sectionField('packagingInfoCode').get('[data-option="A2"]').trigger('click')
    expect(d.transit.packagingInfoCode).toBe('A2')
    await sectionField('packagingInfoCode').get('[data-clear]').trigger('click')
    expect(d.transit.packagingInfoCode).toBeNull()

    await add()
    await pick('packagingInfoKindCode', 'A1')
    await pick('packageTypeCode', 'A2')
    await type('packageCount', '12')
    await f('packageCount').trigger('blur')
    await type('description', 'Паллеты')
    expect(d.packages[0]).toEqual({ packagingInfoKindCode: 'A1', packageTypeCode: 'A2', packageCount: 12, description: 'Паллеты' })
  })
})

describe('SectionPreceding', () => {
  it('вид документа (2009), номер, дата ДД.ММ.ГГГГ → ISO', async () => {
    const d = await mount(SectionPreceding)
    await add()
    await pick('docTypeCode', 'A1')
    await type('number', 'ПД-77')
    await type('date', '05.10.2026')
    await f('date').trigger('keydown', { key: 'Enter' })
    expect(d.precedingDocs[0]).toEqual({ docTypeCode: 'A1', number: 'ПД-77', date: '2026-10-05' })
  })
})

describe('SectionGuarantees', () => {
  it('вид, сумма, валюта из общего списка, номер', async () => {
    const d = await mount(SectionGuarantees)
    await add()
    await pick('guaranteeTypeCode', 'Банковская гарантия')
    await type('amount', '1500,5')
    await f('amount').trigger('blur')
    expect(f('currencyCode').get('[data-option="CNY"]').text()).toBe('CNY — Юань')
    await pick('currencyCode', 'CNY')
    await type('number', 'BG-1')
    expect(d.guarantees[0]).toEqual({ guaranteeTypeCode: 'Банковская гарантия', amount: 1500.5, currencyCode: 'CNY', number: 'BG-1' })
  })
})

describe('SectionMisc', () => {
  it('скаляры transit: место хранения, пункт назначения, лицо, представившее ПИ', async () => {
    const d = await mount(SectionMisc)
    expect(w.get('section#sec-misc h2').text()).toBe('Прочее')
    expect(w.find('[data-section-count]').exists()).toBe(false)
    await typeInto(sectionField('tempStoragePlace'), 'СВХ-2')
    await typeInto(sectionField('destinationPlace'), 'Ташкент')
    await sectionField('submitterType').get('[data-option="ЮЛ"]').trigger('click')
    await typeInto(sectionField('submitterBin'), '123456789012')
    await typeInto(sectionField('submitterName'), 'ТОО Брокер')
    expect(d.transit).toMatchObject({ tempStoragePlace: 'СВХ-2', destinationPlace: 'Ташкент', submitterType: 'ЮЛ', submitterBin: '123456789012', submitterName: 'ТОО Брокер' })
    await typeInto(sectionField('tempStoragePlace'), '')
    expect(d.transit.tempStoragePlace).toBeNull()
  })

  it('грузовые операции: добавить, выбрать вид, удалить', async () => {
    const d = await mount(SectionMisc)
    expect(w.get('[data-repeat-empty]').text()).toBe('Грузовых операций пока нет')
    await add()
    await add()
    expect(w.get('[data-ops-count]').text()).toBe('2')
    await pick('operationTypeCode', 'Погрузка', 1)
    expect(d.cargoOperations).toEqual([{ operationTypeCode: null }, { operationTypeCode: 'Погрузка' }])
    await w.findAll('[data-repeat-delete]')[0].trigger('click')
    expect(d.cargoOperations).toEqual([{ operationTypeCode: 'Погрузка' }])
  })
})

describe.each([
  ['SectionCarriers', SectionCarriers, 'carriers'],
  ['SectionTransport', SectionTransport, 'transportMeans'],
  ['SectionSeals', SectionSeals, 'identificationMeans'],
  ['SectionContainers', SectionContainers, 'containers'],
  ['SectionPackaging', SectionPackaging, 'packages'],
  ['SectionPreceding', SectionPreceding, 'precedingDocs'],
  ['SectionGuarantees', SectionGuarantees, 'guarantees'],
  ['SectionMisc', SectionMisc, 'cargoOperations'],
] as const)('%s в режиме просмотра', (_name, component, key) => {
  it('без «Добавить» и «Удалить», поля выключены', async () => {
    const draft = emptyDraft()
    const one: Record<string, unknown> = {
      carriers: { role: 'Перевозчик', subjectType: null, bin: null, name: 'КТЖ', countryCode: null, phone: null, email: null },
      transportMeans: { transportModeCode: null, purposeCode: null, vehicleTypeCode: null, wagonOrContainerNumber: '1', isEmpty: false, isWagonReturn: false, inContainer: false, matchesTransitVehicle: false },
      identificationMeans: { noSeal: false, meansTypeCode: null, quantity: null, number: 'S1' },
      containers: { containerNumber: 'ABCU1234567', note: null },
      packages: { packagingInfoKindCode: null, packageTypeCode: null, packageCount: 1, description: null },
      precedingDocs: { docTypeCode: null, number: '1', date: null },
      guarantees: { guaranteeTypeCode: null, amount: 1, currencyCode: null, number: '1' },
      cargoOperations: { operationTypeCode: 'Погрузка' },
    }
    ;(draft[key] as unknown[]).push(one[key])
    await mount(component, { draft, readonly: true })
    expect(w.find('[data-section-add]').exists()).toBe(false)
    expect(w.find('[data-repeat-delete]').exists()).toBe(false)
    const controls = w.findAll('input, button[role="checkbox"], [data-select-stub], [data-combo-stub]')
    expect(controls.length).toBeGreaterThan(0)
    for (const c of controls) {
      const off = c.attributes('disabled') !== undefined || c.attributes('data-disabled') === 'true' || c.attributes('data-disabled') === ''
      expect(off, c.html()).toBe(true)
    }
  })
})
