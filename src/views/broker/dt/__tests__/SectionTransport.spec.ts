import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useClassifiersStore } from '@/stores/classifiers'
import { vUppercase } from '@/directives/uppercase'
import { emptyDtForm, type DtFormState } from '../dtPayload'
import SectionTransport from '../sections/SectionTransport.vue'

vi.mock('@/api/references', () => ({
  referencesApi: {
    getDtGuideGraph: vi.fn(),
    listClassifiers: vi.fn(),
    listCountries: vi.fn().mockResolvedValue([
      { alpha2: 'KZ', name: 'Казахстан' },
      { alpha2: 'CN', name: 'Китай' },
    ]),
  },
}))

const item = (classifierCode: string, code: string, nameRu: string) => ({ id: `${classifierCode}-${code}`, classifierCode, code, nameRu, sortOrder: 0, isActive: true })
let w: VueWrapper
let pinia: ReturnType<typeof createPinia>
let form: DtFormState
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  form = reactive(emptyDtForm())
  useClassifiersStore().cache = {
    '2004': [item('2004', '20', 'железнодорожный'), item('2004', '30', 'автомобильный'), item('2004', '40', 'воздушный')],
    '2024': [item('2024', '10', 'тягач'), item('2024', '30', 'полуприцеп')],
    'vehicle-marks': [item('vehicle-marks', 'VOLVO', 'VOLVO'), item('vehicle-marks', 'MAN', 'MAN')],
  }
})

const mount = async (over: Partial<DtFormState> = {}, props: Record<string, unknown> = {}) => {
  Object.assign(form, over)
  w = mountWithI18n(SectionTransport, {
    props: { form, readonly: false, ...props },
    global: {
      plugins: [pinia],
      directives: { uppercase: vUppercase },
      stubs: { DtGraphHelp: { props: ['graph'], template: '<i data-help :data-help-graph="graph" />' } },
    },
    attachTo: document.body,
  })
  await nextTick(); await nextTick()
  return w
}
const rows = (graph: '18' | '21') => w.findAll(`[data-transport-row="${graph}"]`)
const optionTexts = () => [...document.body.querySelectorAll('[role="option"]')].map((e) => e.textContent?.trim())
const openOf = async (root: Pick<VueWrapper, 'get'>, sel: string) => {
  const el = root.get(sel)
  await (el.element.tagName === 'INPUT' ? el : el.get('input')).trigger('keydown', { key: 'ArrowDown' })
  await nextTick()
}
const pick = async (text: string) => {
  ;([...document.body.querySelectorAll('[role="option"]')].find((e) => e.textContent?.includes(text)) as HTMLElement).click()
  await nextTick()
}
const roleButton = (row: ReturnType<typeof rows>[number], role: 'head' | 'trailer') =>
  row.findAll('[data-role-switch] button').find((b) => b.text() === (role === 'head' ? 'Голова' : 'Прицеп'))!
const veh = (number: string, over: Record<string, unknown> = {}) => ({ number, typeCode: null, nationality: null, mark: null, isTrailer: false, headNumber: null, ...over })

