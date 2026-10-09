import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref, watch } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useClassifiersStore } from '@/stores/classifiers'
import type { ClassifierItem, Import40GoodsItemInput, Import40GoodsMarking } from '@/types/api'
import { emptyDtForm, type DtFormState } from '../../dtPayload'
import { useDtGoods } from '../useDtGoods'
import { clearTariffCache } from '../useTariffOptions'
import { resetOkeiUnits } from '../editor/okei'
import { resetKedenLists } from '../useKedenLists'
import { resetGr33Suggest } from '../useGr33Suggest'
import { parseMarkingsSheet } from '../editor/markingsExcel'
import type { GoodsPageContext } from '../editor/types'
import { resetDtTnvedCheckCache } from '../tnvedCodeCheck'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))
vi.mock('@/api/references', () => ({ referencesApi: {
  listClassifiers: vi.fn(async () => []),
  listOkeiUnits: vi.fn(async () => []),
  listCountries: vi.fn(async () => [{ alpha2: 'KZ', name: 'Казахстан' }, { alpha2: 'CN', name: 'Китай' }]),
} }))
vi.mock('@/api/tnved', () => ({ tnvedApi: {
  node: vi.fn(async (code: string) => ({ data: { code, name: code, is10: true } })),
  rates: vi.fn(async () => ({ data: {} })),
  tariffOptions: vi.fn(async () => ({ data: { countryRate: null, excise: [], antiDumping: [], dutyRates: [] } })),
  search: vi.fn(async () => ({ data: [] })),
  reference: vi.fn(async () => ({ data: null })),
} }))
const trois = vi.hoisted(() => ({ check: vi.fn(), search: vi.fn() }))
vi.mock('@/api/trois', async (orig) => ({ ...(await orig<typeof import('@/api/trois')>()), troisApi: trois }))
const keden = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/kedenProcedureLists', async (orig) => ({ ...(await orig<typeof import('@/api/kedenProcedureLists')>()), kedenProcedureListsApi: keden }))
const gr33Api = vi.hoisted(() => ({ list: vi.fn(), suggest: vi.fn() }))
vi.mock('@/api/prohibitionCodes', () => ({ prohibitionCodesApi: gr33Api }))
const xlsx = vi.hoisted(() => ({ rows: [] as unknown[] }))
vi.mock('@/utils/xlsx', () => ({ loadXlsx: async () => ({
  read: () => ({ SheetNames: ['Лист1'], Sheets: { Лист1: {} } }),
  utils: { sheet_to_json: () => xlsx.rows },
}) }))

import SectionGoods from '../SectionGoods.vue'

const cls = (classifierCode: string, ...codes: string[]): ClassifierItem[] =>
  codes.map((code, i) => ({ id: `${classifierCode}-${code}`, classifierCode, code, nameRu: `Название ${code}`, sortOrder: i, isActive: true }))
