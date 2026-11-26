import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { DeclarationResponse } from '@/api/autoTransit'
import { fullData, httpError, manyGoods, response } from './tdFixture'

const api = vi.hoisted(() => ({ getDeclaration: vi.fn(), saveDeclaration: vi.fn(), listCopySources: vi.fn(), getCopySource: vi.fn(), downloadPartyDoc: vi.fn() }))
const dl = vi.hoisted(() => ({ saveBlob: vi.fn() }))
vi.mock('@/ui/download', () => dl)
vi.mock('@/api/autoTransit', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/autoTransit')>()), ...api }))
const tnved = vi.hoisted(() => ({ node: vi.fn(), rates: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: tnved }))
vi.mock('@/api/references', async () => ({ referencesApi: (await import('@/views/broker/transit/record/sections/__tests__/harness')).refsApi }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import TdPage from '../TdPage.vue'
import { confirmState } from '@/ui/confirm'
import { useAuthStore } from '@/stores/auth'
import { ComboStub, SelectStub, primeRefs } from '@/views/broker/transit/record/sections/__tests__/harness'

const App = defineComponent({ render: () => h(RouterView) })
let w: VueWrapper
let pinia: Pinia
let router: Router
const settle = async () => { await flushPromises(); await nextTick(); await flushPromises() }
const open = async (r: DeclarationResponse) => {
  api.getDeclaration.mockResolvedValue(r)
  await router.push('/auto-transit/t1/parties/p1/td')
  await router.isReady()
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [pinia, router], stubs: { ZSelect: SelectStub, ZCombobox: ComboStub } } })
  await settle()
}
const has = (sel: string) => w.find(sel).exists()
const text = (s: string) => s.replace(/\s+/g, ' ').trim()
const typeInto = async (sel: string, value: string) => {
  const el = w.get(sel)
  const input = el.element.tagName === 'INPUT' ? el : el.get('input')
  ;(input.element as HTMLInputElement).value = value
  await input.trigger('input')
  await nextTick()
}

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.role = 'manager'
  auth.permissions = ['autotransit.read', 'autotransit.declare']
  primeRefs()
  api.listCopySources.mockResolvedValue([])
  tnved.node.mockResolvedValue({ data: { is10: true, name: 'Ноутбуки' } })
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  Element.prototype.scrollIntoView = vi.fn()
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auto-transit/:id', name: 'auto-transit-truck', component: { template: '<div data-truck-page />' } },
      { path: '/auto-transit/:id/parties/:partyId/td', name: 'auto-transit-td', component: TdPage },
    ],
  })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('TdPage', () => {
  it('шапка: госномер, партия, получатель, «Назад к машине»; разделы по порядку, без строки реестра, станций и «Пост»', async () => {
    await open(response())
    expect(api.getDeclaration).toHaveBeenCalledWith('t1', 'p1')
    const head = text(w.get('[data-td-header]').text())
    expect(head).toContain('123ASD12')
    expect(head).toContain('12DS12')
    expect(head).toContain('Партия 1')
    expect(head).toContain('ТОО «Получатель 1»')
    expect(w.get('[data-td-back]').attributes('href')).toBe('/auto-transit/t1')
    expect(w.findAll('[data-td-sections] > section').map((s) => s.attributes('data-record-section'))).toEqual([
      'main', 'organizations', 'carriers', 'vehicles', 'seals', 'goods', 'doc44', 'packaging', 'preceding', 'guarantees', 'misc',
    ])
    // ЖД-раздел «Транспорт» на странице ПИ не показывается; «Пломбы» — показываются и есть в меню.
    expect(has('[data-record-section="transport"]')).toBe(false)
    expect(has('[data-record-section="seals"]')).toBe(true)
    expect(has('[data-nav-item="seals"]')).toBe(true)
    expect(text(w.get('h1').text())).toBe('ПИ / ТД')
    expect(has('[data-record-section="row"]')).toBe(false)
    expect(has('[data-f="post"]')).toBe(false)
    expect(has('[data-f="loadingRailStation"]')).toBe(false)
    expect(has('[data-f="unloadingRailStation"]')).toBe(false)
    expect(has('[data-f="departureCountryCode"]')).toBe(true)
    expect(has('[data-f="destinationCustomsOffice"]')).toBe(true)
    expect(has('[data-td-draft]')).toBe(false)
  })

  it('черновик помечен и сохраняется: плашка сохранения видна сразу', async () => {
    await open(response({ isDraft: true }))
    expect(text(w.get('[data-td-draft]').text())).toContain('Заполнено из машины и партии, не сохранено')
    expect(has('[data-record-savebar]')).toBe(true)
    api.saveDeclaration.mockResolvedValue(response())
    await w.get('[data-td-save]').trigger('click')
    await settle()
    expect(api.saveDeclaration).toHaveBeenCalledTimes(1)
    expect(has('[data-td-draft]')).toBe(false)
  })

  it('«Не заполнено: N» — список, клик ведёт к разделу', async () => {
    await open(response({ missing: [
      { key: 'organizations.consignee', section: 'organizations' },
      { key: 'goods[1].tnvedCode', section: 'goods' },
    ] }))
    expect(text(w.get('[data-td-missing-title]').text())).toBe('Не заполнено: 2')
    const items = w.findAll('[data-td-missing-item]')
    expect(items.map((i) => text(i.text()))).toEqual(['Получатель (организация)', 'Товар 2: код ТН ВЭД'])
    const spy = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>
    await items[1].trigger('click')
    await settle()
    expect(spy).toHaveBeenCalled()
    // Пункт товара ведёт к самой карточке товара 2 внутри раздела «Товары».
    const target = spy.mock.contexts.at(-1) as HTMLElement
    expect(target.closest('#sec-goods')).not.toBeNull()
    expect(target).toBe(w.findAll('[data-goods-card]')[1]!.element)
  })

  it('только для чтения: разделы получают readonly, кнопки сохранения нет, причина видна', async () => {
    await open(response({ readOnly: true, party: { id: 'p1', number: 1, recipientName: 'ТОО «Получатель 1»', submitted: true } }))
    expect(has('[data-td-save]')).toBe(false)
    expect(has('[data-record-savebar]')).toBe(false)
    expect(text(w.get('[data-td-readonly]').text())).toContain('ТД подана')
    expect(w.get('[data-f="departureCountryCode"]').attributes('data-disabled')).toBe('true')
    expect(w.findAll('[data-record-section="goods"] [data-section-add]')).toHaveLength(0)
  })

  it('409: сообщение о конфликте, введённое не теряется, «Обновить» перечитывает', async () => {
    await open(response())
    await typeInto('[data-f="transportDocNumber"]', 'CMR-777')
    api.saveDeclaration.mockRejectedValue(httpError(409, { code: 'conflict' }))
    await w.get('[data-td-save]').trigger('click')
    await settle()
    expect(text(w.get('[data-td-save-error]').text())).toContain('другой сотрудник')
    const input = w.get('[data-f="transportDocNumber"]')
    expect(((input.element.tagName === 'INPUT' ? input : input.get('input')).element as HTMLInputElement).value).toBe('CMR-777')
    api.getDeclaration.mockResolvedValue(response({ version: 9 }))
    await w.get('[data-td-reload]').trigger('click')
    await settle()
    expect(has('[data-td-save-error]')).toBe(false)
    expect(((input.element.tagName === 'INPUT' ? input : input.get('input')).element as HTMLInputElement).value).toBe('CMR-777')
  })

  it('уход с несохранённым спрашивает подтверждение; «Остаться» — страница на месте', async () => {
    await open(response())
    await typeInto('[data-f="transportDocNumber"]', 'CMR-1')
    const nav = router.push('/auto-transit/t1')
    await settle()
    expect(confirmState.open).toBe(true)
    confirmState.resolve(false)
    await nav
    await settle()
    expect(router.currentRoute.value.name).toBe('auto-transit-td')
  })

  it('без правок уходит без вопроса', async () => {
    await open(response())
    await router.push('/auto-transit/t1')
    await settle()
    expect(confirmState.open).toBe(false)
    expect(router.currentRoute.value.name).toBe('auto-transit-truck')
  })

  it('контейнеры свёрнуты в конце и раскрываются', async () => {
    await open(response())
    expect(has('[data-record-section="containers"]')).toBe(false)
    await w.get('[data-td-containers-toggle]').trigger('click')
    expect(has('[data-record-section="containers"]')).toBe(true)
  })

  it('ТД не найдена — пустое состояние со ссылкой к машине', async () => {
    api.getDeclaration.mockRejectedValue(httpError(404))
    await router.push('/auto-transit/t1/parties/p1/td')
    await router.isReady()
    w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [pinia, router], stubs: { ZSelect: SelectStub, ZCombobox: ComboStub } } })
    await settle()
    expect(has('[data-td-not-found]')).toBe(true)
  })
})

