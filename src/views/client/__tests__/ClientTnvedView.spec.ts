import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { TnvedCalculateResult, TnvedNodeDto } from '@/types/api'

const api = vi.hoisted(() => ({
  search: vi.fn(), classify: vi.fn(), rates: vi.fn(), calculate: vi.fn(), currencies: vi.fn(),
}))
const refs = vi.hoisted(() => ({ listCountries: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: api }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))

import ClientTnvedView from '../ClientTnvedView.vue'
import { useAuthStore } from '@/stores/auth'
import { formatTnvedCode, isCodeLike } from '../tnved/tnved'

const node = (code: string, name: string): TnvedNodeDto => ({
  id: Number(code), code, treeName: `- ${name}`, name, parentId: null, is10: true, isLast: true, unitShort: null, nodeLevel: 5,
})
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status } })
const RESULT = (o: Partial<TnvedCalculateResult> = {}): TnvedCalculateResult => ({
  code: '8471300000', codeName: 'Портативные компьютеры', rateStr: '0%',
  customsValueKzt: 12_500_000, importDutyKzt: 0, customsFeeKzt: 25_950, exciseKzt: 0, vatKzt: 2_004_152, totalKzt: 2_030_102,
  notes: null, explanation: null,
  nonTariffMeasures: [{ docType: 'C', name: 'Нотификация ФСБ', comment: 'Для товаров с шифрованием', resolutionNumber: null, resolutionName: null, resolutionUrl: null }],
  antiDumpingKzt: 0, exciseOptions: [], antiDumpingOptions: [],
  ...o,
})

let w: VueWrapper
let pinia: Pinia
let router: Router
const stub = { template: '<div/>' }

const mountAt = async (path: string) => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(ClientTnvedView, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
}
const type = async (text: string) => {
  await w.get('[data-tnved-search]').setValue(text)
  await vi.advanceTimersByTimeAsync(400)
  await flushPromises()
}
const hitCodes = () => w.findAll('[data-tnved-hit]').map((h) => h.attributes('data-tnved-hit'))
// formatMoney разделяет разряды неразрывным пробелом.
const money = (s: string) => s.replace(/ /g, '\u00a0')
const tile = (k: string) => w.get(`[data-tile="${k}"] [data-tile-value]`).text()

beforeEach(() => {
  vi.useFakeTimers()
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: stub }] })
  const auth = useAuthStore()
  auth.role = 'Client'
  auth.modules = ['import40']
  api.search.mockResolvedValue({ data: [] })
  api.classify.mockResolvedValue({ data: { matches: [], exactCodeInfo: null, suggestedGroup: null } })
  api.rates.mockResolvedValue({ data: { code: '8471300000', treeName: '- - портативные', rateStr: '0%', rateSourceName: null, rateSourceUrl: null, vtoStatus: null, unitCode: null, unitName: null, updatedAtUtc: null } })
  api.calculate.mockResolvedValue({ data: RESULT() })
  api.currencies.mockResolvedValue({ data: [
    { codeLat: 'EUR', name: 'Евро', rate: 560.1, updatedAtUtc: '2026-10-08T03:00:00Z' },
    { codeLat: 'USD', name: 'Доллар США', rate: 500, updatedAtUtc: '2026-10-08T03:00:00Z' },
  ] })
  refs.listCountries.mockResolvedValue([{ id: '1', code: '156', name: 'Китай', isActive: true, alpha2: 'CN' }])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('правила подбора', () => {
  it('код — цифры и пробелы, не меньше четырёх цифр; формат 4/2/3/1', () => {
    expect(isCodeLike('8471 30')).toBe(true)
    expect(isCodeLike('847')).toBe(false)
    expect(isCodeLike('ноутбук 8471')).toBe(false)
    expect(formatTnvedCode('8471300000')).toBe('8471 30 000 0')
    expect(formatTnvedCode('847130')).toBe('8471 30')
  })
})

