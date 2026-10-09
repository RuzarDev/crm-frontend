import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useClassifiersStore } from '@/stores/classifiers'
import type { ClassifierItem, Import40GoodsItemInput } from '@/types/api'
import { emptyDtForm, type DtFormState } from '../../dtPayload'
import { useDtGoods } from '../useDtGoods'
import { clearTariffCache } from '../useTariffOptions'
import { resetOkeiUnits } from '../editor/okei'
import { resetKedenLists } from '../useKedenLists'
import type { GoodsPageContext } from '../editor/types'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))
vi.mock('@/api/references', () => ({ referencesApi: { listClassifiers: vi.fn(async () => []), listOkeiUnits: vi.fn(async () => []), listCountries: vi.fn(async () => []) } }))
vi.mock('@/api/prohibitionCodes', () => ({ prohibitionCodesApi: { list: vi.fn(async () => []), suggest: vi.fn(async () => ({ tnved: '', codes: [], fetchedAtUtc: null, stale: false, warning: null })) } }))
vi.mock('@/api/tnved', () => ({ tnvedApi: {
  node: vi.fn(async (code: string) => ({ data: { code, name: code, is10: true } })),
  rates: vi.fn(async () => ({ data: {} })),
  tariffOptions: vi.fn(async () => ({ data: { countryRate: null, excise: [], antiDumping: [], dutyRates: [] } })),
  search: vi.fn(async () => ({ data: [] })),
  reference: vi.fn(async () => ({ data: null })),
} }))
vi.mock('@/api/trois', async (orig) => ({ ...(await orig<typeof import('@/api/trois')>()), troisApi: { check: vi.fn(async () => []), search: vi.fn(async () => []) } }))
const keden = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/kedenProcedureLists', async (orig) => ({ ...(await orig<typeof import('@/api/kedenProcedureLists')>()), kedenProcedureListsApi: keden }))

import SectionGoods from '../SectionGoods.vue'
import ApplyToSelectedModal from '../ApplyToSelectedModal.vue'
import { resetDtTnvedCheckCache } from '../tnvedCodeCheck'

const LISTS = {
  ИМ40: { 'pref-fee': ['ОО', 'МД'], 'pref-duty': ['ОО', 'Z', 'БГ'], 'pref-excise': ['О', 'Z'], 'pref-vat': ['ОО', 'ТТ'], prev: ['00', '51'], 'movement-features': ['000', '001'] },
  ИМ53: { 'pref-fee': ['ОО'], 'pref-duty': ['ОО', 'ВТ'], prev: ['00'] },
  ЭК10: { 'pref-excise': ['Z'] },
}
const cls = (classifierCode: string, ...codes: string[]): ClassifierItem[] =>
  codes.map((code, i) => ({ id: `${classifierCode}-${code}`, classifierCode, code, nameRu: `Название ${code}`, sortOrder: i, isActive: true }))
const CLASSIFIERS: Record<string, ClassifierItem[]> = {
  'pref-fee': cls('pref-fee', 'МД', 'ПП', 'ОО', 'ТХ'),
  'pref-duty': cls('pref-duty', 'БГ', 'ВТ', 'Z', 'ОО', 'ПП'),
  'pref-excise': cls('pref-excise', 'Б', 'Z', 'О'),
  'pref-vat': cls('pref-vat', 'ТТ', 'ОО', 'АХ'),
  'customs-procedures': cls('customs-procedures', '00', '10', '40', '51', '53', '60'),
  'movement-features': cls('movement-features', '000', '001', '002'),
  '2005': cls('2005', '1', '6'),
  '2013': cls('2013', 'CT', 'PX', 'BX'),
  'packaging-availability': cls('packaging-availability', '0', '1', '2'),
  'certification-kinds': cls('certification-kinds', 'СС', 'ДС'),
}