const CLASSIFIERS: Record<string, ClassifierItem[]> = {
  'ois-indicators': cls('ois-indicators', 'I', 'N', 'S'),
  'restriction-marks': cls('restriction-marks', 'С', 'М', 'П'),
  'certification-kinds': cls('certification-kinds', 'СС'),
}
const REF = [
  { code: 'C1700', name: 'Не подпадает под культурные ценности', categoryCode: 'C17', categoryName: 'Культурные ценности', kind: '', isNegative: true },
  { code: 'D0100', name: 'Не подпадает под тех. регулирование', categoryCode: 'D01', categoryName: 'Тех. регулирование', kind: '', isNegative: true },
  { code: 'D0110', name: 'Обязательная оценка соответствия', categoryCode: 'D01', categoryName: 'Тех. регулирование', kind: '', isNegative: false },
  { code: 'E0100', name: 'Не подпадает под ветконтроль', categoryCode: 'E01', categoryName: 'Ветконтроль', kind: '', isNegative: true },
]
const SUGGEST = {
  tnved: '4202121900', fetchedAtUtc: null, stale: false, warning: null,
  codes: [
    { code: 'D0100', name: null, isNegative: true, inReference: true, sourceResolution: null },
    { code: 'E0100', name: null, isNegative: true, inReference: true, sourceResolution: null },
    { code: 'D0110', name: null, isNegative: false, inReference: true, sourceResolution: null },
    { code: 'C2000', name: 'Экспортный контроль', isNegative: true, inReference: false, sourceResolution: null, exportOnly: true },
  ],
}
const MARK = (o: Partial<{ isActive: boolean; match: 'exact' | 'similar' | 'holder' }> & { no: string }) => ({
  id: Number(o.no), registrationNumber: o.no, objectName: `ЗНАК ${o.no}`, rightHolder: 'ТОО «Правообладатель»', protectionDoc: null,
  validUntil: '2030-01-01', trustedPersons: null, letterRef: null, status: 'Действительный', isActive: o.isActive ?? true, match: o.match ?? 'exact',
})

const item = (o: Partial<Import40GoodsItemInput> = {}): Import40GoodsItemInput => ({
  description: 'СУМКИ', tnvedCode: '4202121900', countryOfOrigin: '156', quantity: 300, unit: 'шт', unitCode: '796',
  grossWeightKg: 54, netWeightKg: 49.5, packagesCount: 3, cargoPlacesQuantity: 3, customsValue: 900, currency: 'USD',
  customsValueKzt: 453980, statisticValueUsd: 916.92, valuationMethodCode: '1', procedureCode: null,
  payments: [{ taxModeCode: '2010', amountKzt: 1000 } as never], needsTpinRecalc: false, markings: [], extras: null, ...o,
})

let w: VueWrapper
let router: Router
let pinia: ReturnType<typeof createPinia>
let form: DtFormState
let model: ReturnType<typeof useDtGoods>
const canEdit = ref(true)
const page: GoodsPageContext = { usdRate: 495, onDate: '2026-10-09', currencyOptions: [], direction: 'ИМ', declProcedure: '40', containerIndicator: false }

const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await flushPromises()
    await nextTick()
  }
}
const mount = async (goods: Import40GoodsItemInput[], o: { readonly?: boolean; item?: number } = {}) => {
  form = reactive({ ...emptyDtForm(), currency: 'USD', goodsItems: goods }) as DtFormState
  canEdit.value = !o.readonly
  model = useDtGoods(form, { readiness: () => null, canEdit })
  const Page = defineComponent({
    setup: () => () => h(SectionGoods, { model, currency: 'USD', readonly: !!o.readonly, countryOptions: [], editorContext: page, saveState: null }),
  })
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/import-40/:caseId/dt/:dtId', name: 'import-40-dt', component: Page }] })
  await router.push(`/import-40/c1/dt/d1?s=goods&item=${o.item ?? 1}`)
  await router.isReady()
  w = mountWithI18n(defineComponent({ render: () => h(RouterView) }), { attachTo: document.body, global: { plugins: [pinia, router] } })
  await settle()
}
const panel = () => document.querySelector('[data-dt-goods-editor][data-state="open"]') as HTMLElement
const q = <T extends Element = HTMLElement>(sel: string) => panel().querySelector<T>(sel)
const qa = <T extends Element = HTMLElement>(sel: string) => [...panel().querySelectorAll<T>(sel)]
const input = (f: string) => q<HTMLInputElement>(`input[data-f="${f}"]`)!
const optionTexts = () => [...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim().split(' — ')[0])
const openSelect = async (f: string) => {
  input(f).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  await settle()
}
const closeSelect = async (f: string) => {
  input(f).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await settle()
}
const pick = async (f: string, code: string) => {
  await openSelect(f)
  const opt = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.trim().startsWith(`${code} `) || o.textContent?.trim() === code)
  expect(opt, `option ${code} in ${f}`).toBeTruthy()
  opt!.click()
  await settle()
}
const type = async (f: string, value: string) => {
  const el = input(f)
  el.focus()
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}
const fieldOf = (f: string) => input(f).closest('[data-goods-field]') as HTMLElement
const click = async (sel: string) => {
  q<HTMLButtonElement>(sel)!.click()
  await settle()
}
const g0 = () => model.items.value[0]