describe('ClientTnvedView', () => {
  it('до поиска — подсказка с примерами; пример запускает поиск сразу и один раз', async () => {
    await mountAt('/tnved/tree')
    expect(w.get('h1').text()).toBe('Подбор кода ТН ВЭД')
    expect(w.find('[data-tnved-start]').exists()).toBe(true)
    const ex = w.findAll('[data-tnved-example]')
    expect(ex.map((b) => b.text())).toContain('8471 30')
    await ex.find((b) => b.text() === '8471 30')!.trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
    expect(api.search).toHaveBeenCalledTimes(1)
    expect(api.search).toHaveBeenCalledWith('847130', true, 20, { silent: true })
    expect(router.currentRoute.value.query.q).toBe('8471 30')
  })

  it('ввод «8471 30» — поиск по коду с leafOnly через 400 мс, без подбора по описанию', async () => {
    api.search.mockResolvedValue({ data: [node('8471300000', 'Портативные компьютеры'), node('8471410000', 'Прочие машины')] })
    await mountAt('/tnved/tree')
    await w.get('[data-tnved-search]').setValue('8471 30')
    await vi.advanceTimersByTimeAsync(300)
    expect(api.search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    await flushPromises()
    expect(api.search).toHaveBeenCalledWith('847130', true, 20, { silent: true })
    expect(api.classify).not.toHaveBeenCalled()
    expect(hitCodes()).toEqual(['8471300000', '8471410000'])
    expect(w.get('[data-tnved-hit="8471300000"] [data-hit-code]').text()).toBe('8471 30 000 0')
    expect(w.get('[data-tnved-hit="8471300000"] [data-hit-name]').text()).toBe('Портативные компьютеры')
    expect(router.currentRoute.value.query.q).toBe('8471 30')
    // Несколько кодов — ничего не выбираем за клиента.
    expect(router.currentRoute.value.query.code).toBeUndefined()
  })

  it('«ноутбук»: поиск пуст → подбор по описанию, совпадения со ставкой и вероятностью', async () => {
    api.classify.mockResolvedValue({ data: { matches: [
      { code: '8471300000', description: 'Портативные компьютеры массой не более 10 кг', probability: 0.86, rateStr: '0%', unitName: 'шт' },
      { code: '8473302008', description: 'Части вычислительных машин', probability: 0.4, rateStr: null, unitName: null },
    ], exactCodeInfo: null, suggestedGroup: null } })
    await mountAt('/tnved/tree')
    await type('ноутбук')
    expect(api.search).toHaveBeenCalledWith('ноутбук', true, 20, { silent: true })
    expect(api.classify).toHaveBeenCalledWith('ноутбук', 10, { silent: true })
    expect(hitCodes()).toEqual(['8471300000', '8473302008'])
    expect(w.find('[data-tnved-classified]').exists()).toBe(true)
    const first = w.get('[data-tnved-hit="8471300000"]')
    expect(first.get('[data-hit-duty]').text()).toBe('пошлина 0%')
    expect(first.get('[data-hit-probability]').text()).toBe('совпадение 86%')
    expect(w.get('[data-tnved-hit="8473302008"] [data-hit-duty]').text()).toBe('')
  })

  it('ничего не нашлось — текст с запросом', async () => {
    await mountAt('/tnved/tree')
    await type('абракадабра')
    expect(w.get('[data-tnved-nothing]').text()).toContain('По запросу «абракадабра» ничего не нашлось')
  })

  it('выбор кода → ставки и карточка: код, название, плитки; ?code= в адресе', async () => {
    api.search.mockResolvedValue({ data: [node('8471300000', 'Портативные компьютеры'), node('8471410000', 'Прочие машины')] })
    await mountAt('/tnved/tree?q=8471')
    expect(api.search).toHaveBeenCalledWith('8471', true, 20, { silent: true })
    expect(w.find('[data-tnved-card]').exists()).toBe(false)

    await w.get('[data-tnved-hit="8471300000"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ q: '8471', code: '8471300000' })
    expect(api.rates).toHaveBeenCalledWith('8471300000', { silent: true })
    expect(w.get('[data-tnved-hit="8471300000"]').attributes('aria-current')).toBe('true')
    expect(w.get('[data-card-code]').text()).toBe('8471 30 000 0')
    expect(w.get('[data-card-name]').text()).toBe('Портативные компьютеры')
    expect(tile('duty')).toBe('0%')
    expect(tile('vat')).toBe('16%')
    expect(tile('excise')).toBe('—')
    expect(w.get('[data-tnved-ship]').attributes('href')).toBe('/import-40/new')
  })

  it('?code= без запроса — сразу карточка; код не найден (404) — пояснение без калькулятора', async () => {
    api.rates.mockRejectedValue(httpError(404))
    await mountAt('/tnved/tree?code=8471')
    expect(api.rates).toHaveBeenCalledWith('8471', { silent: true })
    expect(w.find('[data-tnved-start]').exists()).toBe(false)
    expect(w.get('[data-card-missing]').text()).toContain('выберите 10-значный код')
    expect(w.find('[data-tnved-calc]').exists()).toBe(false)
  })

  it('«Рассчитать»: без стоимости — подсказка; со стоимостью — calculate с параметрами, итог и документы', async () => {
    await mountAt('/tnved/tree?code=8471300000')
    expect(w.get('[data-card-name]').text()).toBe('портативные')

    await w.get('form').trigger('submit')
    await flushPromises()
    expect(api.calculate).not.toHaveBeenCalled()
    expect(w.get('[data-tnved-calc]').text()).toContain('Укажите стоимость товара')

    await w.get('[data-calc-value]').setValue('25000')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(api.calculate).toHaveBeenCalledWith(
      expect.objectContaining({ code: '8471300000', customsValue: 25000, currencyCode: 'USD' }),
      { silent: true },
    )
    const req = api.calculate.mock.calls[0][0]
    expect(req.weightKg).toBeUndefined()
    expect(req.originCountry).toBeUndefined()
    expect(w.get('[data-calc-row="total"]').text()).toBe(money('2 030 102 ₸'))
    expect(w.get('[data-calc-row="customsValue"]').text()).toBe(money('12 500 000 ₸'))
    expect(w.get('[data-calc-result]').text()).toContain('Пошлина 0%')
    expect(w.find('[data-calc-row="excise"]').exists()).toBe(false)
    expect(w.get('[data-calc-disclaimer]').text()).toBe('Это предварительный расчёт. Точную сумму посчитает декларант по документам.')
    expect(w.findAll('[data-calc-doc]').map((d) => d.text())).toEqual(['Нотификация ФСБДля товаров с шифрованием'])
    // Плитки получили ответ калькулятора.
    expect(tile('excise')).toBe('нет')
    expect(w.get('[data-tile="vat"]').text()).toContain(money('2 004 152 ₸'))

    // Поменяли стоимость — сумма помечена устаревшей.
    await w.get('[data-calc-value]').setValue('30000')
    expect(w.find('[data-calc-stale]').exists()).toBe(true)
  })

  it('акциз в ответе калькулятора — плитка «есть» и строка акциза', async () => {
    api.calculate.mockResolvedValue({ data: RESULT({ exciseKzt: 150_000, exciseOptions: [{ key: 'k', rate: '10%', condition: null, country: null, endDate: null }] }) })
    await mountAt('/tnved/tree?code=8471300000')
    await w.get('[data-calc-value]').setValue('1000')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(tile('excise')).toBe('есть')
    expect(w.get('[data-calc-row="excise"]').text()).toBe(money('150 000 ₸'))
  })

  it('429 в поиске — «слишком много запросов»; «Повторить» ищет снова', async () => {
    api.search.mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce({ data: [node('8471300000', 'Портативные компьютеры')] })
    await mountAt('/tnved/tree')
    await type('8471')
    expect(w.get('[data-tnved-error]').text()).toContain('Слишком много запросов, попробуйте через минуту')
    await w.get('[data-tnved-retry]').trigger('click')
    await flushPromises()
    expect(api.search).toHaveBeenCalledTimes(2)
    expect(hitCodes()).toEqual(['8471300000'])
    // Единственный код — сразу открыт.
    expect(router.currentRoute.value.query.code).toBe('8471300000')
  })

  it('429 в калькуляторе — то же сообщение на месте результата', async () => {
    api.calculate.mockRejectedValue(httpError(429))
    await mountAt('/tnved/tree?code=8471300000')
    await w.get('[data-calc-value]').setValue('1000')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.get('[data-calc-error]').text()).toBe('Слишком много запросов, попробуйте через минуту')
  })

  it('без модуля Импорт 40 — нет кнопки оформления поставки', async () => {
    useAuthStore().modules = ['transit']
    await mountAt('/tnved/tree?code=8471300000')
    expect(w.find('[data-tnved-ship]').exists()).toBe(false)
  })
})
