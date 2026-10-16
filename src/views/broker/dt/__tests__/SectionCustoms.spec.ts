import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { vUppercase } from '@/directives/uppercase'
import { useClassifiersStore } from '@/stores/classifiers'
import type { WarehouseRegistryItem } from '@/api/warehouseRegistry'
import { emptyDtForm, type DtFormState } from '../dtPayload'
import SectionCustoms from '../sections/SectionCustoms.vue'

const refs = vi.hoisted(() => ({ getDtGuideGraph: vi.fn(), listClassifiers: vi.fn(), listCountries: vi.fn(), addGoodsLocation: vi.fn() }))
const registry = vi.hoisted(() => ({ search: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))
vi.mock('@/api/warehouseRegistry', async (orig) => ({ ...(await orig<typeof import('@/api/warehouseRegistry')>()), warehouseRegistryApi: registry }))
vi.mock('@/ui/message', () => ({ message: toast }))

const item = (classifierCode: string, code: string, nameRu: string) => ({ id: `${classifierCode}-${code}`, classifierCode, code, nameRu, sortOrder: 0, isActive: true })
const posts = [
  { value: '55302', label: '55302 — ТАМОЖЕННЫЙ ПОСТ «КОРГАС»' },
  { value: '55300', label: '55300 — ТАМОЖЕННЫЙ ПОСТ «ДОСТЫК»' },
]
const row = (over: Partial<WarehouseRegistryItem> = {}): WarehouseRegistryItem => ({
  id: 1, kind: 'svh', registrationNumber: 'KZ56VSX00000119', legacyNumber: null, ownerName: 'ТОО «Склад»', bin: '123456789012',
  address: 'г. Алматы, ул. Складская 1', dgdName: null, includedDate: null, isSuspended: false, numberCorrected: false,
  customsOfficeCode: '55300', customsOffices: [], warehouseType: null, status: null, ...over,
})
let w: VueWrapper
let pinia: ReturnType<typeof createPinia>
let form: DtFormState
afterEach(() => { w?.unmount(); document.body.innerHTML = ''; vi.useRealTimers() })
beforeEach(() => {
  vi.clearAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
  form = reactive(emptyDtForm())
  form.goodsLocationCode = ''
  refs.listCountries.mockResolvedValue([{ alpha2: 'KZ', name: 'Казахстан' }, { alpha2: 'CN', name: 'Китай' }])
  registry.search.mockResolvedValue([])
  useClassifiersStore().cache = {
    'goods-locations': [item('goods-locations', '11', 'СВХ'), item('goods-locations', '52', 'На транспортном средстве'), item('goods-locations', '31', 'Склад')],
  }
})

const mount = async (over: Partial<DtFormState> = {}, props: Record<string, unknown> = {}) => {
  Object.assign(form, over)
  w = mountWithI18n(SectionCustoms, {
    props: { form, readonly: false, postOptions: posts, ...props },
    global: { plugins: [pinia], directives: { uppercase: vUppercase }, stubs: { DtGraphHelp: { props: ['graph'], template: '<i data-help />' } } },
    attachTo: document.body,
  })
  await flushPromises()
  return w
}
const optionTexts = () => [...document.body.querySelectorAll('[role="option"]')].map((e) => e.textContent?.trim().replace(/\s+/g, ' '))
// data-* ZSelect / ZCombobox попадают на сам <input> (контракт Z-полей), у ZField — на обёртку: ищем и там, и там.
const inputOf = (sel: string) => (w.find(`input${sel}`).exists() ? w.get(`input${sel}`) : w.get(sel).get('input'))
const open = async (sel: string) => { await inputOf(sel).trigger('keydown', { key: 'ArrowDown' }); await nextTick() }
const pick = async (text: string) => {
  ;([...document.body.querySelectorAll('[role="option"]')].find((e) => e.textContent?.includes(text)) as HTMLElement).click()
  await nextTick()
}
const numberInput = () => inputOf('[data-register-number]')
const typeNumber = async (text: string) => { await numberInput().setValue(text); await nextTick() }
const PAUSE = 300

describe('SectionCustoms — гр. 29', () => {
  const postInput = (i: number) => w.findAll('input[data-border-post]')[i]
  const openPost = async (i: number) => { await postInput(i).trigger('keydown', { key: 'ArrowDown' }); await nextTick() }

  it('один выбор поста заполняет код и название — без «код —» (как у КЕДЕН, M8)', async () => {
    await mount()
    expect(w.findAll('[data-border-row]')).toHaveLength(1)
    expect(w.find('[data-border-add]').exists()).toBe(false) // «Добавить» — после выбора первого поста
    await openPost(0)
    expect(optionTexts()).toEqual(['55302 — ТАМОЖЕННЫЙ ПОСТ «КОРГАС»', '55300 — ТАМОЖЕННЫЙ ПОСТ «ДОСТЫК»'])
    await pick('ДОСТЫК')
    expect(form.borderCustomsOffices).toEqual([{ code: '55300', name: 'ТАМОЖЕННЫЙ ПОСТ «ДОСТЫК»' }])
    await w.get('[data-graph="29"] button[aria-label="Очистить"]').trigger('click')
    expect(form.borderCustomsOffices).toEqual([{ code: '', name: '' }])
  })

  it('несколько постов: добавить, выбранный пост второй раз не предлагается, первый — основной, убрать', async () => {
    await mount({ borderCustomsOffices: [{ code: '55300', name: 'ТАМОЖЕННЫЙ ПОСТ «ДОСТЫК»' }] })
    expect(w.find('[data-border-main]').exists()).toBe(false)
    expect(w.find('[data-border-remove]').exists()).toBe(false)

    await w.get('[data-border-add]').trigger('click')
    expect(w.findAll('[data-border-row]')).toHaveLength(2)
    expect(w.findAll('[data-border-row]')[1].text()).toContain('Пост на границе № 2')
    expect(w.get('[data-border-main]').text()).toBe('основной')
    await openPost(1)
    expect(optionTexts()).toEqual(['55302 — ТАМОЖЕННЫЙ ПОСТ «КОРГАС»'])
    await pick('КОРГАС')
    expect(form.borderCustomsOffices).toEqual([
      { code: '55300', name: 'ТАМОЖЕННЫЙ ПОСТ «ДОСТЫК»' },
      { code: '55302', name: 'ТАМОЖЕННЫЙ ПОСТ «КОРГАС»' },
    ])

    // Убираем основной — основным становится следующий.
    await w.findAll('[data-border-remove]')[0].trigger('click')
    expect(form.borderCustomsOffices).toEqual([{ code: '55302', name: 'ТАМОЖЕННЫЙ ПОСТ «КОРГАС»' }])
    expect((postInput(0).element as HTMLInputElement).value).toBe('55302 — ТАМОЖЕННЫЙ ПОСТ «КОРГАС»')
    expect(w.find('[data-border-remove]').exists()).toBe(false)
  })

  it('«Добавить пост» недоступна, пока есть пустая строка; доступна снова после выбора', async () => {
    await mount({ borderCustomsOffices: [{ code: '55300', name: 'ТАМОЖЕННЫЙ ПОСТ «ДОСТЫК»' }] })
    const add = () => w.get('[data-border-add]')
    expect(add().attributes('disabled')).toBeUndefined()
    await add().trigger('click')
    expect(form.borderCustomsOffices).toHaveLength(2)
    expect(add().attributes('disabled')).toBeDefined()
    await add().trigger('click') // выключенная кнопка строку не добавляет
    expect(form.borderCustomsOffices).toHaveLength(2)

    await openPost(1)
    await pick('КОРГАС')
    expect(add().attributes('disabled')).toBeUndefined()

    // Очистили основной пост — снова есть пустая строка.
    await w.findAll('[data-graph="29"] button[aria-label="Очистить"]')[0].trigger('click')
    expect(add().attributes('disabled')).toBeDefined()
  })

  it('не больше 10 постов: на десятом «Добавить пост» недоступна и есть подсказка', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ code: String(57000 + i), name: `ПОСТ ${i}` }))
    await mount({ borderCustomsOffices: ten.slice(0, 9) })
    expect(w.get('[data-border-add]').attributes('disabled')).toBeUndefined()
    expect(w.get('[data-border-hint]').text()).not.toContain('Не больше')
    w.unmount()
    form.borderCustomsOffices = ten
    await mount()
    expect(w.get('[data-border-add]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-border-hint]').text()).toBe('Не больше 10 постов на границе.')
  })

  it('у кнопок удаления разные подписи: номер поста и его код', async () => {
    await mount({ borderCustomsOffices: [{ code: '55300', name: 'А' }, { code: '', name: '57505 — ТАМОЖЕННЫЙ ПОСТ' }, { code: '', name: '' }] })
    const labels = w.findAll('[data-border-remove]').map((b) => [b.attributes('aria-label'), b.attributes('title')])
    expect(labels).toEqual([
      ['Удалить пост № 1 (55300)', 'Удалить пост № 1 (55300)'],
      ['Удалить пост № 2 (57505)', 'Удалить пост № 2 (57505)'],
      ['Удалить пост № 3', 'Удалить пост № 3'],
    ])
  })

  it('только чтение — без кнопок добавления и удаления', async () => {
    await mount({ borderCustomsOffices: [{ code: '55300', name: 'А' }, { code: '55302', name: 'Б' }] }, { readonly: true })
    expect(w.findAll('[data-border-row]')).toHaveLength(2)
    expect(w.find('[data-border-add]').exists()).toBe(false)
    expect(w.find('[data-border-remove]').exists()).toBe(false)
  })

  it('старая запись с подписью целиком («код — название») — пост узнаётся по коду, без предупреждения', async () => {
    await mount({ borderCustomsOffices: [{ code: '', name: '55300 — ТАМОЖЕННЫЙ ПОСТ «ДОСТЫК»' }] })
    expect((inputOf('[data-border-post]').element as HTMLInputElement).value).toBe('55300 — ТАМОЖЕННЫЙ ПОСТ «ДОСТЫК»')
    expect(w.get('[data-graph="29"]').text()).not.toContain('нет в справочнике')
  })

  it('старое значение вне справочника показано с предупреждением; справочник не загружен — без него', async () => {
    await mount({ borderCustomsOffices: [{ code: '', name: 'СТАРЫЙ ПОСТ' }] })
    expect(w.get('[data-graph="29"]').text()).toContain('Значения «СТАРЫЙ ПОСТ» нет в справочнике')
    w.unmount()
    await mount({ borderCustomsOffices: [{ code: '', name: 'СТАРЫЙ ПОСТ' }] }, { postOptions: [] })
    expect(w.text()).not.toContain('нет в справочнике')
  })
})

