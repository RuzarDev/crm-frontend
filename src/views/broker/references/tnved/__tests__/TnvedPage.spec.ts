import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { TnvedNodeDto, TnvedPathNodeDto, TnvedRateDto } from '@/types/api'

// Экран «ТН ВЭД» сотрудника: дерево (настоящее, на моках tnvedApi) и карточка кода с вкладками.
const api = vi.hoisted(() => ({
  children: vi.fn(), path: vi.fn(), node: vi.fn(), search: vi.fn(), classify: vi.fn(),
  rates: vi.fn(), notes: vi.fn(), reference: vi.fn(), exportReference: vi.fn(), getTransition: vi.fn(),
  calculate: vi.fn(), currencies: vi.fn(),
}))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: api }))
vi.mock('@/api/references', () => ({ referencesApi: { listCountries: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/ui/message', () => ({ message: msg }))

import TnvedPage from '../TnvedPage.vue'
import { resetCurrenciesCache } from '@/views/client/tnved/currency'

const node = (id: number, code: string, name: string, parentId: number | null, extra: Partial<TnvedNodeDto> = {}): TnvedNodeDto => ({
  id, code, name, treeName: name, parentId, is10: code.replace(/\D/g, '').length === 10, isLast: false, unitShort: null, nodeLevel: 0, ...extra,
})
const tree: Record<number, TnvedNodeDto[]> = {
  0: [node(1, 'XVI', 'Машины и оборудование', 0)],
  1: [node(10, '84', 'Реакторы ядерные, котлы', 1)],
  10: [node(100, '8471', '– Машины вычислительные', 10)],
  100: [
    node(1000, '8471300000', 'Ноутбуки и планшеты', 100, { isLast: true, unitShort: 'шт' }),
    node(1001, '8471410000', 'Прочие машины', 100, { isLast: true, unitShort: 'шт' }),
  ],
}
const paths: Record<string, TnvedPathNodeDto[]> = {
  '8471300000': [1, 10, 100, 1000].map((id) => ({ id, code: '', treeName: '', nodeLevel: 0 })),
  '8471410000': [1, 10, 100, 1001].map((id) => ({ id, code: '', treeName: '', nodeLevel: 0 })),
}
const rate = (code: string, rateStr: string): TnvedRateDto => ({
  code, treeName: null, rateStr, rateSourceName: 'Решение ЕЭК № 80', rateSourceUrl: 'https://eec.example/80', vtoStatus: null,
  unitCode: '796', unitName: 'шт', updatedAtUtc: '2026-10-01T00:00:00Z',
})
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status } })
const ok = <T,>(data: T) => Promise.resolve({ data })
const deferred = <T,>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

let w: VueWrapper
let router: Router

const mountAt = async (path = '/tnved/tree') => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(TnvedPage, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const clickRow = async (id: number) => {
  await w.get(`[data-z-tree-id="${id}"]`).trigger('click')
  await flushPromises()
}
const expandTo10 = async () => {
  await clickRow(1)
  await clickRow(10)
  await clickRow(100)
}
const openTab = async (key: string) => {
  const tab = w.findAll('[role="tab"]').find((x) => x.text().startsWith(key))!
  await tab.trigger('mousedown')
  await flushPromises()
}
const card = () => w.get('[data-tnved-card]')
const typeQuery = async (text: string) => {
  await w.get('[data-tnved-search]').setValue(text)
  await vi.advanceTimersByTimeAsync(400)
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetCurrenciesCache()
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  api.children.mockImplementation((id: number) => ok(tree[id] ?? []))
  api.path.mockImplementation((code: string) => ok(paths[code] ?? []))
  api.node.mockRejectedValue(httpError(404))
  api.rates.mockImplementation((code: string) => ok(rate(code, code === '8471300000' ? '0%' : '5%')))
  api.notes.mockResolvedValue({ data: { code: '', nodeType: '', htmlContent: '<p>Пояснение</p>', updatedAtUtc: null } })
  api.reference.mockResolvedValue({ data: { code: '', success: true, description: null, rawJson: null, hasRestrictions: true, hasPreferences: false, errorMessage: null, updatedAtUtc: '', nonTariffMeasures: [
    { docType: 'RESTRICTION', name: 'Нотификация ФСБ', comment: null, resolutionNumber: '30', resolutionName: 'Решение КТС', resolutionUrl: null },
    { docType: 'PREFERENCE', name: 'Льгота по НДС', comment: null, resolutionNumber: null, resolutionName: null, resolutionUrl: null },
  ] } })
  api.exportReference.mockResolvedValue({ data: { code: '', success: true, rateValue: '0%', hasRestrictions: false, hasPreferences: false, errorMessage: null, updatedAtUtc: '', nonTariffMeasures: [] } })
  api.getTransition.mockResolvedValue({ data: { oldCode: '', newCodes: [], isDeprecated: false, sourceVersion: null, effectiveDate: null } })
  api.search.mockResolvedValue({ data: [] })
  api.classify.mockResolvedValue({ data: { matches: [], exactCodeInfo: null, suggestedGroup: null } })
  api.currencies.mockResolvedValue({ data: [] })
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('TnvedPage', () => {
  it('выбор узла: карточка, путь, ?code=; вкладки грузятся по открытию, калькулятор — только у 10-значного', async () => {
    await mountAt()
    expect(w.find('[data-card-empty]').exists()).toBe(true)

    await clickRow(1)
    expect(card().get('[data-card-code]').text()).toBe('XVI')
    // Группа: ставок нет, калькулятор/нетарифка/экспорт закрыты.
    expect(w.find('[data-rates-group]').exists()).toBe(true)
    expect(api.rates).not.toHaveBeenCalled()
    const disabled = w.findAll('[role="tab"]').filter((x) => x.attributes('disabled') !== undefined).map((x) => x.text())
    expect(disabled.map((s) => s.replace(/\s+/g, ''))).toEqual(['Калькулятор', 'Нетарифныемеры', 'Экспорт'])

    await clickRow(10)
    await clickRow(100)
    await clickRow(1000)
    expect(card().get('[data-card-code]').text()).toBe('8471 30 000 0')
    expect(card().get('[data-card-name]').text()).toBe('Ноутбуки и планшеты')
    expect(card().findAll('[data-card-crumb]').map((c) => c.text())).toEqual(['XVI', '84', '8471'])
    expect(router.currentRoute.value.query.code).toBe('8471300000')
    expect(api.rates).toHaveBeenCalledWith('8471300000', { silent: true })
    expect(w.get('[data-rate-row="duty"] [data-rate-value]').text()).toBe('0%')
    expect(api.notes).not.toHaveBeenCalled()
    expect(api.reference).not.toHaveBeenCalled()
    expect(api.exportReference).not.toHaveBeenCalled()

    await openTab('Нетарифные меры')
    expect(api.reference).toHaveBeenCalledTimes(1)
    expect(w.findAll('[data-measure-group]').map((g) => g.attributes('data-measure-group'))).toEqual(['restrictions', 'preferences'])
    expect(w.findAll('[role="tab"]').find((x) => x.text().startsWith('Нетарифные меры'))!.text()).toContain('2')

    await openTab('Калькулятор')
    expect(w.find('[data-tnved-calc]').exists()).toBe(true)
    expect(w.find('[data-calc-quantity]').exists()).toBe(true)
    expect(w.find('[data-calc-date]').exists()).toBe(true)
  })

  it('кэш: повторный выбор того же кода — без новых запросов', async () => {
    await mountAt()
    await expandTo10()
    await clickRow(1000)
    await openTab('Пояснения')
    await clickRow(1001)
    await clickRow(1000)
    expect(api.rates.mock.calls.filter(([c]) => c === '8471300000')).toHaveLength(1)
    expect(api.notes.mock.calls.filter(([c]) => c === '8471300000')).toHaveLength(1)
    expect(api.getTransition.mock.calls.filter(([c]) => c === '8471300000')).toHaveLength(1)
    // Открытая вкладка осталась «Пояснения» — для кода 1001 грузились только пояснения.
    expect(api.rates.mock.calls.filter(([c]) => c === '8471410000')).toHaveLength(0)
  })

  it('(баг) поздний ответ по прежнему коду не попадает в карточку нового', async () => {
    const a = deferred<{ data: TnvedRateDto }>()
    const b = deferred<{ data: TnvedRateDto }>()
    api.rates.mockImplementation((code: string) => (code === '8471300000' ? a.promise : b.promise))
    await mountAt()
    await expandTo10()
    await clickRow(1000)
    await clickRow(1001)
    b.resolve({ data: rate('8471410000', '5%') })
    await flushPromises()
    a.resolve({ data: rate('8471300000', '15%') })
    await flushPromises()
    expect(card().get('[data-card-code]').text()).toBe('8471 41 000 0')
    expect(w.get('[data-rate-row="duty"] [data-rate-value]').text()).toBe('5%')
    expect(w.text()).not.toContain('15%')
  })

  it('?code= открывает код и раскрывает путь в дереве', async () => {
    await mountAt('/tnved/tree?code=8471300000')
    expect(api.path).toHaveBeenCalledWith('8471300000')
    expect(card().get('[data-card-code]').text()).toBe('8471 30 000 0')
    expect(w.get('[data-z-tree-id="1000"]').attributes('aria-selected')).toBe('true')
    expect(card().findAll('[data-card-crumb]')).toHaveLength(3)
  })

  it('?code= несуществующего кода — «Код не найден»', async () => {
    await mountAt('/tnved/tree?code=0000000000')
    expect(api.node).toHaveBeenCalledWith('0000000000', { silent: true })
    expect(w.get('[data-card-not-found]').text()).toContain('Код не найден')
  })

  it('путь кликабелен: предок открывается без новых запросов дерева', async () => {
    await mountAt('/tnved/tree?code=8471300000')
    const calls = api.children.mock.calls.length + api.path.mock.calls.length
    await w.get('[data-card-crumb="84"]').trigger('click')
    await flushPromises()
    expect(card().get('[data-card-code]').text()).toBe('84')
    expect(router.currentRoute.value.query.code).toBe('84')
    expect(api.children.mock.calls.length + api.path.mock.calls.length).toBe(calls)
  })

  it('поиск: пауза 400 мс, «Поиск · n», результат открывает код; «Только 10-значные» ищет снова', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    api.search.mockResolvedValue({ data: [tree[100][0], tree[100][1]] })
    await mountAt()
    await w.get('[data-tnved-search]').setValue('ноутбук')
    await vi.advanceTimersByTimeAsync(300)
    expect(api.search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    await flushPromises()
    expect(api.search).toHaveBeenCalledWith('ноутбук', false, 30, { silent: true })
    expect(w.get('[data-tnved-mode]').text().replace(/\s+/g, ' ')).toContain('Поиск 2')
    expect(w.findAll('[data-result]')).toHaveLength(2)

    await w.get('[data-tnved-leaf-only]').trigger('click')
    await flushPromises()
    expect(api.search).toHaveBeenLastCalledWith('ноутбук', true, 30, { silent: true })

    await w.get('[data-result="8471410000"]').trigger('click')
    await flushPromises()
    expect(card().get('[data-card-code]').text()).toBe('8471 41 000 0')
    expect(api.path).toHaveBeenCalledWith('8471410000')
    expect(router.currentRoute.value.query.code).toBe('8471410000')
  })

  it('поиск: поздний ответ на прежний запрос не подменяет выдачу; 429 — сообщение на месте', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const first = deferred<{ data: TnvedNodeDto[] }>()
    api.search.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ data: [tree[100][1]] })
    await mountAt()
    await typeQuery('ноут')
    await typeQuery('прочие')
    first.resolve({ data: [tree[100][0]] })
    await flushPromises()
    expect(w.findAll('[data-result]').map((r) => r.attributes('data-result'))).toEqual(['8471410000'])

    api.search.mockRejectedValueOnce(httpError(429))
    await typeQuery('насос')
    expect(w.get('[data-results-error]').text()).toContain('Слишком много запросов, подождите минуту')
  })

  it('«Подобрать по описанию»: classify, список с вероятностью, выбор открывает код', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    api.classify.mockResolvedValue({ data: { matches: [
      { code: '8471300000', description: 'Портативные компьютеры', probability: 0.87, rateStr: '0%', unitName: 'шт' },
    ], exactCodeInfo: null, suggestedGroup: null } })
    await mountAt()
    expect(w.get('[data-tnved-classify]').attributes('disabled')).toBeDefined()
    await typeQuery('ноутбук для работы')
    await w.get('[data-tnved-classify]').trigger('click')
    await flushPromises()
    expect(api.classify).toHaveBeenCalledWith('ноутбук для работы', 10, { silent: true })
    expect(w.find('[data-results-classified]').exists()).toBe(true)
    expect(w.get('[data-result-probability]').text()).toBe('совпадение 87%')
    await w.get('[data-result="8471300000"]').trigger('click')
    await flushPromises()
    expect(card().get('[data-card-code]').text()).toBe('8471 30 000 0')
  })

  it('(баг) «Пояснения»: HTML очищен — без скриптов и обработчиков', async () => {
    api.notes.mockResolvedValue({ data: { code: '8471300000', nodeType: '', updatedAtUtc: '2026-10-01T00:00:00Z',
      htmlContent: '<p onclick="alert(1)">Текст</p><script>window.__x = 1</script><img src=x onerror="alert(1)"><a href="javascript:alert(1)">ссылка</a><table><tr><td>1</td></tr></table>' } })
    await mountAt('/tnved/tree?code=8471300000')
    await openTab('Пояснения')
    const html = w.get('[data-notes-html]').element.innerHTML
    expect(html).toBe('<p>Текст</p><a>ссылка</a><table><tbody><tr><td>1</td></tr></tbody></table>')
    expect(w.text()).toContain('Обновлено 01.10.2026')
  })

  it('устаревший код: предупреждение и переход на актуальный код', async () => {
    api.getTransition.mockResolvedValue({ data: { oldCode: '8471300000', newCodes: ['8471410000'], isDeprecated: true, sourceVersion: '01.01.2027', effectiveDate: null } })
    await mountAt('/tnved/tree?code=8471300000')
    expect(w.get('[data-card-deprecated]').text()).toContain('Код 8471 30 000 0 устарел с 01.01.2027')
    await w.get('[data-card-replacement="8471410000"]').trigger('click')
    await flushPromises()
    expect(card().get('[data-card-code]').text()).toBe('8471 41 000 0')
  })

  it('ошибки вкладки: 429 — «подождите минуту», «Повторить» спрашивает снова', async () => {
    api.rates.mockRejectedValueOnce(httpError(429))
    await mountAt('/tnved/tree?code=8471300000')
    expect(w.get('[data-tab-error]').text()).toContain('Слишком много запросов, подождите минуту')
    await w.get('[data-tab-retry]').trigger('click')
    await flushPromises()
    expect(w.get('[data-rate-row="duty"] [data-rate-value]').text()).toBe('0%')
  })

  it('«Скопировать код» — цифры кода в буфер', async () => {
    await mountAt('/tnved/tree?code=8471300000')
    await w.get('[data-card-copy]').trigger('click')
    await flushPromises()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('8471300000')
    expect(msg.success).toHaveBeenCalled()
  })

  it('«Калькулятор» открыт при смене кода — ставки грузятся, поле объёма двигателя есть до первого расчёта (см³)', async () => {
    api.rates.mockImplementation((code: string) =>
      ok(rate(code, code === '8471410000' ? '15%, но не менее 0,6 евро за 1 см3 объёма двигателя' : '0%')))
    await mountAt('/tnved/tree?code=8471300000')
    await openTab('Калькулятор')
    expect(w.find('[data-calc-engine]').exists()).toBe(false)
    await clickRow(1001)
    expect(w.get('[data-tab-panel]').attributes('data-tab-panel')).toBe('calc')
    expect(api.rates).toHaveBeenCalledWith('8471410000', { silent: true })
    expect(w.find('[data-calc-engine]').exists()).toBe(true)
  })

  it('клавиатура: стрелки только переводят фокус (без запросов), Enter открывает код', async () => {
    await mountAt()
    await expandTo10()
    await clickRow(1000)
    const calls = api.rates.mock.calls.length + api.getTransition.mock.calls.length
    const row = (id: number) => w.get(`[data-z-tree-id="${id}"]`).element as HTMLElement
    const press = async (key: string) => {
      ;(document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      await flushPromises()
    }
    row(1000).focus()
    await press('ArrowDown')
    expect(document.activeElement).toBe(row(1001))
    await press('ArrowUp')
    await press('ArrowDown')
    expect(api.rates.mock.calls.length + api.getTransition.mock.calls.length).toBe(calls)
    expect(card().get('[data-card-code]').text()).toBe('8471 30 000 0')
    await press('Enter')
    expect(card().get('[data-card-code]').text()).toBe('8471 41 000 0')
    expect(api.rates).toHaveBeenCalledWith('8471410000', { silent: true })
  })

  it('поля калькулятора переживают открытие кода по адресу (карточка не пересоздаётся)', async () => {
    await mountAt('/tnved/tree?code=8471300000')
    await openTab('Калькулятор')
    await w.get('[data-calc-value]').setValue('25000')
    const slow = deferred<{ data: TnvedPathNodeDto[] }>()
    api.path.mockImplementationOnce(() => slow.promise)
    await router.replace({ query: { code: '8471410000' } })
    await flushPromises()
    expect(w.find('[data-card-loading]').exists()).toBe(true)
    slow.resolve({ data: paths['8471410000'] })
    await flushPromises()
    expect(card().get('[data-card-code]').text()).toBe('8471 41 000 0')
    expect((w.get('[data-calc-value]').element as HTMLInputElement).value).toContain('25')
  })

  it('«Нетарифные меры n»: счётчик из кэша, если справку по коду уже открывали', async () => {
    await mountAt()
    await expandTo10()
    await clickRow(1000)
    await openTab('Нетарифные меры')
    await openTab('Ставки')
    await clickRow(1001)
    await clickRow(1000)
    const tab = w.findAll('[role="tab"]').find((x) => x.text().startsWith('Нетарифные меры'))!
    expect(tab.text().replace(/\s+/g, ' ')).toBe('Нетарифные меры 2')
    expect(api.reference).toHaveBeenCalledTimes(1)
  })

  it('клик в дереве во время раскрытия другого кода — выделение остаётся на выбранном', async () => {
    await mountAt()
    await expandTo10()
    const slow = deferred<{ data: TnvedPathNodeDto[] }>()
    api.path.mockImplementationOnce(() => slow.promise)
    await router.replace({ query: { code: '8471410000' } })
    await flushPromises()
    await clickRow(1000)
    slow.resolve({ data: paths['8471410000'] })
    await flushPromises()
    expect(w.get('[data-z-tree-id="1000"]').attributes('aria-selected')).toBe('true')
    expect(w.get('[data-z-tree-id="1001"]').attributes('aria-selected')).not.toBe('true')
    expect(card().get('[data-card-code]').text()).toBe('8471 30 000 0')
  })
})