beforeEach(() => {
  resetDtTnvedCheckCache()
  pinia = createPinia()
  setActivePinia(pinia)
  useClassifiersStore().cache = { ...CLASSIFIERS }
  clearTariffCache()
  resetOkeiUnits()
  resetKedenLists()
  resetGr33Suggest()
  keden.get.mockReset().mockResolvedValue({})
  gr33Api.list.mockReset().mockResolvedValue(REF)
  gr33Api.suggest.mockReset().mockResolvedValue(SUGGEST)
  trois.check.mockReset().mockResolvedValue([])
  trois.search.mockReset().mockResolvedValue([])
  xlsx.rows = []
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('Редактор товара: вкладки и ключи полей Task 5', () => {
  it('вкладки «Гр. 33 · Маркировка · Доп. сведения» после «Льготы и процедура»; поля с data-graph и data-goods-field', async () => {
    await mount([item()])
    const tabs = qa('[data-goods-tab]').map((b) => b.textContent)
    expect(tabs.slice(3, 7)).toEqual(['Льготы и процедура', 'Гр. 33', 'Маркировка', 'Доп. сведения'])
    for (const f of ['oisIndicatorCode', 'oisRegNumber', 'oisCountryCode', 'restrictionMarks', 'prohibitionCode', 'markings', 'extras']) {
      const el = q(`[data-goods-field="${f}"][data-goods-index="0"]`)
      expect(el, f).not.toBeNull()
      expect(el!.dataset.graph, f).toBeTruthy()
    }
    // гр. 33 кодов — отдельное поле, не код ТН ВЭД (переход «До подачи» по ключу).
    expect(q('[data-goods-field="prohibitionCode"]')!.querySelector('input[data-f="prohibitionCode"]')).not.toBeNull()
  })
})

describe('Редактор товара: «Гр. 33» — коды запретов и ограничений', () => {
  it('подсказки КЕДЕН по ТН ВЭД: чипы без экспортных (импорт), ничего не подставлено само; чип и «не подпадает» добавляют по нажатию', async () => {
    await mount([item()])
    expect(gr33Api.suggest).toHaveBeenCalledWith('4202121900')
    const chips = qa('[data-gr33-chip]').map((c) => c.textContent?.trim())
    expect(chips).toEqual(['D0100', 'E0100', 'D0110'])
    // Само ничего не выбрано — ни коды, ни «Пересчитать».
    expect(g0().prohibitionCode ?? null).toBeNull()
    expect(g0().needsTpinRecalc).toBe(false)

    await click('[data-gr33-chip="D0110"]')
    expect(g0().prohibitionCode).toBe('D0110')
    expect(q<HTMLButtonElement>('[data-gr33-chip="D0110"]')!.disabled).toBe(true)
    await click('[data-gr33-negatives]')
    expect(g0().prohibitionCode).toBe('D0110,D0100,E0100')
    expect(q('[data-gr33-negatives]')).toBeNull()
    expect(g0().needsTpinRecalc).toBe(false)
  })

  it('список выбора — только коды КЕДЕН (без экспортных при импорте) с названиями из справочника', async () => {
    await mount([item()])
    await openSelect('prohibitionCode')
    expect(optionTexts()).toEqual(['D0100', 'E0100', 'D0110'])
    expect(document.body.querySelector('[role="option"]')!.textContent).toContain('Не подпадает под тех. регулирование')
    await closeSelect('prohibitionCode')
    expect(fieldOf('prohibitionCode').textContent).toContain('Только коды, которые КЕДЕН принимает для ТН ВЭД 4202121900')
    await pick('prohibitionCode', 'E0100')
    expect(g0().prohibitionCode).toBe('E0100')
  })

  it('при экспорте (процедура товара 1000) экспортные коды видны', async () => {
    await mount([item({ procedureCode: '1000' })])
    expect(qa('[data-gr33-chip]').map((c) => c.textContent?.trim())).toEqual(['D0100', 'E0100', 'D0110', 'C2000'])
  })

  it('код вне списка КЕДЕН (и экспортный при импорте) — не удаляется, а подсвечивается', async () => {
    await mount([item({ prohibitionCode: 'C1700,D0110,C2000' })])
    const field = fieldOf('prohibitionCode')
    expect(field.textContent).toContain('КЕДЕН для ТН ВЭД 4202121900 не примет: C1700, C2000')
    expect(g0().prohibitionCode).toBe('C1700,D0110,C2000')
  })

  it('КЕДЕН не ответил — весь справочник и пометка, без тоста; код не 10 знаков — подсказок нет', async () => {
    gr33Api.suggest.mockRejectedValue(new Error('down'))
    await mount([item(), item({ tnvedCode: '4202' })])
    expect(q('[data-gr33-note]')!.textContent).toContain('Подсказки недоступны')
    await openSelect('prohibitionCode')
    expect(optionTexts()).toEqual(['C1700', 'D0100', 'D0110', 'E0100'])
    await closeSelect('prohibitionCode')
    expect(toast.error).not.toHaveBeenCalled()
    await click('[data-goods-next]')
    expect(q('[data-gr33-suggest]')).toBeNull()
  })

  it('КЕДЕН для кода даёт только экспортные — пояснение «оставьте поле пустым»', async () => {
    gr33Api.suggest.mockResolvedValue({ ...SUGGEST, codes: [SUGGEST.codes[3]] })
    await mount([item()])
    expect(q('[data-gr33-note]')!.textContent).toContain('при импорте КЕДЕН кодов гр. 33 не даёт')
    expect(qa('[data-gr33-chip]')).toHaveLength(0)
  })

  it('подсказки — из кэша: при переходе на товар с тем же кодом запроса нет', async () => {
    await mount([item(), item()])
    await click('[data-goods-next]')
    expect(gr33Api.suggest).toHaveBeenCalledTimes(1)
    expect(qa('[data-gr33-chip]')).toHaveLength(3)
  })

  it('признаки соблюдения запретов хранятся CSV «С,М»', async () => {
    await mount([item()])
    await pick('restrictionMarks', 'С')
    await pick('restrictionMarks', 'М')
    expect(g0().restrictionMarks).toBe('С,М')
  })
})

describe('Редактор товара: «Гр. 33» — ОИС и ТРОИС', () => {
  it('знак найден в ТРОИС — подсказка у индикатора, сам индикатор не ставится; выбор рег. № ставит KZ, если пусто', async () => {
    trois.check.mockResolvedValue([{ name: 'ACME', checked: true, matches: [MARK({ no: '1234' }), MARK({ no: '777', isActive: false })] }])
    await mount([item({ tradeMarkName: 'ACME' })])
    await new Promise((r) => setTimeout(r, 750))
    await settle()
    expect(fieldOf('oisIndicatorCode').textContent).toContain('Знак есть в ТРОИС')
    expect(g0().oisIndicatorCode ?? null).toBeNull()

    const reg = input('oisRegNumber')
    reg.focus()
    reg.click()
    reg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await settle()
    const opts = [...document.body.querySelectorAll<HTMLElement>('[data-trois-option]')]
    expect(opts.map((o) => o.dataset.troisOption)).toEqual(['1234', '777'])
    opts[0].closest<HTMLElement>('[role="option"]')!.click()
    await settle()
    expect(g0().oisRegNumber).toBe('1234')
    expect(g0().oisCountryCode).toBe('KZ')
    expect(g0().oisIndicatorCode ?? null).toBeNull()
  })

  it('выбор рег. № не меняет уже указанную страну; ввод — верхним регистром, поиск после паузы', async () => {
    trois.search.mockResolvedValue([MARK({ no: '55555/ТЗ-123456', match: undefined })])
    await mount([item({ oisCountryCode: 'CN' })])
    await type('oisRegNumber', 'знак')
    expect(g0().oisRegNumber).toBe('ЗНАК')
    expect(trois.search).not.toHaveBeenCalled()
    await new Promise((r) => setTimeout(r, 350))
    await settle()
    // Поиск — по набранному тексту (как раньше), в товар — верхним регистром.
    expect(trois.search).toHaveBeenCalledWith('знак')
    const opt = document.body.querySelector<HTMLElement>('[data-trois-option="55555/ТЗ-123456"]')
    expect(opt).not.toBeNull()
    opt!.closest<HTMLElement>('[role="option"]')!.click()
    await settle()
    expect(g0().oisRegNumber).toBe('55555/ТЗ-123456')
    expect(g0().oisCountryCode).toBe('CN')
  })

  it('рег. № не в формате реестра — предупреждение у поля', async () => {
    await mount([item({ oisRegNumber: 'ABC' })])
    expect(fieldOf('oisRegNumber').textContent).toContain('Не в формате реестра')
  })
})

describe('Редактор товара: «Маркировка»', () => {
  it('добавить строку, номер — верхним регистром, уровень/идентификатор/вид из списков, удалить', async () => {
    await mount([item()])
    expect(q('[data-markings-empty]')).not.toBeNull()
    await click('[data-markings-add]')
    expect(g0().markings).toHaveLength(1)
    await type('marking-0-number', '010460abc')
    expect(g0().markings![0].number).toBe('010460ABC')
    await pick('marking-0-level', '2')
    await openSelect('marking-0-application')
    expect(optionTexts()).toEqual(['00', '01', '02', '21', '91', '92'])
    await closeSelect('marking-0-application')
    await pick('marking-0-application', '01')
    await pick('marking-0-type', '301')
    await type('marking-0-kiz', '5')
    const m = g0().markings![0]
    expect([m.levelCode, m.idApplicationCode, m.idTypeCode, m.kizCount]).toEqual(['2', '01', '301', 5])
    expect(g0().needsTpinRecalc).toBe(false)
    await click('[data-marking-remove="0"]')
    expect(g0().markings).toHaveLength(0)
  })

  it('много строк — первые 10, «Показать» добавляет остальные', async () => {
    const markings: Import40GoodsMarking[] = Array.from({ length: 25 }, (_, i) => ({ number: `N${i}`, levelCode: '0' }))
    await mount([item({ markings })])
    expect(qa('[data-marking-row]')).toHaveLength(10)
    await click('[data-markings-more]')
    expect(qa('[data-marking-row]')).toHaveLength(25)
  })

  it('добавление строки при свёрнутом списке не раскрывает весь список: видна новая строка, фокус в её номере', async () => {
    const markings: Import40GoodsMarking[] = Array.from({ length: 400 }, (_, i) => ({ number: `N${i}`, levelCode: '0' }))
    await mount([item({ markings })])
    await click('[data-markings-add]')
    expect(g0().markings).toHaveLength(401)
    expect(qa('[data-marking-row]').map((r) => r.dataset.markingRow)).toEqual([...Array.from({ length: 10 }, (_, i) => String(i)), '400'])
    expect(document.activeElement).toBe(input('marking-400-number'))
    expect(q('[data-goods-markings-section]')!.textContent).toContain('Ещё строк: 390')
    await click('[data-marking-remove="400"]')
    expect(g0().markings).toHaveLength(400)
    expect(qa('[data-marking-row]')).toHaveLength(10)
  })

  it('Excel (без шапки): строки добавляются в конец, тост с количеством', async () => {
    xlsx.rows = [['CODE1', 0, 1, 301], [null, null, null, null], ['CODE2', '1', '21', '101']]
    await mount([item({ markings: [{ number: 'OLD' }] })])
    const fileInput = q<HTMLInputElement>('[data-goods-markings-section] input[type="file"]')!
    const file = new File(['x'], 'marks.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(1) })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fileInput.dispatchEvent(new Event('change'))
    await settle()
    expect(g0().markings!.map((m) => [m.number, m.levelCode, m.idApplicationCode, m.idTypeCode])).toEqual([
      ['OLD', undefined, undefined, undefined], ['CODE1', '0', '01', '301'], ['CODE2', '1', '21', '101'],
    ])
    expect(toast.success).toHaveBeenCalledWith('Добавлено строк маркировки: 2')
  })

  it('разбор листа: пустые строки пропускаются, идентификатор применения дополняется до 2 знаков, флаги — «нет»', () => {
    expect(parseMarkingsSheet([[' A ', 2, 2, '302'], [], ['', null, '', null], 'мусор', [null, '0', null, null]])).toEqual([
      { markingAfterRelease: false, kizCount: null, levelCode: '2', idTypeCode: '302', idApplicationCode: '02', number: 'A', aggregated: false },
      { markingAfterRelease: false, kizCount: null, levelCode: '0', idTypeCode: null, idApplicationCode: null, number: null, aggregated: false },
    ])
  })
})

describe('Редактор товара: «Доп. сведения»', () => {
  it('открытие товара (extras нет, старый вид без списков) и переход НЕ меняют форму', async () => {
    const goods = [item(), item({ extras: { productionPlaceName: 'КИТАЙ' } as never }), item({ markings: undefined as never })]
    form = reactive({ ...emptyDtForm(), goodsItems: goods }) as DtFormState
    const before = JSON.stringify(goods)
    await mount(goods)
    const spy = vi.fn()
    const stop = watch(() => form, spy, { deep: true })
    await click('[data-goods-next]')
    await click('[data-goods-next]')
    await click('[data-goods-prev]')
    stop()
    expect(spy).not.toHaveBeenCalled()
    expect(JSON.stringify(model.items.value)).toBe(before)
  })

  it('блоки свёрнуты, пока пусты; заполненный — раскрыт; автомобили раскрыты для 8701–8705 / 8711', async () => {
    await mount([item(), item({ extras: { exciseStamps: [{ quantity: 10, seriesId: 'AB' }], vehicles: [], traceable: false } }), item({ tnvedCode: '8703231981' })])
    expect(qa('[data-extras-body]')).toHaveLength(0)
    await click('[data-goods-next]')
    expect(qa('[data-extras-body]').map((b) => b.dataset.extrasBody)).toEqual(['stamps'])
    await click('[data-goods-next]')
    expect(qa('[data-extras-body]').map((b) => b.dataset.extrasBody)).toEqual(['vehicles'])
    expect(q('[data-extras-toggle="vehicles"]')!.textContent).toContain('8701–8705')
  })

  it('первая правка создаёт доп. сведения; длины полей как в R.055', async () => {
    await mount([item()])
    await click('[data-extras-toggle="chars"]')
    await type('productionPlaceName', 'гуанчжоу')
    expect(g0().extras).toMatchObject({ productionPlaceName: 'ГУАНЧЖОУ', exciseStamps: [], vehicles: [], traceable: false })
    expect(input('standardName').maxLength).toBe(40)
    expect(input('productionPlaceName').maxLength).toBe(250)

    await click('[data-extras-toggle="stamps"]')
    await click('[data-stamp-add]')
    expect(input('stamp-0-series').maxLength).toBe(8)

    await click('[data-extras-toggle="vehicles"]')
    await click('[data-vehicle-add]')
    expect(g0().extras!.vehicles[0].costCurrency).toBe('USD')
    const lens = { 'car-0-vin': 17, 'car-0-chassis': 20, 'car-0-body': 20, 'car-0-engine': 20, 'car-0-makeCode': 3, 'car-0-makeName': 120, 'car-0-currency': 3, 'car-0-emergency': 50 }
    for (const [f, n] of Object.entries(lens)) expect(input(f).maxLength, f).toBe(n)
    expect(q('[data-vehicle-row="0"]')!.textContent).toContain('КЕДЕН требует «Наименование модели ТС»')
    await type('car-0-makeCode', '1a2b3')
    expect(g0().extras!.vehicles[0].makeCode).toBe('123')

    await click('[data-extras-toggle="invest"]')
    expect(input('investProjectSeqId').maxLength).toBe(4)
    await type('investProjectSeqId', '12')
    expect(q('[data-extras-warn="invest"]')!.className).toContain('text-gold-ink')
    expect(g0().needsTpinRecalc).toBe(false)
  })

  it('переход в поле свёрнутого блока: блок объявляет поля (data-goods-reveal) и раскрывается по goods-reveal', async () => {
    await mount([item({ extras: { standardName: 'ГОСТ', exciseStamps: [], vehicles: [], traceable: false } })])
    await click('[data-extras-toggle="chars"]')
    expect(q('[data-extras-body="chars"]')).toBeNull()
    expect(q('[data-goods-field="standardName"]')).toBeNull()
    const holder = q('[data-goods-reveal~="standardName"]')!
    expect(holder.dataset.extrasToggle).toBe('chars')
    holder.dispatchEvent(new CustomEvent('goods-reveal'))
    await settle()
    expect(q('[data-goods-field="standardName"] input[data-f="standardName"]')).not.toBeNull()
    expect(q('[data-goods-reveal~="standardName"]')).toBeNull()
  })

  it('подсказки-чипы гр. 33 — высотой 44px на телефоне и сенсорном экране', async () => {
    await mount([item()])
    const cls = q('[data-gr33-chip="D0100"]')!.className
    expect(cls).toContain('max-sm:h-11')
    expect(cls).toContain('pointer-coarse:h-11')
  })

  it('прослеживаемость: единица по умолчанию — ДЕИ товара; период — нужны обе даты', async () => {
    await mount([item({ extras: { periodStartDate: '2026-10-01', exciseStamps: [], vehicles: [], traceable: false } })])
    expect(q('[data-extras-warn="period"]')!.textContent).toContain('нужны обе даты')
    await click('[data-extras-toggle="trace"]')
    q<HTMLElement>('[data-f="traceable"]')!.click()
    await settle()
    expect(g0().extras!.traceable).toBe(true)
    expect(g0().extras!.traceUnitCode).toBe('796')
    expect(q('[data-extras-warn="trace"]')).not.toBeNull()
  })
})

describe('Редактор товара: просмотр (Task 5 секции)', () => {
  it('только чтение: поля выключены, нет подсказок-чипов, добавлений и импорта', async () => {
    await mount([item({ markings: [{ number: 'X1', levelCode: '0' }], extras: { exciseStamps: [{ quantity: 1 }], vehicles: [], traceable: false } })], { readonly: true })
    for (const f of ['oisIndicatorCode', 'oisRegNumber', 'oisCountryCode', 'restrictionMarks', 'prohibitionCode', 'marking-0-number', 'marking-0-level', 'stamp-0-quantity']) {
      expect(input(f).disabled, f).toBe(true)
    }
    expect(q('[data-gr33-suggest]')).toBeNull()
    expect(q('[data-markings-add]')).toBeNull()
    expect(q('[data-markings-excel]')).toBeNull()
    expect(q('[data-marking-remove="0"]')).toBeNull()
    expect(q('[data-stamp-add]')).toBeNull()
  })
})