describe('SectionTransport — гр. 18, 19, 21, 25, 26', () => {
  it('порядок блоков: вид транспорта, при прибытии (18), на границе (21)', async () => {
    await mount()
    const parts = ['[data-transport-modes]', '[data-transport-arrival]', '[data-transport-border]'].map((s) => w.get(s).element)
    for (let i = 0; i < parts.length - 1; i++) {
      expect(parts[i].compareDocumentPosition(parts[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(w.get('[data-transport-modes]').text()).toContain('Вид транспорта')
    expect(w.get('[data-transport-modes]').text()).toContain('гр. 18 берём из гр. 26')
  })

  it('гр. 25 / 26: выбор из классификатора 2004, вид гр. 18 следует за гр. 26, иначе гр. 25', async () => {
    await mount()
    await openOf(w, '[data-graph="25"]')
    expect(optionTexts()).toEqual(['20 — железнодорожный', '30 — автомобильный', '40 — воздушный'])
    await pick('40 — воздушный')
    expect(form.borderTransportModeCode).toBe('40')
    expect(form.arrivalTransportModeCode).toBe('40')
    await openOf(w, '[data-graph="26"]')
    await pick('30 — автомобильный')
    expect(form.inlandTransportModeCode).toBe('30')
    expect(form.arrivalTransportModeCode).toBe('30')
    await w.get('[data-graph="26"] button[aria-label="Очистить"]').trigger('click')
    expect(form.inlandTransportModeCode).toBeNull()
    expect(form.arrivalTransportModeCode).toBe('40')
  })

  it('гр. 19: переключатель контейнера', async () => {
    await mount()
    await w.get('[data-graph="19"] [role="switch"]').trigger('click')
    expect(form.containerIndicator).toBe(true)
  })

  it('голова / прицеп — только у видов 30/31/32', async () => {
    await mount({ inlandTransportModeCode: '40', arrivalTransportNumbers: [veh('AB1')] })
    expect(w.find('[data-role-switch]').exists()).toBe(false)
    await w.setProps({ readonly: false })
    form.inlandTransportModeCode = '31'
    await nextTick()
    expect(w.find('[data-transport-arrival] [data-role-switch]').exists()).toBe(true)
    form.inlandTransportModeCode = '30'; form.borderTransportModeCode = '40'
    await nextTick()
    // гр. 21 следует своему виду (гр. 25), гр. 18 — виду гр. 26
    expect(w.find('[data-transport-arrival] [data-role-switch]').exists()).toBe(true)
    expect(w.find('[data-transport-border] [data-role-switch]').exists()).toBe(false)
  })

  it('«Добавить транспорт» добавляет голову; переключатель делает прицеп с выбором головы той же графы', async () => {
    await mount({ inlandTransportModeCode: '30', arrivalTransportNumbers: [veh('AAA111')] })
    await w.get('[data-transport-arrival] [data-transport-add]').trigger('click')
    expect(form.arrivalTransportNumbers).toHaveLength(2)
    expect(form.arrivalTransportNumbers[1]).toMatchObject({ number: '', isTrailer: false, headNumber: null })
    const second = rows('18')[1]
    expect(second.find('[data-transport-head]').exists()).toBe(false)
    expect(second.find('[data-transport-mark]').exists()).toBe(true)
    await roleButton(second, 'trailer').trigger('click')
    expect(form.arrivalTransportNumbers[1].isTrailer).toBe(true)
    // у прицепа вместо марки — «К голове», в списке только головы этой графы
    expect(second.find('[data-transport-mark]').exists()).toBe(false)
    form.borderTransportNumbers.push(veh('ZZZ999'))
    await nextTick()
    await openOf(second, '[data-transport-head]')
    expect(optionTexts()).toEqual(['AAA111'])
    await pick('AAA111')
    expect(form.arrivalTransportNumbers[1].headNumber).toBe('AAA111')
  })

  it('правка номера головы переносит привязку прицепа; удаление головы её снимает', async () => {
    await mount({
      inlandTransportModeCode: '30',
      arrivalTransportNumbers: [veh('AAA11'), veh('TR1', { isTrailer: true, headNumber: 'AAA11' })],
    })
    await rows('18')[0].get('input[data-transport-number]').setValue('AAA111')
    expect(form.arrivalTransportNumbers[0].number).toBe('AAA111')
    expect(form.arrivalTransportNumbers[1].headNumber).toBe('AAA111')
    await rows('18')[0].get('[data-transport-remove]').trigger('click')
    expect(form.arrivalTransportNumbers).toHaveLength(1)
    expect(form.arrivalTransportNumbers[0].headNumber).toBeNull()
  })

  it('головы, превращённые в прицеп, отпускают своих прицепов', async () => {
    await mount({
      inlandTransportModeCode: '30',
      arrivalTransportNumbers: [veh('H1'), veh('T1', { isTrailer: true, headNumber: 'H1' })],
    })
    await roleButton(rows('18')[0], 'trailer').trigger('click')
    expect(form.arrivalTransportNumbers[0].isTrailer).toBe(true)
    expect(form.arrivalTransportNumbers[1].headNumber).toBeNull()
  })

  it('номер ТС — в верхнем регистре; тип и марка — из справочников', async () => {
    await mount({ inlandTransportModeCode: '30', arrivalTransportNumbers: [veh('')] })
    const row = rows('18')[0]
    const input = row.get('input[data-transport-number]')
    await input.setValue('ab12cd')
    expect(form.arrivalTransportNumbers[0].number).toBe('AB12CD')
    expect((input.element as HTMLInputElement).value).toBe('AB12CD')
    await openOf(row, '[data-transport-type]')
    expect(optionTexts()).toEqual(['10 — тягач', '30 — полуприцеп'])
    await pick('10 — тягач')
    expect(form.arrivalTransportNumbers[0].typeCode).toBe('10')
    await openOf(row, '[data-transport-mark]')
    await pick('VOLVO')
    expect(form.arrivalTransportNumbers[0].mark).toBe('VOLVO')
  })

  it('«Скопировать головы из гр. 18»: только головы без привязки; вид и страна — если пусты', async () => {
    await mount({
      inlandTransportModeCode: '30',
      borderTransportModeCode: '',
      arrivalTransportNationality: 'CN',
      borderTransportNationality: '',
      arrivalTransportNumbers: [veh('H1', { typeCode: '10', mark: 'VOLVO' }), veh('T1', { isTrailer: true, headNumber: 'H1' })],
    })
    await w.get('[data-copy-heads]').trigger('click')
    expect(form.borderTransportNumbers).toEqual([veh('H1', { typeCode: '10', mark: 'VOLVO' })])
    expect(form.borderTransportModeCode).toBe('30')
    expect(form.borderTransportNationality).toBe('CN')
    // не перетирает заданные вид и страну
    form.borderTransportModeCode = '40'; form.borderTransportNationality = 'KZ'
    await w.get('[data-copy-heads]').trigger('click')
    expect(form.borderTransportModeCode).toBe('40')
    expect(form.borderTransportNationality).toBe('KZ')
  })

  it('кнопка копирования скрыта, если голов нет или в просмотре', async () => {
    await mount({ inlandTransportModeCode: '30', arrivalTransportNumbers: [veh('T1', { isTrailer: true })] })
    expect(w.find('[data-copy-heads]').exists()).toBe(false)
    form.arrivalTransportNumbers.push(veh('H1'))
    await nextTick()
    expect(w.find('[data-copy-heads]').exists()).toBe(true)
    await w.setProps({ readonly: true })
    expect(w.find('[data-copy-heads]').exists()).toBe(false)
    expect(w.find('[data-transport-add]').exists()).toBe(false)
    expect(w.find('[data-transport-remove]').exists()).toBe(false)
  })

  it('ЖД (вид гр. 25 = 20): гр. 21 не показывается, вместо неё пояснение; копирование недоступно', async () => {
    await mount({ borderTransportModeCode: '20', arrivalTransportNumbers: [veh('W1')] })
    const border = w.get('[data-transport-border]')
    expect(border.find('[data-rail-hint]').text()).toContain('графа 21 не заполняется')
    expect(border.find('[data-transport-list]').exists()).toBe(false)
    expect(border.find('[data-copy-heads]').exists()).toBe(false)
    expect(border.find('[data-transport-add]').exists()).toBe(false)
  })

  it('ЖД: старые номера в гр. 21 остаются видны, чтобы их убрать, без добавления', async () => {
    await mount({ borderTransportModeCode: '20', borderTransportNumbers: [veh('OLD1')] })
    const border = w.get('[data-transport-border]')
    expect(border.find('[data-rail-leftover]').exists()).toBe(true)
    expect(border.find('[data-transport-add]').exists()).toBe(false)
    await border.get('[data-transport-remove]').trigger('click')
    expect(form.borderTransportNumbers).toEqual([])
  })

  it('страна регистрации — одна на графу, над списком, с номером графы; в строке страны нет', async () => {
    await mount({ inlandTransportModeCode: '30', arrivalTransportNumbers: [veh('A1')], borderTransportNumbers: [veh('A1')] })
    expect(w.get('[data-transport-arrival] [data-graph="18"]').text()).toContain('Гр.18')
    expect(w.get('[data-transport-border] [data-graph="21"]').text()).toContain('Гр.21')
    expect(rows('18')[0].text()).not.toContain('Страна')
    await openOf(w.get('[data-transport-arrival]'), '[data-graph="18"]')
    await pick('CN — Китай')
    expect(form.arrivalTransportNationality).toBe('CN')
    expect(form.borderTransportNationality).toBe('KZ')
    await w.get('[data-transport-border] [data-graph="21"] button[aria-label="Очистить"]').trigger('click')
    expect(form.borderTransportNationality).toBe('')
  })

  it('открытие формы ничего не меняет (без записи при монтировании)', async () => {
    const snapshot = JSON.stringify(reactive({ ...emptyDtForm(), inlandTransportModeCode: '30', arrivalTransportNumbers: [veh('H1'), veh('T1', { isTrailer: true, headNumber: 'H1' })] }))
    await mount({ inlandTransportModeCode: '30', arrivalTransportNumbers: [veh('H1'), veh('T1', { isTrailer: true, headNumber: 'H1' })] })
    expect(JSON.stringify(form)).toBe(snapshot)
  })

  it('значение вне справочника показывается с предупреждением', async () => {
    await mount({ borderTransportModeCode: '99', arrivalTransportNumbers: [veh('A1', { typeCode: '777' })] })
    expect(w.get('[data-graph="25"]').text()).toContain('«99» нет в справочнике')
    expect(rows('18')[0].text()).toContain('«777» нет в справочнике')
  })
})