describe('TdPage: копия с прошлой ТД (Task 3)', () => {
  const SRC = [
    { partyId: 'old1', truckId: 't0', truckPlate: '777AAA02', tdNumber: '50509/171126/0001', updatedAtUtc: '2026-11-16T10:00:00Z', goodsCount: 3 },
    { partyId: 'old2', truckId: 't9', truckPlate: '888BBB02', tdNumber: '', updatedAtUtc: null, goodsCount: 0 },
  ]
  const source = () => fullData({
    organizations: [{ role: 'Получатель', subjectType: 'ЮЛ', bin: '111', name: 'Из прошлой ТД', shortName: null, address: null, phone: null, email: null }],
    goods: manyGoods(3),
  })
  const orgNames = () => Array.from(document.body.querySelectorAll<HTMLElement>('[data-record-section="organizations"] [data-f="name"]'))
    .map((el) => ((el.matches('input') ? el : el.querySelector('input')) as HTMLInputElement).value)
  const openModal = async () => {
    await w.get('[data-td-copy]').trigger('click')
    await settle()
  }
  const okBtn = () => Array.from(document.body.querySelectorAll<HTMLButtonElement>('[data-td-copy-modal] button')).find((b) => b.textContent?.trim() === 'Копировать')!

  it('кнопки нет при пустом списке источников и при readOnly; есть — когда список не пуст', async () => {
    await open(response())
    expect(api.listCopySources).toHaveBeenCalledWith('t1', 'p1')
    expect(has('[data-td-copy]')).toBe(false)
    w.unmount()
    document.body.innerHTML = ''
    api.listCopySources.mockResolvedValue(SRC)
    await open(response({ readOnly: true }))
    expect(has('[data-td-copy]')).toBe(false)
    w.unmount()
    document.body.innerHTML = ''
    await open(response())
    expect(text(w.get('[data-td-copy]').text())).toBe('Копировать с прошлой ТД')
  })

  it('окно: список прошлых ТД, первая выбрана; без галочки товары не копируются; замену подтверждают; PUT не зовётся', async () => {
    api.listCopySources.mockResolvedValue(SRC)
    await open(response())
    await openModal()
    const rows = Array.from(document.body.querySelectorAll<HTMLElement>('[data-td-copy-source]'))
    expect(rows.map((r) => Array.from(r.querySelectorAll('span > span')).map((x) => x.textContent?.trim()).join(' '))).toEqual([
      'Машина 777AAA02 ТД № 50509/171126/0001 · сохранена 16.11.2026 · товаров: 3',
      'Машина 888BBB02 номер ТД не внесён · товаров: 0',
    ])
    expect((rows[0]!.querySelector('input') as HTMLInputElement).checked).toBe(true)
    api.getCopySource.mockResolvedValue({ data: source() })
    const goodsBefore = w.findAll('[data-goods-card]').length
    okBtn().click()
    await settle()
    expect(api.getCopySource).toHaveBeenCalledWith('t1', 'p1', 'old1')
    // В текущей ТД уже есть организации — сначала вопрос.
    expect(confirmState.open).toBe(true)
    confirmState.resolve(true)
    await settle()
    expect(w.findAll('[data-goods-card]').length).toBe(goodsBefore)
    expect(orgNames()).toEqual(['Из прошлой ТД'])
    expect(toast.success).toHaveBeenCalledWith('Данные прошлой ТД подставлены. Проверьте и нажмите «Сохранить».')
    expect(api.saveDeclaration).not.toHaveBeenCalled()
    expect(has('[data-record-savebar]')).toBe(true)
  })

  it('с галочкой «Скопировать и товары» — товары из источника; «Отмена» в вопросе ничего не меняет', async () => {
    api.listCopySources.mockResolvedValue(SRC)
    await open(response())
    await openModal()
    api.getCopySource.mockResolvedValue({ data: source() })
    okBtn().click()
    await settle()
    confirmState.resolve(false)
    await settle()
    expect(orgNames()).not.toContain('Из прошлой ТД')
    ;(document.body.querySelector('[data-td-copy-goods]') as HTMLElement).click()
    await settle()
    okBtn().click()
    await settle()
    confirmState.resolve(true)
    await settle()
    expect(w.findAll('[data-goods-card]')).toHaveLength(3)
  })

  it('источник больше недоступен (404) — ошибка в окне, черновик не тронут', async () => {
    api.listCopySources.mockResolvedValue(SRC)
    await open(response())
    await openModal()
    api.getCopySource.mockRejectedValue(httpError(404))
    okBtn().click()
    await settle()
    expect(text(document.body.querySelector('[data-td-copy-error]')!.textContent ?? '')).toContain('больше недоступна')
    expect(confirmState.open).toBe(false)
  })
})

