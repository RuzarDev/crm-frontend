import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref, type EffectScope } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { vUppercase } from '@/directives/uppercase'
import type { DtsView } from '@/api/dts'

const dtsApi = vi.hoisted(() => ({ get: vi.fn(), pdf: vi.fn(), xml: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/dts', () => ({ dtsApi }))
vi.mock('@/ui/message', () => ({ message: toast }))

import { confirmState } from '@/ui/confirm'
import { emptyDtForm, type DtFormState } from '../../dtPayload'
import SectionDts from '../SectionDts.vue'
import { useDts } from '../useDts'
import { dtsGoods, dtsSheet, dtsView } from './dtsFixture'

let w: VueWrapper
let scope: EffectScope | null = null
afterEach(() => {
  w?.unmount()
  scope?.stop()
  scope = null
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

const goods = (valuationMethodCode: string | null, o: Record<string, unknown> = {}) =>
  ({ description: 'ВИНТЫ', tnvedCode: '7318150000', valuationMethodCode, ...o }) as never

async function mount(o: { view?: DtsView; readonly?: boolean; form?: Partial<DtFormState>; editable?: boolean; enabled?: boolean; fail?: boolean } = {}) {
  if (o.fail) dtsApi.get.mockRejectedValue(new Error('500'))
  else dtsApi.get.mockResolvedValue(o.view ?? dtsView())
  const form = reactive({ ...emptyDtForm(), goodsItems: [goods('1')], ...o.form }) as DtFormState
  const recalcCustomsValues = vi.fn(async () => ({ updated: 1, total: 1 }))
  const save = vi.fn(async () => true)
  scope = effectScope()
  const dts = scope.run(() => useDts('c1', 'd1', { enabled: o.enabled ?? true, editable: ref(o.editable ?? !o.readonly), save, saveForAction: save, recalcCustomsValues }))!
  await dts.refresh()
  w = mountWithI18n(SectionDts, {
    attachTo: document.body,
    props: { form, readonly: !!o.readonly, dts, expenseLabels: { '13a': 'Комиссионные', '17': 'Перевозка до границы' } },
    global: { directives: { uppercase: vUppercase } },
  })
  await flushPromises()
  return { form, dts, recalcCustomsValues, save }
}
/** Числа по языку интерфейса — с неразрывными пробелами. */
const plain = (s: string) => s.replace(/\u00a0/g, ' ')
const segment = (root: string, label: string) => w.get(root).findAll('button').find((b) => b.text() === label)!
const question = (key: string) => w.get(`[data-dts-question="${key}"]`)
const answer = (key: string) => question(key).find('[data-state="on"]').text()

describe('SectionDts: плашка', () => {
  it('«Для ДТС не хватает» — только пункты самой ДТС; готовность ДТ — числом и ссылкой на «До подачи»', async () => {
    await mount()
    const banner = w.get('[data-dts-missing]')
    expect(banner.text()).toContain('Для ДТС не хватает: 1')
    expect(w.findAll('[data-dts-missing-item]').map((i) => i.text())).toEqual(['ДТС: не указано место для гр.17 (раздел «ДТС»)'])
    expect(banner.text()).not.toContain('Гр.8')
    expect(w.get('[data-dts-dt-missing]').text()).toContain('XML ДТС требует и готовности самой ДТ: не хватает 1')
    await w.get('[data-dts-open-panel]').trigger('click')
    expect(w.emitted('open-panel')).toHaveLength(1)
  })

  it('всё заполнено — плашки нет', async () => {
    await mount({ view: dtsView({ missing: [], items: [] }) })
    expect(w.find('[data-dts-missing-wrap]').exists()).toBe(false)
  })

  it('ошибка XML 400 — список в своей плашке', async () => {
    const { dts } = await mount()
    dtsApi.xml.mockResolvedValue({ errors: ['Гр.8, получатель', 'ДТС: нет места'] })
    await w.get('[data-dts-xml]').trigger('click')
    await flushPromises()
    expect(dts.xmlErrors.value).toHaveLength(2)
    expect(w.get('[data-dts-xml-errors]').text()).toContain('XML ДТС не сформирован · не хватает 2')
    expect(w.get('[data-dts-xml-errors]').findAll('li').map((li) => li.text())).toEqual(['Гр.8, получатель', 'ДТС: нет места'])
  })
})

describe('SectionDts: основной лист', () => {
  it('компактно: имена, условия, документы гр. 4 и 5; «Подробнее» — адреса, БИН, рег. номер, 10б', async () => {
    await mount()
    const main = w.get('[data-dts-main]')
    expect(main.get('[data-dts-main-row="seller"]').text()).toContain('SHENZHEN BRIGHT ELECTRONICS CO., LTD')
    expect(main.get('[data-dts-main-row="terms"]').text()).toContain('CIF · ALMATY')
    expect(main.get('[data-dts-main-row="box4"]').text()).toContain('INV-2026-0912 от 12.09.2026')
    expect(main.get('[data-dts-main-row="box5"]').text()).toContain('SB-KZ-2026/04')
    expect(main.text()).not.toContain('БИН')
    await main.get('[data-dts-main-more]').trigger('click')
    expect(main.get('[data-dts-main-more]').attributes('aria-expanded')).toBe('true')
    expect(main.get('[data-dts-detail="buyer"]').text()).toContain('БИН 123456789012')
    expect(main.get('[data-dts-detail="buyer"]').text()).toContain('АЛМАТЫ, АБАЯ, 1')
    expect(main.get('[data-dts-detail="reg"]').text()).toContain('55302/051026/0000123')
    expect(main.get('[data-dts-detail="box10b"]').text()).toContain('ИВАНОВ И.И.')
    // Вид документа — как на бланке («04021/1 …»), в «Подробнее»; в компактной строке — только номер.
    expect(main.get('[data-dts-detail="box4"]').text()).toContain('04021/1 INV-2026-0912 от 12.09.2026')
    expect(main.get('[data-dts-detail="box5"]').text()).toContain('03011/1 SB-KZ-2026/04')
    expect(main.get('[data-dts-main-row="box4"]').text()).not.toContain('04021')
  })

  it('ДТС не загрузилась — ошибка с «Повторить»; вопросы и «Место для гр. 17» правятся и без листа', async () => {
    const { form } = await mount({ fail: true })
    expect(w.get('[data-dts-load-error]').text()).toContain('Не удалось загрузить расчёт ДТС')
    expect(w.find('[data-dts-main]').exists()).toBe(false)
    expect(w.find('[data-dts-sheet]').exists()).toBe(false)
    await w.get('[data-dts-place]').setValue('астана')
    expect(form.dtsPlaceName).toBe('АСТАНА')
    expect(w.get('[data-dts-place-field]').attributes('data-goods-field')).toBe('dtsPlace')
    expect(w.find('[data-dts-questions]').exists()).toBe(true)
  })

  it('ДТ заменена разделением — без запроса, строка «оформляйте в ДТ ЕТТ и ВТО» вместо листа', async () => {
    await mount({ enabled: false, readonly: true })
    expect(dtsApi.get).not.toHaveBeenCalled()
    expect(w.get('[data-dts-replaced]').text()).toBe('ДТ уже разделена — ДТС оформляйте в ДТ ЕТТ и ВТО.')
    expect(w.find('[data-dts-skeleton]').exists()).toBe(false)
    expect(w.find('[data-dts-load-error]').exists()).toBe(false)
  })
})

describe('SectionDts: ДТС-2', () => {
  const form2 = () => dtsView({
    sheet: dtsSheet({
      formCode: 2,
      methodCode: '6',
      baseMethodCode: '1',
      invoices: [],
      box4Docs: [{ kindCode: '03011', name: 'Договор', number: 'ДОГ-7', date: '2026-08-01' }],
      evidence: [{ goodsNumber: 1, docs: [{ kindCode: '04051', name: 'Справка о стоимости', number: 'СПР-1', date: '2026-09-30' }] }],
      dtValuationMethods: ['6', '6'],
      goods: [dtsGoods(1), dtsGoods(2)],
    }),
  })

  it('гр. 4 — основания поставки (box4Docs), а не счета; документы о стоимости (гр. 8) — сколько товаров с ними', async () => {
    await mount({ view: form2(), form: { dtsFreeOfCharge: true, goodsItems: [goods('6'), goods('6')] } })
    const box4 = w.get('[data-dts-main-row="box4"]')
    expect(box4.text()).toContain('Основания поставки, гр. 4')
    // Гр. 4 ДТС-2 — вперемешку 03… и 04…: вид документа и в компактной строке.
    expect(box4.text()).toContain('03011/1 ДОГ-7 от 01.08.2026')
    expect(box4.text()).not.toContain('Счета')
    expect(w.get('[data-dts-main-row="evidence"]').text()).toContain('есть у товаров: 1 из 2')
  })

  it('документы о стоимости — по товару в раскрытой строке; нет документа — сказано', async () => {
    await mount({ view: form2(), form: { dtsFreeOfCharge: true, goodsItems: [goods('6'), goods('6')] } })
    await w.get('[data-dts-row="1"] [data-dts-expand]').trigger('click')
    expect(w.get('[data-dts-details="1"] [data-dts-evidence]').text()).toContain('04051 · СПР-1 от 30.09.2026')
    await w.get('[data-dts-row="2"] [data-dts-expand]').trigger('click')
    expect(w.get('[data-dts-details="2"] [data-dts-evidence]').text()).toContain('нет документа 04051, привязанного к товару')
  })

  it('ДТС-1 — счета гр. 4, строки о документах о стоимости нет', async () => {
    await mount()
    expect(w.get('[data-dts-main-row="box4"]').text()).toContain('Счета, гр. 4')
    expect(w.find('[data-dts-main-row="evidence"]').exists()).toBe(false)
    await w.get('[data-dts-expand]').trigger('click')
    expect(w.find('[data-dts-evidence]').exists()).toBe(false)
  })
})

describe('SectionDts: вопросы', () => {
  it('7а «Нет» — 7б и 7в «Нет» и недоступны; 7а «Да» — доступны; вопрос «только в XML» есть', async () => {
    const { form } = await mount({ form: { dtsRelation: true, dtsRelationPriceInfluence: true, dtsRelationApproxValue: true } })
    expect(answer('dtsRelationPriceInfluence')).toBe('Да')
    expect(question('dtsRelationPriceInfluence').find('[data-disabled]').exists()).toBe(false)
    await segment('[data-dts-question="dtsRelation"]', 'Нет').trigger('click')
    await nextTick()
    expect(form.dtsRelation).toBe(false)
    expect(form.dtsRelationPriceInfluence).toBe(false)
    expect(form.dtsRelationApproxValue).toBe(false)
    expect(answer('dtsRelationApproxValue')).toBe('Нет')
    expect(segment('[data-dts-question="dtsRelationPriceInfluence"]', 'Да').attributes('disabled')).toBeDefined()
    await segment('[data-dts-question="dtsRelation"]', 'Да').trigger('click')
    await nextTick()
    expect(segment('[data-dts-question="dtsRelationPriceInfluence"]', 'Да').attributes('disabled')).toBeUndefined()
    await segment('[data-dts-question="dtsRoyaltyContract"]', 'Да').trigger('click')
    expect(form.dtsRoyaltyContract).toBe(true)
    expect(question('dtsRoyaltyContract').text()).toContain('только в XML')
    expect(w.get('[data-dts-questions-note]').text()).toContain('иначе сбросим')
  })

  it('«Причины выбора метода» — только для ДТС-2', async () => {
    const { form } = await mount()
    expect(w.find('[data-dts-reason]').exists()).toBe(false)
    form.dtsFreeOfCharge = true
    await nextTick()
    await w.get('[data-dts-reason] textarea').setValue('БЕСПЛАТНАЯ ПОСТАВКА')
    expect(form.dtsMethodReason).toBe('БЕСПЛАТНАЯ ПОСТАВКА')
  })

  it('просмотр: форма, вопросы и место недоступны, «Пересчитать гр. 45» нет; печать и XML доступны', async () => {
    await mount({ readonly: true, view: dtsView({ mismatchGoods: [1] }) })
    expect(w.findAll('[data-dts-questions] button').every((b) => b.attributes('disabled') !== undefined)).toBe(true)
    expect(w.findAll('[data-dts-form] button').every((b) => b.attributes('disabled') !== undefined)).toBe(true)
    expect(w.get('[data-dts-place]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-dts-recalc]').exists()).toBe(false)
    expect(w.find('[data-dts-row-recalc]').exists()).toBe(false)
    expect(w.get('[data-dts-print]').attributes('disabled')).toBeUndefined()
    expect(w.get('[data-dts-xml]').attributes('disabled')).toBeUndefined()
  })
})

describe('SectionDts: ДТС-1 ↔ ДТС-2', () => {
  it('подтверждение с числом товаров, у которых сменится гр. 43; «Отмена» — без изменений; тост с числом', async () => {
    const { form } = await mount({ form: { dtsFreeOfCharge: false, goodsItems: [goods(null), goods('1'), goods('2')] } })
    await segment('[data-dts-form]', 'ДТС-2 · безвозмездно').trigger('click')
    await nextTick()
    expect(confirmState.open).toBe(true)
    expect(confirmState.content).toBe('ДТС-2 — безвозмездная поставка, метод 6 на основе 1. У товаров (2) гр. 43 станет 6.')
    confirmState.resolve(false)
    await flushPromises()
    expect(form.dtsFreeOfCharge).toBe(false)
    expect(form.goodsItems.map((g) => g.valuationMethodCode)).toEqual([null, '1', '2'])
    const list = form.goodsItems
    await segment('[data-dts-form]', 'ДТС-2 · безвозмездно').trigger('click')
    await nextTick()
    confirmState.resolve(true)
    await flushPromises()
    expect(form.dtsFreeOfCharge).toBe(true)
    expect(form.goodsItems).toBe(list)
    expect(form.goodsItems.map((g) => g.valuationMethodCode)).toEqual(['6', '6', '2'])
    expect(toast.success).toHaveBeenCalledWith('Гр. 43 изменена у товаров: 2')
  })

  it('менять гр. 43 некому — без подтверждения и тоста', async () => {
    const { form } = await mount({ form: { dtsFreeOfCharge: true, goodsItems: [goods('1'), goods('3')] } })
    await segment('[data-dts-form]', 'ДТС-1').trigger('click')
    await flushPromises()
    expect(confirmState.open).toBe(false)
    expect(form.dtsFreeOfCharge).toBe(false)
    expect(form.goodsItems.map((g) => g.valuationMethodCode)).toEqual(['1', '3'])
    expect(toast.success).not.toHaveBeenCalled()
  })
})

describe('SectionDts: добавочный лист', () => {
  it('товары строками: 11а в валюте, Σ13–19, Σ21–23, 25а, 25б, гр. 45; название — из формы при том же коде', async () => {
    await mount({ view: dtsView({ sheet: dtsSheet({ goods: [dtsGoods(1), dtsGoods(2, { tnvedCode: '8471300000' })] }) }), form: { goodsItems: [goods('1'), goods('1')] } })
    const row = w.get('[data-dts-row="1"]')
    expect(row.attributes('data-goods-index')).toBe('0')
    expect(row.get('[data-dts-expand]').text()).toContain('ВИНТЫ')
    expect(plain(row.get('[data-dts-cell="11a"]').text())).toContain('1 500,50 USD')
    expect(plain(row.get('[data-dts-cell="13"]').text())).toContain('5 121')
    expect(row.get('[data-dts-cell="21"]').text()).toContain('100')
    expect(plain(row.get('[data-dts-cell="25b"]').text())).toContain('1 510,64')
    // У товара 2 в форме другой код — подпись по коду листа, не чужое название.
    expect(w.get('[data-dts-row="2"] [data-dts-expand]').text()).toContain('8471300000')
    expect(w.find('[data-dts-mismatch]').exists()).toBe(false)
  })

  it('строка раскрывается в статьи с названиями и пересчёт валют', async () => {
    await mount()
    expect(w.find('[data-dts-details]').exists()).toBe(false)
    await w.get('[data-dts-expand]').trigger('click')
    expect(w.get('[data-dts-expand]').attributes('aria-expanded')).toBe('true')
    const details = w.get('[data-dts-details="1"]')
    expect(details.get('[data-dts-article="a13a"]').text()).toContain('13a · Комиссионные')
    expect(plain(details.get('[data-dts-article="a17"]').text())).toContain('5 000,00')
    expect(details.get('[data-dts-article="d21"]').text()).toContain('21')
    expect(details.get('[data-dts-currency]').text()).toContain('17 · Перевозка до границы: 9,25 EUR по курсу 541,3')
  })

  it('«не совпадает» — с копейками и «Пересчитать гр. 45» у строки и общей кнопкой → шаг 1 расчёта и сохранение', async () => {
    const view = dtsView({ mismatchGoods: [1], sheet: dtsSheet({ goods: [dtsGoods(1, { box25Kzt: 747948.06, declaredCustomsValueKzt: 747948.05 })] }) })
    const { recalcCustomsValues, save } = await mount({ view })
    const row = w.get('[data-dts-row="1"]')
    expect(row.attributes('data-mismatch')).toBeDefined()
    expect(row.get('[data-dts-mismatch]').text()).toBe('не совпадает')
    expect(plain(row.get('[data-dts-cell="25a"]').text())).toContain('747 948,06')
    expect(plain(row.get('[data-dts-cell="45"]').text())).toContain('747 948,05')
    expect(row.get('[data-dts-cell="45"]').classes()).toContain('text-danger')
    await row.get('[data-dts-row-recalc]').trigger('click')
    await flushPromises()
    expect(recalcCustomsValues).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(1)
    await w.get('[data-dts-recalc]').trigger('click')
    await flushPromises()
    expect(recalcCustomsValues).toHaveBeenCalledTimes(2)
  })

  it('«Место для гр. 17» — в верхнем регистре в форму ДТ, подсказка — место поставки', async () => {
    const { form } = await mount({ form: { incotermsPlace: 'ALMATY', dtsPlaceName: null } })
    const input = w.get('[data-dts-place]')
    expect(input.attributes('placeholder')).toBe('ALMATY')
    await input.setValue('астана')
    expect(form.dtsPlaceName).toBe('АСТАНА')
  })

  it('375: строки — карточки (CSS), подписи ячеек на телефоне, нажимаемое ≥ 44px', async () => {
    await mount({ view: dtsView({ mismatchGoods: [1] }) })
    expect(w.get('[data-dts-sheet] table').classes()).toContain('max-sm:block')
    expect(w.get('[data-dts-sheet] thead').classes()).toContain('max-sm:hidden')
    expect(w.get('[data-dts-row="1"]').classes()).toContain('max-sm:grid')
    expect(w.get('[data-dts-cell="12"] span').classes()).toContain('sm:hidden')
    for (const sel of ['[data-dts-print]', '[data-dts-info-sheet]', '[data-dts-xml]', '[data-dts-recalc]', '[data-dts-row-recalc]', '[data-dts-open-panel]']) {
      expect(w.get(sel).classes(), sel).toContain('max-sm:h-11')
    }
    expect(w.get('[data-dts-expand]').classes()).toContain('max-sm:min-h-11')
    expect(w.get('[data-dts-main-more]').classes()).toContain('max-sm:min-h-11')
    expect(w.findAll('[data-dts-form] button').every((b) => b.classes().includes('max-sm:h-11'))).toBe(true)
  })
})

describe('SectionDts: 200 товаров', () => {
  it('добавочный лист с 200 строками открывается и раскрывает строку, правка формы не перечитывает ДТС', async () => {
    const t0 = performance.now()
    const view = dtsView({ sheet: dtsSheet({ goods: Array.from({ length: 200 }, (_, i) => dtsGoods(i + 1)) }) })
    const { form } = await mount({ view, form: { goodsItems: Array.from({ length: 200 }, () => goods('1')) } })
    const mountMs = performance.now() - t0
    expect(w.findAll('[data-dts-row]')).toHaveLength(200)
    const t2 = performance.now()
    await w.get('[data-dts-row="100"] [data-dts-expand]').trigger('click')
    const expandMs = performance.now() - t2
    const getsBefore = dtsApi.get.mock.calls.length
    const t1 = performance.now()
    for (let i = 0; i < 20; i++) {
      form.goodsItems[i].description = `ПРАВКА ${i}`
      await nextTick()
    }
    const editMs = (performance.now() - t1) / 20
    expect(dtsApi.get.mock.calls.length).toBe(getsBefore)
    console.info(`[perf 200 goods ДТС, jsdom] mount ${mountMs.toFixed(0)} ms, expand row ${expandMs.toFixed(0)} ms, edit ${editMs.toFixed(1)} ms`)
    expect(mountMs).toBeLessThan(3000)
    expect(editMs).toBeLessThan(100)
  })
})