const item = (o: Partial<Import40GoodsItemInput> = {}): Import40GoodsItemInput => ({
  description: 'СУМКИ', tnvedCode: '4202121900', countryOfOrigin: '156', quantity: 300, unit: 'шт', unitCode: '796',
  grossWeightKg: 54, netWeightKg: 49.5, packagesCount: 3, cargoPlacesQuantity: 3, customsValue: 900, currency: 'USD',
  customsValueKzt: 453980, statisticValueUsd: 916.92, valuationMethodCode: '1', prefClearanceCode: 'ОО', prefDutyCode: 'ОО',
  prefExciseCode: 'О', prefVatCode: 'ОО', procedureCode: null, payments: [{ taxModeCode: '2010', amountKzt: 1000 } as never],
  needsTpinRecalc: false, markings: [], extras: null, ...o,
})

let w: VueWrapper
let router: Router
let pinia: ReturnType<typeof createPinia>
let form: DtFormState
let model: ReturnType<typeof useDtGoods>
const canEdit = ref(true)
const page = ref<GoodsPageContext>({ usdRate: 495, onDate: '2026-10-09', currencyOptions: [], direction: 'ИМ', declProcedure: '40', containerIndicator: false })

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
    setup: () => () => h(SectionGoods, { model, currency: 'USD', readonly: !!o.readonly, countryOptions: [], editorContext: page.value, saveState: null }),
  })
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/import-40/:caseId/dt/:dtId', name: 'import-40-dt', component: Page }] })
  await router.push(`/import-40/c1/dt/d1?s=goods&item=${o.item ?? 1}`)
  await router.isReady()
  w = mountWithI18n(defineComponent({ render: () => h(RouterView) }), { attachTo: document.body, global: { plugins: [pinia, router] } })
  await settle()
}
const panel = () => document.querySelector('[data-dt-goods-editor][data-state="open"]') as HTMLElement
const q = <T extends Element = HTMLElement>(sel: string) => panel().querySelector<T>(sel)
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