describe('TdPage: мелочи из отчёта Task 2', () => {
  it('переход к товару из «Не заполнено» разворачивает его свёрнутую карточку и ставит фокус в поле', async () => {
    await open(response({ missing: [{ key: 'goods[1].description', section: 'goods' }] }))
    const cards = () => w.findAll('[data-goods-card]')
    expect(cards()[1]!.find('[data-goods-body]').exists()).toBe(false)
    await w.get('[data-td-missing-item]').trigger('click')
    await settle()
    expect(cards()[1]!.find('[data-goods-body]').exists()).toBe(true)
    const field = cards()[1]!.get('[data-f="description"]').element
    const input = field.matches('input') ? field : field.querySelector('input')
    expect(document.activeElement).toBe(input)
  })

  it('Ctrl/⌘+S сохраняет при правках; без правок и при readOnly — нет', async () => {
    await open(response())
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true }))
    await settle()
    expect(api.saveDeclaration).not.toHaveBeenCalled()
    await typeInto('[data-f="transportDocNumber"]', 'CMR-9')
    api.saveDeclaration.mockResolvedValue(response())
    const e = new KeyboardEvent('keydown', { key: 's', code: 'KeyS', metaKey: true, cancelable: true })
    window.dispatchEvent(e)
    await settle()
    expect(e.defaultPrevented).toBe(true)
    expect(api.saveDeclaration).toHaveBeenCalledTimes(1)
  })
})