describe('SectionCustoms — гр. 30: код места и справочник', () => {
  it('код места — выбор из классификатора; неизвестный код с предупреждением', async () => {
    await mount({ goodsLocationCode: '11' })
    expect((inputOf('[data-location-code]').element as HTMLInputElement).value).toBe('11 — СВХ')
    await open('[data-graph="30"]')
    expect(optionTexts()).toEqual(['11 — СВХ', '31 — Склад', '52 — На транспортном средстве'])
    await pick('31 — Склад')
    expect(form.goodsLocationCode).toBe('31')
    form.goodsLocationCode = '77'
    await nextTick()
    expect(w.get('[data-graph="30"]').text()).toContain('Значения «77» нет в справочнике')
  })

  it('«Добавить в справочник» открывает окно (не window.prompt); сохранённый код встаёт в графу', async () => {
    const prompt = vi.spyOn(window, 'prompt')
    refs.addGoodsLocation.mockResolvedValue({})
    refs.listClassifiers.mockResolvedValue([item('goods-locations', '11', 'СВХ'), item('goods-locations', '77', 'Новое место')])
    await mount({ goodsLocationCode: '77' })
    expect(document.body.querySelector('[data-goods-location-modal]')).toBeNull()
    await w.get('[data-location-add]').trigger('click')
    await flushPromises()
    const modal = document.body.querySelector('[data-goods-location-modal]') as HTMLElement
    expect(modal).not.toBeNull()
    // Код, введённый в графе и отсутствующий в справочнике, подставлен в окно.
    expect((modal.querySelector('[data-location-code]') as HTMLInputElement).value).toBe('77')
    const name = modal.querySelector('[data-location-name]') as HTMLInputElement
    name.value = 'Новое место'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    ;([...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Добавить') as HTMLElement).click()
    await flushPromises()
    expect(refs.addGoodsLocation).toHaveBeenCalledWith('77', 'Новое место')
    expect(form.goodsLocationCode).toBe('77')
    expect(prompt).not.toHaveBeenCalled()
    expect(w.get('[data-graph="30"]').text()).not.toContain('нет в справочнике')
  })

  it('в просмотре «Добавить в справочник» нет', async () => {
    await mount({}, { readonly: true })
    expect(w.find('[data-location-add]').exists()).toBe(false)
  })
})

describe('SectionCustoms — гр. 30: номер СВХ / ТС из реестров', () => {
  it('поиск — после паузы одним запросом по последнему тексту; короче 2 знаков не ищет', async () => {
    await mount()
    vi.useFakeTimers()
    await typeNumber('K')
    await typeNumber('KZ')
    await typeNumber('KZ56')
    expect(registry.search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(PAUSE)
    expect(registry.search).toHaveBeenCalledTimes(1)
    expect(registry.search).toHaveBeenCalledWith('KZ56')
    registry.search.mockClear()
    await typeNumber('K')
    await vi.advanceTimersByTimeAsync(PAUSE * 2)
    expect(registry.search).not.toHaveBeenCalled()
  })

  it('ответ устаревшего запроса не затирает свежий (гонка)', async () => {
    await mount()
    vi.useFakeTimers()
    let resolveSlow: (v: WarehouseRegistryItem[]) => void = () => {}
    registry.search
      .mockImplementationOnce(() => new Promise<WarehouseRegistryItem[]>((r) => { resolveSlow = r }))
      .mockResolvedValueOnce([row({ id: 2, registrationNumber: 'KZ99FRESH0000001', ownerName: 'СВЕЖИЙ' })])
    await typeNumber('KZ5')
    await vi.advanceTimersByTimeAsync(PAUSE)
    await typeNumber('KZ99')
    await vi.advanceTimersByTimeAsync(PAUSE)
    resolveSlow([row({ id: 1, ownerName: 'СТАРЫЙ' })])
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()
    const texts = [...document.body.querySelectorAll('[data-registry-option]')].map((e) => e.textContent)
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('СВЕЖИЙ')
  })

  it('карточка варианта: номер, вид, «приостановлено», владелец, адрес, орган', async () => {
    registry.search.mockResolvedValue([
      row({ id: 1, isSuspended: true }),
      row({ id: 2, kind: 'customs_warehouse', registrationNumber: 'KZ11TSK00000002', ownerName: 'ТОО «ТС»', address: null, customsOfficeCode: null, warehouseType: 'Открытый' }),
    ])
    await mount()
    vi.useFakeTimers()
    await typeNumber('KZ')
    await vi.advanceTimersByTimeAsync(PAUSE)
    const cards = [...document.body.querySelectorAll('[data-registry-option]')].map((e) => e.textContent ?? '')
    for (const part of ['KZ56VSX00000119', 'СВХ', 'приостановлено', 'ТОО «Склад» · г. Алматы, ул. Складская 1 · орган 55300']) expect(cards[0]).toContain(part)
    for (const part of ['KZ11TSK00000002', 'Таможенный склад, открытый', 'ТОО «ТС»']) expect(cards[1]).toContain(part)
    expect(cards[1]).not.toContain('приостановлено')
  })

  it('выбор варианта: номер, адрес (только в пустой), орган из реестра', async () => {
    registry.search.mockResolvedValue([row()])
    await mount({ goodsLocationAddress: '' })
    vi.useFakeTimers()
    await typeNumber('KZ')
    await vi.advanceTimersByTimeAsync(PAUSE)
    vi.useRealTimers()
    ;(document.body.querySelector('[role="option"]') as HTMLElement).click()
    await flushPromises()
    expect(form.goodsLocationRegisterNumber).toBe('KZ56VSX00000119')
    expect(form.goodsLocationAddress).toBe('Г. АЛМАТЫ, УЛ. СКЛАДСКАЯ 1')
    expect(form.goodsLocationCustomsOfficeCode).toBe('55300')
    expect(toast.info).toHaveBeenCalledWith('Орган 55300 подставлен из реестра склада')
    expect((numberInput().element as HTMLInputElement).value).toBe('KZ56VSX00000119')
  })

  it('введённые адрес и орган не затираются выбором', async () => {
    registry.search.mockResolvedValue([row()])
    await mount({ goodsLocationAddress: 'МОЙ АДРЕС', goodsLocationCustomsOfficeCode: '55302' })
    vi.useFakeTimers()
    await typeNumber('KZ')
    await vi.advanceTimersByTimeAsync(PAUSE)
    vi.useRealTimers()
    ;(document.body.querySelector('[role="option"]') as HTMLElement).click()
    await flushPromises()
    expect(form.goodsLocationAddress).toBe('МОЙ АДРЕС')
    expect(form.goodsLocationCustomsOfficeCode).toBe('55302')
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('несколько органов в НСИ — варианты под полем; выбор варианта ставит орган', async () => {
    registry.search.mockResolvedValue([row({ customsOfficeCode: null, customsOffices: [
      { customsOfficeCode: '55300', ownerName: 'ТОО «Склад»', address: 'Достык', kind: 'svh' },
      { customsOfficeCode: '55302', ownerName: 'ТОО «Склад»', address: 'Коргас', kind: 'svh' },
    ] })])
    await mount()
    vi.useFakeTimers()
    await typeNumber('KZ')
    await vi.advanceTimersByTimeAsync(PAUSE)
    vi.useRealTimers()
    ;(document.body.querySelector('[role="option"]') as HTMLElement).click()
    await flushPromises()
    expect(form.goodsLocationCustomsOfficeCode).toBe('')
    const chips = w.findAll('[data-office-choice]')
    expect(chips.map((c) => c.text())).toEqual(['55300 · Достык', '55302 · Коргас'])
    await chips[1].trigger('click')
    expect(form.goodsLocationCustomsOfficeCode).toBe('55302')
    expect(w.findAll('[data-office-choice]')[1].attributes('aria-pressed')).toBe('true')
  })

  it('выбор варианта с тем же номером: поле не остаётся с ключом подсказки', async () => {
    registry.search.mockResolvedValue([row()])
    await mount()
    vi.useFakeTimers()
    await typeNumber('KZ56VSX00000119')
    await vi.advanceTimersByTimeAsync(PAUSE)
    vi.useRealTimers()
    ;(document.body.querySelector('[role="option"]') as HTMLElement).click()
    await flushPromises()
    expect(form.goodsLocationRegisterNumber).toBe('KZ56VSX00000119')
    expect((numberInput().element as HTMLInputElement).value).toBe('KZ56VSX00000119')
  })

  it('ручной ввод остаётся: верхний регистр; реестр недоступен — без ошибок', async () => {
    registry.search.mockRejectedValue(new Error('down'))
    await mount()
    vi.useFakeTimers()
    await typeNumber('kz77abc')
    expect(form.goodsLocationRegisterNumber).toBe('KZ77ABC')
    await vi.advanceTimersByTimeAsync(PAUSE)
    expect(document.body.querySelector('[role="option"]')).toBeNull()
  })

  it('проверка номера — предупреждение, не блокировка', async () => {
    await mount({ goodsLocationRegisterNumber: '' })
    expect(w.text()).not.toContain('Проверьте номер')
    form.goodsLocationRegisterNumber = 'KZ56VSX0000011'
    await nextTick()
    expect(w.text()).toContain('Номер КЕДЕН имеет вид KZ56VSX00000119')
    form.goodsLocationRegisterNumber = '415'
    await nextTick()
    expect(w.text()).toContain('Похоже на старый номер реестра')
    form.goodsLocationRegisterNumber = 'KZ00VSX00000119'
    await nextTick()
    expect(w.text()).toContain('контрольные цифры не сходятся')
    // Значение при этом остаётся — ввод не блокируется.
    expect(form.goodsLocationRegisterNumber).toBe('KZ00VSX00000119')
  })
})

describe('SectionCustoms — гр. 30: страна, орган, станция, адрес, код 52', () => {
  it('страна места — alpha-2 из справочника', async () => {
    await mount({ goodsLocationCountryCode: 'KZ' })
    expect((inputOf('[data-location-country]').element as HTMLInputElement).value).toBe('KZ — Казахстан')
    await open('[data-location-country]')
    await pick('CN — Китай')
    expect(form.goodsLocationCountryCode).toBe('CN')
  })

  it('орган места: пусто = ДГД поста подачи (подсказка называет код уровня ДГД); выбор и очистка', async () => {
    await mount({ submissionCustomsOfficeCode: '55302' })
    expect(inputOf('[data-location-office]').attributes('placeholder')).toBe('ДГД поста подачи: 55300')
    await open('[data-location-office]')
    await pick('55300')
    expect(form.goodsLocationCustomsOfficeCode).toBe('55300')
  })

  it('станция и адрес — в верхнем регистре; на одни цифры — предупреждение (номер вагона)', async () => {
    await mount()
    await w.get('[data-location-station]').setValue('ст.аксенгер')
    await w.get('[data-location-address]').setValue('ул. 1')
    expect(form.goodsLocationStation).toBe('СТ.АКСЕНГЕР')
    expect(form.goodsLocationAddress).toBe('УЛ. 1')
    expect(w.text()).not.toContain('Похоже на номер вагона')
    await w.get('[data-location-station]').setValue('52001234')
    expect(w.text()).toContain('Похоже на номер вагона или ТС')
  })

  it('«Товар на транспортном средстве» ставит код 52; при коде 52 — подсказка про гр. 18', async () => {
    await mount({ goodsLocationCode: '11' })
    const box = w.get('[data-on-transport]')
    expect(box.attributes('aria-checked')).toBe('false')
    await box.trigger('click')
    expect(form.goodsLocationCode).toBe('52')
    await nextTick()
    expect(w.text()).toContain('Номера вагонов и ТС берутся из гр. 18')
  })

  it('снятие флажка «на ТС» возвращает прежний код места, а не стирает его', async () => {
    await mount({ goodsLocationCode: '31' })
    const box = () => w.get('[data-on-transport]')
    await box().trigger('click')
    expect(form.goodsLocationCode).toBe('52')
    await box().trigger('click')
    expect(form.goodsLocationCode).toBe('31')
    expect(box().attributes('aria-checked')).toBe('false')
  })

  it('«на ТС»: прежний код места переживает уход из раздела (раздел смонтирован заново)', async () => {
    await mount({ goodsLocationCode: '31' })
    await w.get('[data-on-transport]').trigger('click')
    expect(form.goodsLocationCode).toBe('52')
    w.unmount()
    await mount()
    await w.get('[data-on-transport]').trigger('click')
    expect(form.goodsLocationCode).toBe('31')
  })

  it('«на ТС»: прежним считается код, стоявший перед последним включением; кода не было или ДТ пришла с 52 — снятие очищает', async () => {
    await mount({ goodsLocationCode: '31' })
    const box = () => w.get('[data-on-transport]')
    await box().trigger('click')
    // Пользователь выбрал другое место (флажок снялся сам) и включил «на ТС» снова — вернуться надо к нему.
    form.goodsLocationCode = '11'
    await nextTick()
    await box().trigger('click')
    expect(form.goodsLocationCode).toBe('52')
    await box().trigger('click')
    expect(form.goodsLocationCode).toBe('11')
    w.unmount()
    // ДТ открыта уже с кодом 52: прежнего кода нет — снятие очищает графу (как раньше).
    await mount({ goodsLocationCode: '52' })
    await w.get('[data-on-transport]').trigger('click')
    expect(form.goodsLocationCode).toBe('')
    w.unmount()
    // Кода не было вовсе: включили и сняли — снова пусто.
    await mount({ goodsLocationCode: '' })
    await w.get('[data-on-transport]').trigger('click')
    await w.get('[data-on-transport]').trigger('click')
    expect(form.goodsLocationCode).toBe('')
  })

  it('просмотр: поля недоступны', async () => {
    await mount({}, { readonly: true })
    for (const sel of ['[data-border-post]', '[data-location-code]', '[data-location-station]', '[data-location-address]']) {
      expect(inputOf(sel).attributes('disabled')).toBeDefined()
    }
    expect(w.get('[data-on-transport]').attributes('disabled')).toBeDefined()
  })

  it('открытие раздела форму не меняет', async () => {
    const before = JSON.stringify(form)
    await mount({}, {})
    expect(JSON.stringify(form)).toBe(before)
  })
})

describe('SectionCustoms — гр. 30: орган уровня ДГД (жалоба 15.10: «не находит ДГД поста»)', () => {
  const kedenPosts = [
    { value: '50717', label: '50717 — ТАМОЖЕННЫЙ ПОСТ «КУРЫК»', parentCode: '50700', parentName: 'ДГД ПО МАНГИСТАУСКОЙ ОБЛАСТИ' },
    { value: '55302', label: '55302 — ТАМОЖЕННЫЙ ПОСТ «АЛМАТЫ – ЦТО»', parentCode: '55300', parentName: 'ДГД ПО ГОРОДУ АЛМАТЫ' },
  ]
  const dgds = [{ code: '50700', name: 'ДГД ПО МАНГИСТАУСКОЙ ОБЛАСТИ' }, { code: '55300', name: 'ДГД ПО ГОРОДУ АЛМАТЫ' }]
  const sends = () => w.get('[data-office-sends]').text()

  it('ДГД можно выбрать напрямую: в списке ДГД и их посты, поиск по названию ДГД', async () => {
    await mount({ goodsLocationCode: '99' }, { postOptions: kedenPosts, dgds })
    await open('[data-location-office]')
    expect(optionTexts()).toEqual([
      'ДГД 50700 — ДГД ПО МАНГИСТАУСКОЙ ОБЛАСТИ', '50717 — ТАМОЖЕННЫЙ ПОСТ «КУРЫК»',
      'ДГД 55300 — ДГД ПО ГОРОДУ АЛМАТЫ', '55302 — ТАМОЖЕННЫЙ ПОСТ «АЛМАТЫ – ЦТО»',
    ])
    expect(document.body.querySelectorAll('[data-office-dgd]')).toHaveLength(2)
    await inputOf('[data-location-office]').setValue('мангист')
    await nextTick()
    expect(optionTexts()).toEqual(['ДГД 50700 — ДГД ПО МАНГИСТАУСКОЙ ОБЛАСТИ', '50717 — ТАМОЖЕННЫЙ ПОСТ «КУРЫК»'])
    await pick('50700 — ДГД')
    expect(form.goodsLocationCustomsOfficeCode).toBe('50700')
    expect(sends()).toBe('В КЕДЕН уйдёт: 50700 — ДГД ПО МАНГИСТАУСКОЙ ОБЛАСТИ')
  })

  it('выбран пост — под полем видно, какой ДГД уйдёт в КЕДЕН', async () => {
    await mount({ goodsLocationCode: '99', goodsLocationCustomsOfficeCode: '50717' }, { postOptions: kedenPosts, dgds })
    expect(sends()).toBe('В КЕДЕН уйдёт: 50700 — ДГД ПО МАНГИСТАУСКОЙ ОБЛАСТИ')
  })

  it('пусто — ДГД поста подачи (по справочнику, не по цифрам); склады органа не выгружают', async () => {
    await mount({ goodsLocationCode: '99', submissionCustomsOfficeCode: '55302' }, { postOptions: kedenPosts, dgds })
    expect(inputOf('[data-location-office]').attributes('placeholder')).toBe('ДГД поста подачи: 55300')
    expect(sends()).toBe('В КЕДЕН уйдёт: 55300 — ДГД ПО ГОРОДУ АЛМАТЫ — ДГД поста подачи')
    form.goodsLocationCode = '11'
    await nextTick()
    expect(sends()).toContain('Для СВХ и таможенного склада орган в КЕДЕН не уходит')
  })

  it('код органа в «Номер СВХ» при коде места не-склад: подсказка и перенос одним нажатием', async () => {
    await mount({ goodsLocationCode: '99' }, { postOptions: kedenPosts, dgds })
    expect(w.find('[data-number-move]').exists()).toBe(false)
    await typeNumber('50700')
    expect(w.text()).toContain('50700 похоже на код таможенного органа, а не на номер свидетельства')
    expect(w.text()).not.toContain('старый номер реестра')
    await w.get('[data-number-move]').trigger('click')
    await flushPromises()
    expect(form.goodsLocationCustomsOfficeCode).toBe('50700')
    // Код 99: после переноса номер — «иное место» D-Sector, а не пустота.
    expect(form.goodsLocationRegisterNumber).toBe('9900000000000000')
    expect((numberInput().element as HTMLInputElement).value).toBe('9900000000000000')
    expect(toast.info).toHaveBeenCalledWith('Код 50700 перенесён в «Таможенный орган (местонахождение)», номер — 9900000000000000')
    expect(w.find('[data-number-move]').exists()).toBe(false)
    expect(w.text()).not.toContain('похоже на код таможенного органа')
    expect(sends()).toBe('В КЕДЕН уйдёт: 50700 — ДГД ПО МАНГИСТАУСКОЙ ОБЛАСТИ')
  })

  it('перенос при коде не 99 (31) оставляет номер пустым', async () => {
    await mount({ goodsLocationCode: '31' }, { postOptions: kedenPosts, dgds })
    await typeNumber('50700')
    await w.get('[data-number-move]').trigger('click')
    await flushPromises()
    expect(form.goodsLocationCustomsOfficeCode).toBe('50700')
    expect(form.goodsLocationRegisterNumber).toBe('')
    expect((numberInput().element as HTMLInputElement).value).toBe('')
    expect(toast.info).toHaveBeenCalledWith('Код 50700 перенесён в «Таможенный орган (местонахождение)»')
  })

  it('при коде склада (11) пятизначный номер — прежняя подсказка «старый номер реестра», переноса нет', async () => {
    await mount({ goodsLocationCode: '11' }, { postOptions: kedenPosts, dgds })
    await typeNumber('50700')
    expect(w.text()).toContain('Похоже на старый номер реестра')
    expect(w.find('[data-number-move]').exists()).toBe(false)
  })

  it('просмотр: кнопки переноса нет', async () => {
    await mount({ goodsLocationCode: '99', goodsLocationRegisterNumber: '50700' }, { postOptions: kedenPosts, dgds, readonly: true })
    expect(w.text()).toContain('похоже на код таможенного органа')
    expect(w.find('[data-number-move]').exists()).toBe(false)
  })
})

describe('SectionCustoms — гр. 30, код 99: номер «иного места» (скриншот D-Sector 16.10)', () => {
  const OTHER = '9900000000000000'
  const HINT = 'Для иного места КЕДЕН/D-Sector используют номер 9900000000000000 «Иное место хранения товаров»'

  it('выбор кода 99 заполняет пустой номер 9900000000000000, подпись «Номер (НИКАД)» и подсказка', async () => {
    await mount()
    expect(w.text()).toContain('Номер СВХ или таможенного склада')
    expect(w.text()).not.toContain(HINT)
    form.goodsLocationCode = '99'
    await flushPromises()
    expect(form.goodsLocationRegisterNumber).toBe(OTHER)
    expect((numberInput().element as HTMLInputElement).value).toBe(OTHER)
    expect(w.text()).toContain('Номер (НИКАД)')
    expect(w.text()).not.toContain('Номер СВХ или таможенного склада')
    expect(w.text()).toContain(HINT)
  })

  it('ДТ открыта с кодом 99 и пустым номером — номер подставляется; введённый — не трогается', async () => {
    await mount({ goodsLocationCode: '99', goodsLocationRegisterNumber: '' })
    expect(form.goodsLocationRegisterNumber).toBe(OTHER)
    w.unmount()
    await mount({ goodsLocationCode: '99', goodsLocationRegisterNumber: 'KZ56VSX00000119' })
    expect(form.goodsLocationRegisterNumber).toBe('KZ56VSX00000119')
  })

  it('для 9900000000000000 нет подсказки «похоже на код органа» и проверки формата СВХ', async () => {
    await mount({ goodsLocationCode: '99' })
    expect(form.goodsLocationRegisterNumber).toBe(OTHER)
    expect(w.text()).not.toContain('похоже на код таможенного органа')
    expect(w.text()).not.toContain('старый номер реестра')
    expect(w.text()).not.toContain('KZ56VSX00000119')
    expect(w.find('[data-number-move]').exists()).toBe(false)
  })

  it('смена кода с 99 убирает номер по умолчанию, свой номер оставляет', async () => {
    await mount({ goodsLocationCode: '99' })
    expect(form.goodsLocationRegisterNumber).toBe(OTHER)
    form.goodsLocationCode = '11'
    await flushPromises()
    expect(form.goodsLocationRegisterNumber).toBe('')
    expect(w.text()).toContain('Номер СВХ или таможенного склада')
    expect(w.text()).not.toContain(HINT)
    form.goodsLocationCode = '99'
    await flushPromises()
    await typeNumber('ABC123')
    form.goodsLocationCode = '31'
    await flushPromises()
    expect(form.goodsLocationRegisterNumber).toBe('ABC123')
  })

  it('просмотр: номер не подставляется', async () => {
    await mount({ goodsLocationCode: '99', goodsLocationRegisterNumber: '' }, { readonly: true })
    expect(form.goodsLocationRegisterNumber).toBe('')
    expect(w.text()).toContain(HINT)
  })
})
