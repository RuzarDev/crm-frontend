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
import { resetKizState } from '../editor/kizDefaults'
import type { GoodsPageContext } from '../editor/types'
import { resetDtTnvedCheckCache } from '../tnvedCodeCheck'
import { clearMarkingListCache } from '../useMarkingList'

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
const nl = vi.hoisted(() => ({ marking: vi.fn() }))
vi.mock('@/api/nationalLists', async (orig) => ({ ...(await orig<typeof import('@/api/nationalLists')>()), nationalListsApi: nl }))
// Книга Excel: листы по имени; sheet_to_json вызывается дважды — raw:true (значения) и raw:false (текст, как показал бы
// Excel: длинные числа в формате «Общий» — «4.87181E+12»).
const xlsx = vi.hoisted(() => ({ sheets: { Лист1: [] } as Record<string, unknown[][]> }))
const shownText = (v: unknown) => (v == null ? null : typeof v === 'number' && v > 1e11 ? v.toExponential(5).replace('e+', 'E+') : String(v))
vi.mock('@/utils/xlsx', () => ({ loadXlsx: async () => ({
  read: () => ({ SheetNames: Object.keys(xlsx.sheets), Sheets: Object.fromEntries(Object.keys(xlsx.sheets).map((n) => [n, { n }])) }),
  utils: {
    sheet_to_json: (ws: { n: string }, o: { raw?: boolean }) =>
      (o.raw === false ? xlsx.sheets[ws.n].map((r) => r.map(shownText)) : xlsx.sheets[ws.n]),
  },
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
const mount = async (goods: Import40GoodsItemInput[], o: { readonly?: boolean; item?: number; page?: Partial<GoodsPageContext> } = {}) => {
  form = reactive({ ...emptyDtForm(), currency: 'USD', goodsItems: goods }) as DtFormState
  canEdit.value = !o.readonly
  model = useDtGoods(form, { readiness: () => null, canEdit })
  const Page = defineComponent({
    setup: () => () => h(SectionGoods, { model, currency: 'USD', readonly: !!o.readonly, countryOptions: [], editorContext: { ...page, ...o.page }, saveState: null }),
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

const G1 = '4871813090801'
const G2 = '4871813090818'
const G3 = '4006381333931'
const BAD = '4871813090802'
/** Строка КИЗ с общими значениями 0 · 01 · 999 · 1. */
const mk = (number: string | null, o: Partial<Import40GoodsMarking> = {}): Import40GoodsMarking => ({
  number, levelCode: '0', idApplicationCode: '01', idTypeCode: '999', kizCount: 1, aggregated: false, markingAfterRelease: false, ...o,
})
const paste = (f: string, text: string) => {
  const ev = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'clipboardData', { value: { getData: () => text } })
  input(f).dispatchEvent(ev)
  return ev
}
const upload = async () => {
  const fileInput = q<HTMLInputElement>('[data-goods-markings-section] input[type="file"]')!
  const file = new File(['x'], 'invoice.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(1) })
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
  fileInput.dispatchEvent(new Event('change'))
  await settle()
  expect(document.body.querySelector('[data-kiz-excel-modal]')).not.toBeNull()
}
const modal = (sel: string) => document.body.querySelector<HTMLElement>(`[data-kiz-excel-modal] ${sel}`)
const okBtn = (text: string) => [...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent?.trim() === text)
const okButton = async (text: string) => {
  const b = okBtn(text)
  expect(b, text).toBeTruthy()
  b!.click()
  await settle()
}
const pickIn = async (scope: HTMLElement, f: string, startsWith: string) => {
  const el = scope.querySelector<HTMLInputElement>(`input[data-f="${f}"]`)!
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  await settle()
  const opt = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.trim().startsWith(startsWith))
  expect(opt, startsWith).toBeTruthy()
  opt!.click()
  await settle()
}

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
  clearMarkingListCache()
  nl.marking.mockReset().mockResolvedValue({ actLabel: 'Приказ МТИ РК № 199-НҚ', actUrl: 'u', items: [] })
  xlsx.sheets = { Лист1: [] }
  resetKizState()
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

  // 23.10.2026: D0122 (условный выпуск) — подсказка про обязательство; «Сформировать обязательство» — при праве страницы.
  it('D0122 — подсказка про обязательство (гр. 44 — 08999) и «Сформировать обязательство», если страница даёт', async () => {
    const openObligation = vi.fn()
    await mount([item({ prohibitionCode: 'D0110' })], { page: { openObligation } })
    expect(q('[data-gr33-condrel]')).toBeNull()
    g0().prohibitionCode = 'D0110,D0122'
    await settle()
    expect(q('[data-gr33-condrel]')!.textContent).toContain('D0122 — условный выпуск')
    await click('[data-gr33-condrel-obligation]')
    expect(openObligation).toHaveBeenCalledTimes(1)
    w.unmount()
    await mount([item({ prohibitionCode: 'D0122' })], { readonly: true })
    expect(q('[data-gr33-condrel]')).not.toBeNull()
    expect(q('[data-gr33-condrel-obligation]')).toBeNull()
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
    await mount([item({ characteristics: [{ tradeMarkName: 'ACME' }] })])
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
  it('подсказка «подлежит маркировке с …» по перечню Приказа МТИ № 199-НҚ на дату гр. А', async () => {
    nl.marking.mockResolvedValue({ actLabel: 'Приказ МТИ РК № 199-НҚ', actUrl: 'u', items: [{ code: '2402209000', rows: [
      { number: 1, codeText: '2402 20 900 0', name: 'прочие сигареты', partial: false, startDate: '2020-10-01', required: true, condition: null, check: null },
    ] }] })
    await mount([item({ tnvedCode: '2402209000' })])
    expect(nl.marking).toHaveBeenCalledWith(['2402209000'], '2026-10-09', { silent: true })
    expect(q('[data-marking-hint]')!.textContent).toContain('Подлежит маркировке с 01.10.2020 · Приказ МТИ РК № 199-НҚ, поз. 1')
  })

  it('код не в перечне — подсказки нет', async () => {
    await mount([item()])
    expect(q('[data-marking-hint]')).toBeNull()
  })

  it('«Для всех кодов»: «+» даёт строку с общими значениями — вводится только номер (верхним регистром), удалить', async () => {
    await mount([item()])
    expect(q('[data-markings-empty]')).not.toBeNull()
    await pick('marking-default-level', '0')
    await openSelect('marking-default-application')
    expect(optionTexts()).toEqual(['00', '01', '02', '21', '91', '92'])
    await closeSelect('marking-default-application')
    await pick('marking-default-application', '01')
    await pick('marking-default-type', '999')
    await type('marking-default-kiz', '1')
    await click('[data-markings-add]')
    expect(g0().markings).toHaveLength(1)
    expect(document.activeElement).toBe(input('marking-0-number'))
    // Поля строки скрыты — вводится только номер.
    expect(q('input[data-f="marking-0-level"]')).toBeNull()
    await type('marking-0-number', '010460abc')
    const m = g0().markings![0]
    expect([m.number, m.levelCode, m.idApplicationCode, m.idTypeCode, m.kizCount, m.aggregated, m.markingAfterRelease])
      .toEqual(['010460ABC', '0', '01', '999', 1, false, false])
    expect(g0().needsTpinRecalc).toBe(false)
    await click('[data-marking-remove="0"]')
    expect(g0().markings).toHaveLength(0)
  })

  it('смена общего значения меняет строки, кроме изменённой вручную; «Как у всех» возвращает строку', async () => {
    await mount([item({ markings: [mk(G1), mk(G2), mk(G3)] })])
    expect(q<HTMLInputElement>('input[data-f="marking-default-level"]')!.value).toBe('0')
    await click('[data-marking-edit="1"]')
    expect(q('[data-marking-edit="1"]')!.getAttribute('aria-expanded')).toBe('true')
    await pick('marking-1-level', '2')
    expect(q('[data-marking-custom="1"]')!.textContent).toContain('свои значения: Уровень 2')
    await pick('marking-default-level', '1')
    expect(g0().markings!.map((x) => x.levelCode)).toEqual(['1', '2', '1'])
    expect(q('[data-markings-applied]')!.textContent).toBe('Изменено у кодов: 2')
    expect(q('[data-markings-totals]')!.textContent).toContain('со своими значениями: 1')
    await click('[data-marking-reset="1"]')
    expect(g0().markings![1].levelCode).toBe('1')
    expect(q('[data-marking-custom="1"]')).toBeNull()
    expect(q('input[data-f="marking-1-level"]')).toBeNull()
  })

  it('Enter в последнем заполненном номере добавляет строку (сканер), в пустом — нет', async () => {
    await mount([item({ markings: [mk(G1)] })])
    const enter = async (f: string) => {
      input(f).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await settle()
    }
    await enter('marking-0-number')
    expect(g0().markings).toHaveLength(2)
    // Пустая строка — без количества КИЗ: оно придёт с номером (в XML CIMQuantity — сумма по всем строкам).
    expect(g0().markings![1]).toMatchObject({ number: null, levelCode: '0', idApplicationCode: '01', idTypeCode: '999', kizCount: null })
    expect(document.activeElement).toBe(input('marking-1-number'))
    await enter('marking-1-number')
    expect(g0().markings).toHaveLength(2)
    await enter('marking-0-number')
    expect(document.activeElement).toBe(input('marking-1-number'))
  })

  it('ревью: сканер — 2 кода с Enter после каждого: «КИЗ всего» = 2, а не 3 (пустая строка без количества)', async () => {
    await mount([item()])
    await pick('marking-default-level', '0')
    await type('marking-default-kiz', '1')
    await click('[data-markings-add]')
    const scan = async (i: number, code: string) => {
      await type(`marking-${i}-number`, code)
      input(`marking-${i}-number`).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await settle()
    }
    await scan(0, G1)
    await scan(1, G2)
    expect(g0().markings!.map((m) => [m.number, m.kizCount])).toEqual([[G1, 1], [G2, 1], [null, null]])
    expect(q('[data-markings-totals]')!.textContent).toContain('Кодов: 2 · КИЗ всего (в XML): 2')
    expect(q('[data-markings-blanks]')!.textContent).toContain('Пустых строк: 1')
    expect(document.activeElement).toBe(input('marking-2-number'))
    // Номер стёрт — количество снимается; набран снова — возвращается.
    await type('marking-1-number', '')
    expect(g0().markings![1].kizCount).toBeNull()
    await type('marking-1-number', G2)
    expect(g0().markings![1].kizCount).toBe(1)
  })

  it('вставка столбца в поле номера: коды раскладываются по строкам с общими значениями, повтор — «Уже в списке»', async () => {
    await mount([item({ markings: [mk(G1)] })])
    await click('[data-markings-add]')
    const ev = paste('marking-1-number', `${G2}\r\n${G3}\r\n036000291452\r\n`)
    await settle()
    expect(ev.defaultPrevented).toBe(true)
    expect(g0().markings!.map((x) => x.number)).toEqual([G1, G2, G3, '036000291452'])
    expect(g0().markings![3]).toMatchObject({ levelCode: '0', idApplicationCode: '01', idTypeCode: '999', kizCount: 1 })
    expect(toast.success).toHaveBeenCalledWith('Добавлено кодов: 3')
    paste('marking-0-number', `${G1}\n96385074`)
    await settle()
    expect(g0().markings).toHaveLength(5)
    expect(toast.info).toHaveBeenCalledWith('Уже в списке: 1')
    // Один код без переводов строк — обычная вставка браузера.
    expect(paste('marking-0-number', G1).defaultPrevented).toBe(false)
  })

  it('ревью: «Вставить списком» — текст письма и строки длиннее 100 знаков не становятся номерами', async () => {
    await mount([item({ markings: [mk(G1)] })])
    await click('[data-markings-paste-open]')
    const ta = q<HTMLTextAreaElement>('textarea[data-f="markings-paste"]')!
    ta.value = `Добрый день, высылаю коды\nКод товара\n${G2}\n${'9'.repeat(420)}`
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    await click('[data-markings-paste-apply]')
    expect(g0().markings!.map((x) => x.number)).toEqual([G1, G2])
    expect(toast.success).toHaveBeenCalledWith('Добавлено кодов: 1')
    expect(toast.warning).toHaveBeenCalledWith('Не коды (текст, «Итого», длиннее 100 знаков): 7 — пропущены')
    // В поле номера: строки через перевод — перехват, слова не добавляются.
    const ev = paste('marking-0-number', `Итого\n${'A'.repeat(300)}`)
    await settle()
    expect(ev.defaultPrevented).toBe(true)
    expect(g0().markings).toHaveLength(2)
  })

  it('«Вставить списком»: Ctrl+Enter добавляет коды, Esc закрывает', async () => {
    await mount([item({ markings: [mk(G1)] })])
    await click('[data-markings-paste-open]')
    const ta = q<HTMLTextAreaElement>('textarea[data-f="markings-paste"]')!
    expect(document.activeElement).toBe(ta)
    ta.value = `GTIN\n${G2}\n${G1}`
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    await settle()
    expect(g0().markings!.map((x) => x.number)).toEqual([G1, G2])
    expect(toast.success).toHaveBeenCalledWith('Добавлено кодов: 1')
    expect(toast.info).toHaveBeenCalledWith('Уже в списке: 1')
    expect(q('[data-markings-paste]')).toBeNull()
  })

  it('ревью: агрегированная упаковка (SSCC, таможенный код) — без проверки GTIN, как на сервере', async () => {
    await mount([item({ markings: [mk('046000000000000017', { aggregated: true }), mk(BAD, { aggregated: true })] })])
    expect(q('[data-marking-problem="0"]')).toBeNull()
    expect(q('[data-marking-problem="1"]')).toBeNull()
    expect(q('[data-markings-bad]')).toBeNull()
  })

  it('GTIN: неверная контрольная цифра GS1 — подсказка у номера и в итогах; сохранение не блокируется', async () => {
    await mount([item({ markings: [mk(BAD), mk(G1), mk('0104600000000001', { idApplicationCode: '21' })] })])
    expect(q('[data-marking-problem="0"]')!.textContent).toContain('не сходится контрольная цифра GS1')
    expect(input('marking-0-number').getAttribute('aria-describedby')).toBe(q('[data-marking-problem="0"]')!.id)
    expect(q('[data-marking-problem="1"]')).toBeNull()
    expect(q('[data-marking-problem="2"]')).toBeNull()
    expect(q('[data-markings-totals]')!.textContent).toContain('Кодов: 3 · КИЗ всего (в XML): 3')
    expect(q('[data-markings-bad]')!.textContent).toContain('с ошибкой GTIN: 1')
  })

  it('итоги: КИЗ всего = сумма по строкам (как CIMQuantity), пустые строки и строки только с количеством — отдельно', async () => {
    await mount([item({ markings: [mk(G1), mk(G2, { kizCount: 5 }), mk(null, { kizCount: null }), mk(null, { kizCount: 3 })] })])
    expect(q('[data-markings-totals]')!.textContent).toContain('Кодов: 2 · КИЗ всего (в XML): 9')
    expect(q('[data-markings-blanks]')!.textContent).toContain('Пустых строк: 1')
    // Количество и у кодов, и у строки без номера — выделено: итог, скорее всего, завышен.
    const qty = q('[data-markings-qty-only]')!
    expect(qty.textContent).toContain('без номера, только с количеством: 1 — входит в «КИЗ всего»')
    expect(qty.className).toContain('text-gold-ink')
  })

  it('ревью: старая ДТ — количество в строке без номера, у кодов пусто: не «пустая строка — удалите»', async () => {
    await mount([item({ markings: [mk(null, { kizCount: 500 }), mk(G1, { kizCount: null }), mk(G2, { kizCount: null })] })])
    expect(q('[data-markings-totals]')!.textContent).toContain('КИЗ всего (в XML): 500')
    expect(q('[data-markings-blanks]')).toBeNull()
    expect(q('[data-markings-qty-only]')!.className).toContain('text-muted')
  })

  it('«После выпуска» — только в общих значениях: при пустом списке включение создаёт строку-носитель, выключение убирает', async () => {
    await mount([item()])
    q<HTMLElement>('[data-f="marking-default-after"]')!.click()
    await settle()
    expect(g0().markings).toEqual([expect.objectContaining({ number: null, markingAfterRelease: true })])
    expect(q('[data-f="marking-0-after"]')).toBeNull()
    expect(q('[data-markings-after-note]')!.textContent).toContain('только признак «ПВ»')
    q<HTMLElement>('[data-f="marking-default-after"]')!.click()
    await settle()
    expect(g0().markings).toEqual([])
  })

  it('ревью: «после выпуска» — носитель не удаляется и не «пустая строка»; удалили последний код — признак остаётся в данных', async () => {
    await mount([item()])
    const after = () => q<HTMLElement>('[data-f="marking-default-after"]')!
    after().click()
    await settle()
    expect(q('[data-marking-remove="0"]')).toBeNull()
    expect(q('[data-markings-blanks]')).toBeNull()
    // Код рядом с носителем: носитель теперь можно удалить, затем удалить и код — носитель возвращается.
    await click('[data-markings-add]')
    await type('marking-1-number', G1)
    await click('[data-marking-remove="0"]')
    expect(g0().markings!.map((m) => [m.number, m.markingAfterRelease])).toEqual([[G1, true]])
    await click('[data-marking-remove="0"]')
    expect(g0().markings).toEqual([expect.objectContaining({ number: null, markingAfterRelease: true })])
    expect(after().getAttribute('aria-checked')).toBe('true')
    expect(q('[data-markings-after-note]')).not.toBeNull()
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

  it('Excel-инвойс: номер инвойса не берётся, столбец «Штрих-код» по шапке, предпросмотр, «Добавить 2» — с общими значениями', async () => {
    xlsx.sheets = { Invoice: [
      ['INVOICE / ИНВОЙС', null, null, null],
      ['Invoice No', 'Описание', 'Кол-во', 'Штрих-код'],
      [2026020201, 'Сушилка для белья', 470, 4871813090818],
      [2026020201, 'Полки для обуви', 300, BAD],
      ['Итого', null, 770, null],
    ] }
    await mount([item({ markings: [mk(G1)] })])
    await upload()
    expect(modal('[data-kiz-excel-found]')!.textContent).toBe('Найдено кодов: 2')
    expect(modal('[data-kiz-excel-source]')!.textContent).toBe('по шапке «Штрих-код» (лист «Invoice», столбец D)')
    expect(modal('[data-kiz-excel-counter="excelBadCheck"]')!.textContent).toContain('С ошибкой контрольной цифры: 1')
    expect(modal('[data-kiz-excel-defaults]')!.textContent).toBe('Остальные поля — из «Для всех кодов»: 0 · 01 · 999 · 1')
    expect(g0().markings).toHaveLength(1)
    await okButton('Добавить 2')
    expect(g0().markings!.map((x) => [x.number, x.levelCode, x.idApplicationCode, x.idTypeCode, x.kizCount])).toEqual([
      [G1, '0', '01', '999', 1], [G2, '0', '01', '999', 1], [BAD, '0', '01', '999', 1],
    ])
    expect(toast.success).toHaveBeenCalledWith('Добавлено кодов: 2')
    expect(q('[data-marking-problem="2"]')).not.toBeNull()
  })

  it('Excel: выбор столбца вручную пересчитывает «Найдено»; ничего не найдено — «Добавить 0» выключена', async () => {
    xlsx.sheets = { Invoice: [['Invoice No', 'Описание'], [2026020201, 'Сушилка'], [2026020202, 'Полка']] }
    await mount([item()])
    await upload()
    expect(modal('[data-kiz-excel-found]')!.textContent).toBe('Найдено кодов: 0')
    expect(modal('[data-kiz-excel-none]')).not.toBeNull()
    expect(modal('[data-kiz-excel-defaults-empty]')).not.toBeNull()
    expect(okBtn('Добавить 0')!.disabled).toBe(true)
    await pickIn(document.body, 'kiz-excel-column', 'Invoice · A «Invoice No»')
    expect(modal('[data-kiz-excel-found]')!.textContent).toBe('Найдено кодов: 2')
    expect(modal('[data-kiz-excel-source]')!.textContent).toBe('столбец выбран вручную (лист «Invoice», столбец A)')
  })

  it('Excel старого формата (без шапки: номер · уровень · идентификатор · вид) — значения из файла', async () => {
    xlsx.sheets = { Лист1: [['CODE1', 0, 1, 301], [null, null, null, null], ['CODE2', '1', '21', '101']] }
    await mount([item({ markings: [{ number: 'OLD' }] })])
    await upload()
    expect(modal('[data-kiz-excel-source]')!.textContent).toContain('файл без шапки')
    // Предпросмотр показывает значения из файла рядом с номером.
    expect([...document.body.querySelectorAll('[data-kiz-excel-sample-extra]')].map((e) => e.textContent)).toEqual(['0 · 01 · 301', '1 · 21 · 101'])
    await okButton('Добавить 2')
    expect(g0().markings!.map((m) => [m.number, m.levelCode, m.idApplicationCode, m.idTypeCode])).toEqual([
      ['OLD', undefined, undefined, undefined], ['CODE1', '0', '01', '301'], ['CODE2', '1', '21', '101'],
    ])
    expect(toast.success).toHaveBeenCalledWith('Добавлено кодов: 2')
  })

  it('Excel с артикулами: коды раскладываются по товарам ДТ', async () => {
    xlsx.sheets = { Invoice: [
      ['Артикул', 'Наименование', 'Штрих-код'],
      ['URS07', 'Сушилка', G1],
      ['GSL010', 'Полка', G2],
      ['GSL-010', 'Полка', G3],
    ] }
    await mount([
      item({ description: 'СУШИЛКА', characteristics: [{ productArticle: 'URS07' }], markings: [mk(BAD, { levelCode: '1' })] }),
      item({ description: 'ПОЛКА', characteristics: [{ productArticle: 'GSL010' }] }),
    ])
    await upload()
    expect(modal('[data-kiz-excel-group="0"]')!.textContent).toContain('Товар 1: кодов 1')
    expect(modal('[data-kiz-excel-group="1"]')!.textContent).toContain('Товар 2: кодов 2')
    await okButton('Добавить 3')
    expect(model.items.value[0].markings!.map((m) => m.number)).toEqual([BAD, G1])
    expect(model.items.value[1].markings!.map((m) => [m.number, m.levelCode])).toEqual([[G2, '1'], [G3, '1']])
    expect(toast.success).toHaveBeenCalledWith('Добавлено кодов: 3, товаров: 2')
    // Предпросмотр закрыт — матрицы книги не держим.
    expect(document.body.querySelector('[data-kiz-excel-modal]')).toBeNull()
  })

  it('ревью: раскладка — товар-получатель со своими общими значениями получает их, «после выпуска» этого товара не переносится', async () => {
    xlsx.sheets = { Invoice: [
      ['Артикул', 'Наименование', 'Штрих-код'],
      ['URS07', 'Сушилка', G1],
      ['GSL010', 'Полка', G2],
    ] }
    await mount([
      item({ description: 'СУШИЛКА', characteristics: [{ productArticle: 'URS07' }], markings: [mk(null, { kizCount: null, markingAfterRelease: true })] }),
      item({ description: 'ПОЛКА', characteristics: [{ productArticle: 'GSL010' }], markings: [mk(G3, { levelCode: '1', idTypeCode: '301', kizCount: 2 })] }),
      item({ description: 'ПУСТОЙ', characteristics: [{ productArticle: 'X1' }] }),
    ])
    await upload()
    await okButton('Добавить 2')
    const [a, b] = model.items.value
    expect(a.markings!.map((m) => [m.number, m.markingAfterRelease])).toEqual([[G1, true]])
    expect(b.markings!.map((m) => [m.number, m.levelCode, m.idTypeCode, m.kizCount, m.markingAfterRelease])).toEqual([
      [G3, '1', '301', 2, false], [G2, '1', '301', 2, false],
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
    await mount([item({ extras: { productionPlaceName: 'ШАНХАЙ', exciseStamps: [], vehicles: [], traceable: false } })])
    await click('[data-extras-toggle="chars"]')
    expect(q('[data-extras-body="chars"]')).toBeNull()
    expect(q('[data-goods-field="productionPlaceName"]')).toBeNull()
    const holder = q('[data-goods-reveal~="productionPlaceName"]')!
    expect(holder.dataset.extrasToggle).toBe('chars')
    holder.dispatchEvent(new CustomEvent('goods-reveal'))
    await settle()
    expect(q('[data-goods-field="productionPlaceName"] input[data-f="productionPlaceName"]')).not.toBeNull()
    expect(q('[data-goods-reveal~="productionPlaceName"]')).toBeNull()
    // Сорт и стандарт — в строках характеристик («Код и описание»), не в доп. сведениях.
    expect(q('input[data-f="standardName"]')).toBeNull()
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
    // единица — выбор из ОКЕИ (окно «Единицы измерения» КЕДЕН), а не свободный ввод
    expect(q('input[data-f="traceUnitCode"]')!.hasAttribute('data-okei-select')).toBe(true)
    expect(q<HTMLInputElement>('input[data-f="traceUnitCode"]')!.value).toBe('796')
    expect(q('[data-extras-warn="trace"]')).not.toBeNull()
  })
})

describe('Редактор товара: «Доп. сведения» — диапазон дат (№14б)', () => {
  it('дата выпуска 1995 (товар и автомобиль) — без предупреждения (нижняя граница 1900); 2202/2207 — предупреждение у поля', async () => {
    await mount([item({ extras: {
      manufactureDate: '1995-06-01', periodStartDate: '2026-10-01', periodEndDate: '2202-01-01', traceable: false, exciseStamps: [],
      vehicles: [{ modelName: 'CAMRY', manufactureDate: '1985-05-05' }, { modelName: 'CAMRY', manufactureDate: '2207-05-05' }],
    } })])
    const warnAt = (sel: string) => q(sel)!.closest('[data-z-field]')!.querySelector('[data-z-status="warning"]')?.textContent ?? null
    expect(warnAt('input[data-f="manufactureDate"]')).toBeNull()
    expect(warnAt('input[data-f="car-0-date"]')).toBeNull()
    expect(warnAt('input[data-f="car-1-date"]')).toMatch(/^05\.05\.2207 позже/)
    expect(warnAt('input[data-f="periodStartDate"]')).toBeNull()
    expect(warnAt('input[data-f="periodEndDate"]')).toMatch(/^01\.01\.2202 позже/)
  })
})

describe('Редактор товара: просмотр (Task 5 секции)', () => {
  it('только чтение: поля выключены, нет подсказок-чипов, добавлений и импорта', async () => {
    await mount([item({ markings: [{ number: 'X1', levelCode: '0' }], extras: { exciseStamps: [{ quantity: 1 }], vehicles: [], traceable: false } })], { readonly: true })
    for (const f of ['oisIndicatorCode', 'oisRegNumber', 'oisCountryCode', 'restrictionMarks', 'prohibitionCode', 'marking-0-number', 'marking-default-level', 'marking-default-kiz', 'stamp-0-quantity']) {
      expect(input(f).disabled, f).toBe(true)
    }
    expect(q('[data-gr33-suggest]')).toBeNull()
    expect(q('[data-markings-add]')).toBeNull()
    expect(q('[data-markings-excel]')).toBeNull()
    expect(q('[data-markings-paste-open]')).toBeNull()
    expect(q('[data-marking-edit="0"]')).toBeNull()
    expect(q('[data-marking-remove="0"]')).toBeNull()
    expect(q('[data-stamp-add]')).toBeNull()
  })
})