beforeEach(() => {
  resetDtTnvedCheckCache()
  pinia = createPinia()
  setActivePinia(pinia)
  useClassifiersStore().cache = { ...CLASSIFIERS }
  clearTariffCache()
  resetOkeiUnits()
  resetKedenLists()
  keden.get.mockReset().mockResolvedValue(LISTS)
  page.value = { ...page.value, direction: 'ИМ', declProcedure: '40', containerIndicator: false }
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('Редактор товара: «Льготы и процедура»', () => {
  it('вкладки «Упаковка» и «Льготы и процедура» идут после «Количество и стоимость»; поля гр. 36/37/43/39 с data-graph', async () => {
    await mount([item()])
    const tabs = [...panel().querySelectorAll('[data-goods-tab]')].map((b) => b.textContent)
    expect(tabs.slice(0, 4)).toEqual(['Код и описание', 'Количество и стоимость', 'Упаковка', 'Льготы и процедура'])
    const scope = q('[data-goods-section="prefs"]')!
    for (const g of ['36', '37', '43', '39']) expect(scope.querySelector(`[data-graph="${g}"][data-goods-index="0"]`), g).not.toBeNull()
    // Переход «к недостающему» — по ключу поля (data-goods-field), у каждого поля есть и графа.
    for (const f of ['prefClearanceCode', 'prefDutyCode', 'prefExciseCode', 'prefVatCode', 'procedureCode', 'previousProcedureCode', 'goodsMoveFeatureCode',
      'valuationMethodCode', 'quotaAmount', 'tempImportMonths', 'certificationNote', 'packageAvailabilityCode', 'packageKindCode', 'packageQuantity',
      'cargoPartQuantity', 'packages']) {
      const el = q(`[data-goods-field="${f}"][data-goods-index="0"]`)
      expect(el, f).not.toBeNull()
      expect(el!.dataset.graph, f).toBeTruthy()
    }
  })

  it('гр. 36: «ОО, О, Z» сверху и сужение по списку КЕДЕН (ИМ40); ключ — процедура ДТ, если у товара нет своей', async () => {
    await mount([item()])
    await openSelect('prefDutyCode')
    expect(optionTexts()).toEqual(['ОО', 'Z', 'БГ'])
    await closeSelect('prefDutyCode')
    await openSelect('prefClearanceCode')
    expect(optionTexts()).toEqual(['ОО', 'МД'])
    await closeSelect('prefClearanceCode')
    expect(q('[data-goods-keden-hint]')!.textContent).toContain('ИМ 40')
    expect(q('[data-goods-keden-off]')).toBeNull()
  })

  it('процедура товара задаёт ключ (ИМ53); код вне списка не удаляется, а подсвечивается + общее предупреждение', async () => {
    await mount([item({ procedureCode: '53', prefDutyCode: 'БГ' })])
    expect(input('prefDutyCode').value).toContain('БГ')
    await openSelect('prefDutyCode')
    expect(optionTexts()).toEqual(['ОО', 'БГ', 'ВТ'])
    await closeSelect('prefDutyCode')
    expect(fieldOf('prefDutyCode').textContent).toContain('Нет в списке КЕДЕН для ИМ 53')
    expect(fieldOf('prefClearanceCode').textContent).not.toContain('Нет в списке КЕДЕН')
    // Вне списка — золотая рамка поля (ZSelect status="warning"), в списке — обычная.
    expect(fieldOf('prefDutyCode').innerHTML).toContain('border-gold')
    expect(fieldOf('prefClearanceCode').innerHTML).not.toContain('border-gold')
    const off = q('[data-goods-keden-off]')!
    expect(off.textContent).toContain('ИМ 53')
    expect(off.textContent).toContain('Пошлина: БГ')
    expect(model.items.value[0].prefDutyCode).toBe('БГ')
  })

  it('гр. 37 процедура сужается (K2): только процедуры с списками КЕДЕН у направления; предш. процедура и особенность — по ключу', async () => {
    await mount([item({ procedureCode: '10' })])
    await openSelect('procedureCode')
    expect(optionTexts()).toEqual(['10', '40', '53'])
    await closeSelect('procedureCode')
    expect(fieldOf('procedureCode').textContent).toContain('КЕДЕН не предлагает эту процедуру при ИМ')
    expect(fieldOf('procedureCode').innerHTML).toContain('border-gold')
    // Только процедура вне списка — сказано у поля; общего «КЕДЕН при процедуре ИМ 10 не предлагает: Процедура: 10» нет.
    expect(q('[data-goods-keden-off]')).toBeNull()
    await pick('procedureCode', '40')
    expect(model.items.value[0].procedureCode).toBe('40')
    await openSelect('previousProcedureCode')
    expect(optionTexts()).toEqual(['00', '51'])
    await closeSelect('previousProcedureCode')
    await openSelect('goodsMoveFeatureCode')
    expect(optionTexts()).toEqual(['000', '001'])
  })

  it('без своей процедуры — подсказка «как в ДТ»', async () => {
    await mount([item()])
    expect(input('procedureCode').placeholder).toContain('40')
  })

  it('правки гр. 36 и месяцев временного ввоза помечают «Пересчитать»; квота и метод — нет; открытие — не помечает', async () => {
    await mount([item(), item(), item()])
    const g = model.items.value
    expect(g[0].needsTpinRecalc).toBe(false)
    await pick('prefClearanceCode', 'МД')
    expect(g[0].prefClearanceCode).toBe('МД')
    expect(g[0].needsTpinRecalc).toBe(true)
    await w.unmount()
    document.body.innerHTML = ''

    const goods = [item(), item()]
    await mount(goods, { item: 2 })
    await type('tempImportMonths', '6')
    expect(model.items.value[1].tempImportMonths).toBe(6)
    expect(model.items.value[1].needsTpinRecalc).toBe(true)
    model.items.value[1].needsTpinRecalc = false
    await type('quotaAmount', '10')
    await pick('valuationMethodCode', '6')
    expect(model.items.value[1].quotaAmount).toBe(10)
    expect(model.items.value[1].valuationMethodCode).toBe('6')
    expect(model.items.value[1].needsTpinRecalc).toBe(false)
  })

  it('сертификация: несколько значений хранятся через «; »', async () => {
    await mount([item({ certificationNote: 'СС' })])
    await pick('certificationNote', 'ДС')
    expect(model.items.value[0].certificationNote).toBe('СС; ДС')
  })

  it('списки КЕДЕН не загрузились — полный список, без подсветки и без тоста', async () => {
    keden.get.mockRejectedValue(new Error('net'))
    await mount([item({ prefDutyCode: 'ПП' })])
    await openSelect('prefDutyCode')
    expect(optionTexts()).toEqual(['ОО', 'Z', 'БГ', 'ВТ', 'ПП'])
    await closeSelect('prefDutyCode')
    expect(q('[data-goods-keden-off]')).toBeNull()
    expect(q('[data-goods-keden-hint]')).toBeNull()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('списки КЕДЕН — один запрос на сессию, при переходе между товарами не повторяется', async () => {
    await mount([item(), item(), item()])
    q<HTMLButtonElement>('[data-goods-next]')!.click()
    await settle()
    q<HTMLButtonElement>('[data-goods-next]')!.click()
    await settle()
    expect(keden.get).toHaveBeenCalledTimes(1)
  })
})

describe('Редактор товара: «Упаковка»', () => {
  it('поля упаковки пишутся в товар без «Пересчитать»; частично мест — в доп. сведения', async () => {
    await mount([item()])
    await pick('packageAvailabilityCode', '1')
    await pick('packageKindCode', 'CT')
    await type('packageQuantity', '4')
    await type('cargoPartQuantity', '1')
    const g = model.items.value[0]
    expect(g.packageAvailabilityCode).toBe('1')
    expect(g.packageKindCode).toBe('CT')
    expect(g.packageQuantity).toBe(4)
    expect(g.extras?.cargoPartQuantity).toBe(1)
    expect(g.extras?.exciseStamps).toEqual([])
    expect(g.needsTpinRecalc).toBe(false)
  })

  it('31.2: добавить строку (поддоны по умолчанию), вид не выбран — предупреждение, описание ЗАГЛАВНЫМИ, удалить', async () => {
    await mount([item()])
    expect(q('[data-goods-pkg-row]')).toBeNull()
    q<HTMLButtonElement>('[data-goods-pkg-add]')!.click()
    await settle()
    const g = model.items.value[0]
    expect(g.extras?.packages).toEqual([{ kind: '3', packageKindCode: null, quantity: null, description: null }])
    expect(q('[data-goods-pkg-row="0"]')!.textContent).toContain('Укажите вид упаковки')
    await pick('pkg-0-packageKindCode', 'PX')
    await type('pkg-0-description', 'паллеты')
    expect(g.extras!.packages![0].packageKindCode).toBe('PX')
    expect(g.extras!.packages![0].description).toBe('ПАЛЛЕТЫ')
    q<HTMLButtonElement>('[data-goods-pkg-remove="0"]')!.click()
    await settle()
    expect(g.extras!.packages).toEqual([])
  })

  it('31.3 номер контейнера — только при гр. 19; ЗАГЛАВНЫМИ', async () => {
    await mount([item()])
    expect(q('input[data-f="containerNumber"]')).toBeNull()
    w.unmount()
    document.body.innerHTML = ''
    page.value = { ...page.value, containerIndicator: true }
    await mount([item()])
    await type('containerNumber', 'gldu9071686')
    expect(model.items.value[0].containerNumber).toBe('GLDU9071686')
  })

  it('просмотр: поля упаковки и льгот недоступны, без «Добавить» и «Удалить»', async () => {
    page.value = { ...page.value, containerIndicator: true }
    await mount([item({ extras: { exciseStamps: [], vehicles: [], packages: [{ kind: '1', packageKindCode: 'BX', quantity: 2, description: null }] } })], { readonly: true })
    for (const f of ['packageAvailabilityCode', 'packageKindCode', 'packageQuantity', 'cargoPartQuantity', 'containerNumber', 'prefClearanceCode', 'procedureCode', 'tempImportMonths', 'certificationNote', 'pkg-0-kind']) {
      expect(input(f).disabled, f).toBe(true)
    }
    expect(q('[data-goods-pkg-add]')).toBeNull()
    expect(q('[data-goods-pkg-remove="0"]')).toBeNull()
  })
})

describe('«Применить к выбранным»: списки КЕДЕН (как в редакторе)', () => {
  const goods = () => [item({ procedureCode: '53' }), item({ procedureCode: '53' }), item({ procedureCode: null })]
  let mw: VueWrapper
  const mountModal = async (indexes: number[], extra: Record<string, unknown> = {}) => {
    mw = mountWithI18n(ApplyToSelectedModal, {
      props: { open: true, indexes, goods: goods(), countryOptions: [], direction: 'ИМ', declProcedure: '40', ...extra },
      attachTo: document.body,
      global: { plugins: [pinia] },
    })
    await settle()
  }
  const modal = () => document.querySelector('[data-goods-apply-modal]') as HTMLElement
  const check = async (g: string) => {
    (modal().querySelector(`[data-goods-apply-group="${g}"] [role="checkbox"]`) as HTMLElement).click()
    await settle()
  }
  const openField = async (f: string) => {
    modal().querySelector(`input[data-goods-apply-field="${f}"]`)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await settle()
  }
  const closeField = async (f: string) => {
    modal().querySelector(`input[data-goods-apply-field="${f}"]`)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
  }
  afterEach(() => mw?.unmount())

  it('общая процедура выбранных (53) — ключ ИМ53; «ОО, О, Z» сверху; вне списка — подсветка, не удаление', async () => {
    await mountModal([0, 1])
    await check('preferences')
    await openField('prefDutyCode')
    expect(optionTexts()).toEqual(['ОО', 'ВТ'])
    await closeField('prefDutyCode')
    // Образец (товар 1) — пошлина «ОО» в списке; ставим вне списка через другой образец
    await mw.setProps({ goods: [item({ procedureCode: '53', prefDutyCode: 'БГ' }), item({ procedureCode: '53' }), item()] })
    await mw.setProps({ open: false })
    await mw.setProps({ open: true })
    await settle()
    await check('preferences')
    const field = modal().querySelector('input[data-goods-apply-field="prefDutyCode"]')!.closest('[data-goods-field]')!
    expect(field.textContent).toContain('Нет в списке КЕДЕН для ИМ 53')
    expect(field.innerHTML).toContain('border-gold')
    await openField('prefDutyCode')
    expect(optionTexts()).toEqual(['ОО', 'БГ', 'ВТ'])
  })

  it('группа «Процедура» отмечена и очищена — ключ по процедуре ДТ (товары её и получат), а не по их общей (53)', async () => {
    await mountModal([0, 1])
    await check('procedure')
    await openField('previousProcedureCode')
    expect(optionTexts()).toEqual(['00'])
    await closeField('previousProcedureCode')
    const proc = modal().querySelector('input[data-goods-apply-field="procedureCode"]')!.closest('[data-goods-field]')!
    ;(proc.querySelector('button[aria-label="Очистить"]') as HTMLElement).click()
    await settle()
    await openField('previousProcedureCode')
    expect(optionTexts()).toEqual(['00', '51'])
  })

  it('процедуры выбранных разные — ключ по процедуре ДТ (ИМ40); гр. 37 сужается по направлению', async () => {
    await mountModal([0, 2])
    await check('preferences')
    await openField('prefClearanceCode')
    expect(optionTexts()).toEqual(['ОО', 'МД'])
    await closeField('prefClearanceCode')
    await check('procedure')
    await openField('procedureCode')
    expect(optionTexts()).toEqual(['40', '53'])
  })
})