describe('TdPage: ПИ под авто (очередь 3)', () => {
  const vehicles = [
    { role: 'tractor', typeCode: '303', regNumber: '123ASD12', countryCode: 'KZ', vin: '-', headIndex: null },
    { role: 'trailer', typeCode: '312', regNumber: '12DS12', countryCode: 'KZ', vin: '-', headIndex: 0 },
  ]
  const driver = { fullName: 'ТЕСТОВ ТЕСТ', countryCode: 'KZ', docKindCode: null, docNumber: 'N0000001', personalNumber: null }

  it('«Машины и водитель»: тягач и прицеп с типами, водитель; правка водителя уходит в PUT, ЖД-транспорт не тронут', async () => {
    const data = { ...fullData(), vehicles, driver }
    await open(response({ data: data as never }))
    const cards = w.findAll('[data-record-section="vehicles"] [data-vehicle]')
    expect(cards.map((c) => c.attributes('data-vehicle'))).toEqual(['tractor', 'trailer'])
    expect(cards[0]!.get('[data-f="typeCode"]').attributes('data-value')).toBe('303')
    expect(cards[1]!.get('[data-f="typeCode"]').attributes('data-value')).toBe('312')
    expect(cards[1]!.get('[data-f="headIndex"]').attributes('data-value')).toBe('0')
    expect(w.get('[data-td-nav] [data-nav-item="vehicles"]').attributes('data-state')).toBe('done')
    await typeInto('[data-f="driver.docNumber"]', 'N0000009')
    expect(text(w.get('[data-savebar-text]').text())).toContain('машины и водитель')
    api.saveDeclaration.mockResolvedValue(response({ data: data as never }))
    await w.get('[data-td-save]').trigger('click')
    await settle()
    const body = api.saveDeclaration.mock.calls[0][2]
    expect(body.data.driver.docNumber).toBe('N0000009')
    expect(body.data.vehicles).toEqual(vehicles)
    expect(body.data.transportMeans).toEqual(data.transportMeans)
  })

  it('добавить прицеп — тип пуст (связку выбирает декларант), ссылка на тягач; удалить тягач — ссылка снимается', async () => {
    await open(response({ data: { ...fullData(), vehicles: [vehicles[0]] } as never }))
    await w.get('[data-vehicle-add="trailer"]').trigger('click')
    let cards = w.findAll('[data-vehicle]')
    expect(cards[1]!.get('[data-f="typeCode"]').attributes('data-value')).toBe('')
    expect(cards[1]!.get('[data-f="vin"] input, input[data-f="vin"]').exists()).toBe(true)
    expect(cards[1]!.get('[data-f="headIndex"]').attributes('data-value')).toBe('0')
    await cards[0]!.get('[data-vehicle-delete]').trigger('click')
    cards = w.findAll('[data-vehicle]')
    expect(cards).toHaveLength(1)
    expect(cards[0]!.get('[data-f="headIndex"]').attributes('data-value')).toBe('')
  })

  it('сцепка: кнопка связки ставит коды обоим ТС и подсвечивается; у одиночной машины кнопок нет', async () => {
    const bare = vehicles.map((v) => ({ ...v, typeCode: null }))
    await open(response({ data: { ...fullData(), vehicles: bare, driver } as never }))
    expect(w.findAll('[data-vehicle-pair]')).toHaveLength(3)
    expect(w.find('[data-vehicle-pair][data-active]').exists()).toBe(false)
    const btn = w.get('[data-vehicle-pair="tractorSemi"]')
    expect(text(btn.text())).toBe('Тягач + полуприцеп (307 + 319)')
    await btn.trigger('click')
    const cards = w.findAll('[data-vehicle]')
    expect(cards[0]!.get('[data-f="typeCode"]').attributes('data-value')).toBe('307')
    expect(cards[1]!.get('[data-f="typeCode"]').attributes('data-value')).toBe('319')
    expect(w.get('[data-vehicle-pair="tractorSemi"]').attributes('data-active')).toBe('true')
    await w.get('[data-vehicle-pair="truckTrailer"]').trigger('click')
    expect(cards[1]!.get('[data-f="typeCode"]').attributes('data-value')).toBe('312')
    expect(w.get('[data-vehicle-pair="tractorSemi"]').attributes('data-active')).toBeUndefined()
    w.unmount()
    await open(response({ data: { ...fullData(), vehicles: [{ ...vehicles[0]!, role: 'truck' }], driver } as never }))
    expect(w.find('[data-vehicle-pairs]').exists()).toBe(false)
  })

  it('старая ТД без машин и водителя открывается: пусто, без ошибок', async () => {
    await open(response())
    expect(has('[data-vehicles-empty]')).toBe(true)
    expect(w.get('[data-td-nav] [data-nav-item="vehicles"]').attributes('data-state')).toBe('empty')
  })

  it('стык сервера 562e375: «Не заполнено» vehicles без индекса подписан и ведёт к разделу машин', async () => {
    await open(response({ missing: [{ key: 'vehicles', section: 'vehicles' }] }))
    const item = w.get('[data-td-missing-item]')
    expect(text(item.text())).toBe('Машины: тягач или грузовик')
    const spy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})
    await item.trigger('click')
    await settle()
    expect(spy.mock.instances[0]).toBe(document.getElementById('sec-vehicles'))
    spy.mockRestore()
  })

  it('«Не заполнено» водителя ведёт к полю водителя', async () => {
    await open(response({ missing: [{ key: 'driver.fullName', section: 'vehicles' }, { key: 'vehicles[0].countryCode', section: 'vehicles' }] }))
    const items = w.findAll('[data-td-missing-item]')
    expect(items.map((i) => text(i.text()))).toEqual(['Водитель: ФИО', 'Машина 1: страна регистрации'])
    await items[0]!.trigger('click')
    await settle()
    const field = w.get('[data-f="driver.fullName"]').element
    expect(document.activeElement).toBe(field.matches('input') ? field : field.querySelector('input'))
  })

  it('расхождение итогов с партией — плашка с точными числами, 0,5 кг на 19 т видно', async () => {
    const data = fullData({ goods: [{ ...fullData().goods[0]!, packagesCount: 10, grossWeightKg: 19000.5, customsValue: 100 }] })
    await open(response({ data, totalsCheck: { places: { goods: 10, party: 10 }, grossKg: { goods: 19000.5, party: 19000 }, value: { goods: 100, party: 100 } } }))
    const banner = text(w.get('[data-td-totals]').text())
    expect(banner).toContain('Итоги товаров не сходятся с партией')
    expect(w.findAll('[data-td-totals-row]').map((r) => r.attributes('data-td-totals-row'))).toEqual(['grossKg'])
    expect(banner).toContain('19 000,5')
    expect(banner).toContain('19 000')
    expect(banner).toContain('+0,5')
  })

  it('ревью M8: в партии итог не указан, а в товарах есть — строка «в партии не указано»', async () => {
    const data = fullData({ goods: [{ ...fullData().goods[0]!, packagesCount: 10, grossWeightKg: 19000, customsValue: 100 }] })
    await open(response({ data, totalsCheck: { places: { goods: 10, party: 0 }, grossKg: { goods: 19000, party: 19000 }, value: { goods: 100, party: 100 } } }))
    const row = w.get('[data-td-totals-row="places"]')
    expect(text(row.text())).toBe('Места: товары 10, в партии не указано')
  })

  it('копия: виден получатель источника', async () => {
    api.listCopySources.mockResolvedValue([
      { partyId: 'old1', truckId: 't0', truckPlate: '777AAA02', tdNumber: '', updatedAtUtc: null, goodsCount: 1, matchedBy: ['destinationOffice'], recipientName: 'ТОО «Чужой»' },
    ])
    await open(response())
    await w.get('[data-td-copy]').trigger('click')
    await settle()
    expect(text(document.body.querySelector('[data-td-copy-source]')!.textContent ?? '')).toContain('Машина 777AAA02 · ТОО «Чужой»')
  })

  it('итоги сходятся — плашки нет', async () => {
    const data = fullData({ goods: [{ ...fullData().goods[0]!, packagesCount: 10, grossWeightKg: 19000, customsValue: 100 }] })
    await open(response({ data, totalsCheck: { places: { goods: 10, party: 10 }, grossKg: { goods: 19000, party: 19000 }, value: { goods: 100, party: 100 } } }))
    expect(has('[data-td-totals]')).toBe(false)
  })

  it('копия: в списке видно, по чему совпало', async () => {
    api.listCopySources.mockResolvedValue([
      { partyId: 'old1', truckId: 't0', truckPlate: '777AAA02', tdNumber: '', updatedAtUtc: null, goodsCount: 1, matchedBy: ['consignor', 'destinationOffice'] },
    ])
    await open(response())
    await w.get('[data-td-copy]').trigger('click')
    await settle()
    expect(text(document.body.querySelector('[data-td-copy-source]')!.textContent ?? '')).toContain('совпало: отправитель, пост назначения')
  })

  // ---- Этап 3: опись и акт осмотра ----
  const openDocs = async () => {
    await w.get('[data-td-docs]').trigger('keydown', { key: 'Enter' })
    await vi.waitFor(() => expect(document.body.querySelectorAll('[role="menuitem"]')).toHaveLength(3))
    return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  }

  it('«Документы»: опись и акт скачиваются из сохранённой ПИ', async () => {
    await open(response())
    api.downloadPartyDoc.mockResolvedValue({ blob: new Blob(['x']), fileName: 'Опись 123ASD12 INV-1.docx' })
    const items = await openDocs()
    expect(items.map((i) => text(i.textContent ?? ''))).toEqual(['Опись документов (.docx)', 'Акт осмотра (.docx)', 'Договор экспедиции (.docx)'])
    items[0]!.click()
    await vi.waitFor(() => expect(dl.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'Опись 123ASD12 INV-1.docx'))
    expect(api.downloadPartyDoc).toHaveBeenCalledWith('t1', 'p1', 'inventory', 'inventory.docx')

    api.downloadPartyDoc.mockResolvedValue({ blob: new Blob(['y']), fileName: 'Акт осмотра 123ASD12.docx' })
    ;(await openDocs())[1]!.click()
    await vi.waitFor(() => expect(api.downloadPartyDoc).toHaveBeenLastCalledWith('t1', 'p1', 'inspection-act', 'inspection-act.docx'))
  })

  it('«Документы»: черновик и несохранённые правки — пункты выключены с подсказкой «Сначала сохраните ПИ»', async () => {
    await open(response({ isDraft: true }))
    let items = await openDocs()
    expect(items.every((i) => i.hasAttribute('data-disabled'))).toBe(true)
    expect(text(items[0]!.textContent ?? '')).toContain('Сначала сохраните ПИ')
    items[0]!.click()
    await settle()
    expect(api.downloadPartyDoc).not.toHaveBeenCalled()
    w.unmount()
    document.body.innerHTML = ''

    await open(response())
    items = await openDocs()
    expect(items.some((i) => i.hasAttribute('data-disabled'))).toBe(false)
    await w.get('[data-td-docs]').trigger('keydown', { key: 'Escape' })
    await typeInto('[data-f="sealNumber"], [data-td-sections] input', 'ПРАВКА')
    items = await openDocs()
    expect(items.every((i) => i.hasAttribute('data-disabled'))).toBe(true)
  })

  it('«Документы»: 409 declaration_not_saved — понятный текст', async () => {
    await open(response())
    api.downloadPartyDoc.mockRejectedValue(httpError(409, new Blob([JSON.stringify({ code: 'declaration_not_saved', error: 'x' })])))
    ;(await openDocs())[0]!.click()
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('ПИ ещё не сохранена. Сохраните ПИ и скачайте документ снова.'))
    expect(dl.saveBlob).not.toHaveBeenCalled()
  })

  it('«Документы»: договор экспедиции; нет шаблона — 409 contract_template_missing с подсказкой', async () => {
    await open(response())
    api.downloadPartyDoc.mockResolvedValue({ blob: new Blob(['z']), fileName: 'Договор экспедиции 123ASD12.docx' })
    ;(await openDocs())[2]!.click()
    await vi.waitFor(() => expect(dl.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'Договор экспедиции 123ASD12.docx'))
    expect(api.downloadPartyDoc).toHaveBeenLastCalledWith('t1', 'p1', 'contract', 'contract.docx')

    api.downloadPartyDoc.mockRejectedValue(httpError(409, new Blob([JSON.stringify({ code: 'contract_template_missing', error: 'x' })])))
    ;(await openDocs())[2]!.click()
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Шаблон договора экспедиции не загружен. Загрузите .docx в «Настройки → Авто-транзит».'))
  })
  describe('«Товары для КЕДЕН»', () => {
    const clip = vi.fn()
    const dom = (sel: string) => document.body.querySelector<HTMLElement>(sel)
    const openKeden = async () => {
      await w.get('[data-td-keden]').trigger('click')
      await settle()
    }
    beforeEach(() => {
      clip.mockReset().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: clip }, configurable: true })
    })

    it('товары в порядке: «Копировать» кладёт в буфер TSV и показывает тост', async () => {
      await open(response({ data: fullData({ goods: manyGoods(2) }) }))
      await openKeden()
      expect(dom('[data-td-keden-errors]')).toBeNull()
      expect(dom('[data-td-keden-copy]')!.hasAttribute('disabled')).toBe(false)
      dom('[data-td-keden-copy]')!.click()
      await vi.waitFor(() => expect(clip).toHaveBeenCalledTimes(1))
      const tsv = clip.mock.calls[0]![0] as string
      const lines = tsv.split('\n')
      expect(lines).toHaveLength(3)
      expect(lines[0]!.startsWith('Код ТН ВЭД\tПолное описание товара')).toBe(true)
      expect(lines[1]!.split('\t').slice(0, 5)).toEqual(['8471300000', 'Товар 1', lines[1]!.split('\t')[2], '1234.5678', 'USD'])
      await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('Скопировано: 2 товаров'))
    })

    it('«Скачать Excel» отдаёт файл с именем из госномера и партии', async () => {
      await open(response({ data: fullData({ goods: manyGoods(1) }) }))
      await openKeden()
      dom('[data-td-keden-xlsx]')!.click()
      await vi.waitFor(() => expect(dl.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'Товары-КЕДЕН-123ASD12-1.xlsx'))
    })

    it('ошибка проверки (нет товаров): обе кнопки неактивны, буфер не трогается', async () => {
      await open(response({ data: fullData({ goods: [] }) }))
      await openKeden()
      expect(text(dom('[data-td-keden-errors]')!.textContent ?? '')).toContain('В ТД нет товаров')
      expect(dom('[data-td-keden-copy]')!.hasAttribute('disabled')).toBe(true)
      expect(dom('[data-td-keden-xlsx]')!.hasAttribute('disabled')).toBe(true)
      dom('[data-td-keden-copy]')!.click()
      await settle()
      expect(clip).not.toHaveBeenCalled()
    })

    it('черновик: предупреждение «сохраните ТД»', async () => {
      await open(response({ isDraft: true, data: fullData({ goods: manyGoods(1) }) }))
      await openKeden()
      expect(text(dom('[data-td-keden-stale]')!.textContent ?? '')).toContain('Сохраните ТД')
    })

    it('сбой буфера обмена — сообщение об ошибке', async () => {
      clip.mockRejectedValue(new Error('denied'))
      await open(response({ data: fullData({ goods: manyGoods(1) }) }))
      await openKeden()
      dom('[data-td-keden-copy]')!.click()
      await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Не удалось скопировать')))
    })
  })
})
