import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { confirmState } from '@/ui/confirm'
import type { Import40GoodsCharacteristic, Import40GoodsItemInput } from '@/types/api'
import { resetOkeiUnits } from '../editor/okei'
import { charsModeKey, readCharsMode, writeCharsMode } from '../editor/charsMode'
import type { GoodsEditorContext } from '../editor/types'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))
vi.mock('@/api/references', () => ({
  referencesApi: {
    listOkeiUnits: vi.fn(async () => [
      { id: '1', code: '796', name: 'Штука', shortName: 'ШТ', isActive: true },
      { id: '2', code: '166', name: 'Килограмм', shortName: 'КГ', isActive: true },
      { id: '3', code: '112', name: 'Литр', shortName: 'Л', isActive: true },
    ]),
  },
}))

import GoodsCharacteristicsTable from '../editor/GoodsCharacteristicsTable.vue'

const ctx: GoodsEditorContext = {
  usdRate: null, onDate: null, currencyOptions: [], direction: 'ИМ', declProcedure: '40', containerIndicator: false, currency: 'USD', countryOptions: [],
}
const goods = (rows: Import40GoodsCharacteristic[], o: Partial<Import40GoodsItemInput> = {}): Import40GoodsItemInput => reactive({
  description: 'ПАРТА', tnvedCode: '9403301100', tnvedDescription: null, quantity: 300, unitCode: '796', unit: 'шт', customsValue: 900, currency: 'USD',
  cargoPlacesQuantity: null, packagesCount: null, payments: [], markings: [], extras: null, characteristics: rows, ...o,
} as Import40GoodsItemInput)
const many = (n: number): Import40GoodsCharacteristic[] =>
  Array.from({ length: n }, (_, i) => ({ name: `ТОВАР ${i + 1}`, quantity: i + 1, unitCode: '796', invoiceValue: 10, productModelName: `M${i + 1}` }))

let w: VueWrapper
let item: Import40GoodsItemInput
const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await flushPromises()
    await nextTick()
  }
}
const mount = async (g: Import40GoodsItemInput, o: { readonly?: boolean } = {}) => {
  item = g
  w = mountWithI18n(GoodsCharacteristicsTable, {
    props: { item, index: 0, model: {} as never, readonly: !!o.readonly, ctx },
    attachTo: document.body,
  })
  await settle()
}
const q = <T extends Element = HTMLElement>(sel: string) => document.body.querySelector<T>(sel)
const cell = (i: number, f: string) => q<HTMLInputElement>(`input[data-f="char-${i}-${f}"]`)!
const typeIn = async (el: HTMLInputElement, value: string) => {
  el.focus()
  await settle()
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}
const key = async (o: KeyboardEventInit, target: Element = document.activeElement!) => {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }))
  await settle()
}
const focused = () => {
  const el = document.activeElement as HTMLElement | null
  return el?.dataset.row == null ? null : `${el.dataset.row}:${el.dataset.col}`
}
const click = async (sel: string) => {
  q<HTMLElement>(sel)!.click()
  await settle()
}
const nb = (s: string | null | undefined) => (s ?? '').replace(/[  ]/g, ' ')

beforeEach(() => {
  resetOkeiUnits()
  localStorage.clear()
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('строки гр. 31: вид «Таблица» / «Карточки»', () => {
  it('на компьютере по умолчанию — таблица; выбор «Карточки» помнится у пользователя (localStorage по id)', async () => {
    localStorage.setItem('userId', 'u-1')
    await mount(goods([{ name: 'А' }]))
    expect(q('[data-chars-grid]')).not.toBeNull()
    expect(q('[data-chars-grid]')!.getAttribute('role')).toBe('grid')
    const cards = [...document.querySelectorAll<HTMLElement>('[data-chars-mode] button')].find((b) => b.textContent?.includes('Карточки'))!
    cards.click()
    await settle()
    expect(q('[data-chars-grid]')).toBeNull()
    expect(q('[data-char-summary]')).not.toBeNull()
    expect(localStorage.getItem('zircon.dt.charsMode:u-1')).toBe('cards')
    expect(charsModeKey()).toBe('zircon.dt.charsMode:u-1')
    // Другой пользователь — своё (по умолчанию таблица).
    localStorage.setItem('userId', 'u-2')
    expect(readCharsMode()).toBe('table')
  })

  it('телефон (< 640px) — всегда карточки, переключателя нет; хранилище недоступно — таблица без ошибок', async () => {
    writeCharsMode('table')
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: !q.includes('min-width: 640px'), addEventListener() {}, removeEventListener() {} }))
    await mount(goods([{ name: 'А' }]))
    expect(q('[data-chars-grid]')).toBeNull()
    expect(q('[data-chars-mode]')).toBeNull()
    expect(q('[data-char-summary]')).not.toBeNull()
    w.unmount()
    vi.unstubAllGlobals()
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    vi.stubGlobal('localStorage', broken)
    expect(readCharsMode()).toBe('table')
    expect(() => writeCharsMode('cards')).not.toThrow()
  })
})

describe('строки гр. 31: таблица — правка в ячейках', () => {
  it('ввод в ячейки пишет в строку товара: ЗАГЛАВНЫЕ, число с пробелом и запятой, единица текстом; ошибка — рамка, значение не меняется', async () => {
    await mount(goods([{ name: 'ПАРТА' }, {}]))
    const row = () => item.characteristics![1]
    await typeIn(cell(1, 'name'), 'стул')
    expect(row().name).toBe('СТУЛ')
    expect(cell(1, 'name').value).toBe('СТУЛ')

    await typeIn(cell(1, 'quantity'), '1 234,5')
    expect(row().quantity).toBe(1234.5)
    await typeIn(cell(1, 'quantity'), '12x')
    expect(row().quantity).toBe(1234.5)
    expect(cell(1, 'quantity').getAttribute('aria-invalid')).toBe('true')
    cell(1, 'quantity').blur()
    await settle()
    // Ушли из ячейки — формат по языку, рамки нет.
    expect(nb(cell(1, 'quantity').value)).toBe('1 234,5')
    expect(cell(1, 'quantity').hasAttribute('aria-invalid')).toBe(false)

    await typeIn(cell(1, 'unit'), 'кг')
    expect(row().unitCode).toBe('166')
    await typeIn(cell(1, 'unit'), 'ящик')
    expect(row().unitCode).toBe('166')
    expect(cell(1, 'unit').getAttribute('aria-invalid')).toBe('true')
    await typeIn(cell(1, 'unit'), '796')
    expect(row().unitCode).toBe('796')
    cell(1, 'unit').blur()
    await settle()
    expect(cell(1, 'unit').value).toBe('ШТ')
    expect(cell(1, 'unit').getAttribute('list')).toMatch(/-okei$/)
    expect(document.querySelectorAll('datalist option')).toHaveLength(3)

    await typeIn(cell(1, 'value'), '1,234.50')
    expect(row().invoiceValue).toBe(1234.5)
    await typeIn(cell(1, 'value'), '')
    expect(row().invoiceValue).toBeNull()
    for (const f of ['manufacturer', 'tradeMark', 'mark', 'model', 'article', 'standard', 'sort', 'serials']) await typeIn(cell(1, f), `x-${f}`)
    expect(row()).toMatchObject({
      manufacturerName: 'X-MANUFACTURER', tradeMarkName: 'X-TRADEMARK', productMarkName: 'X-MARK', productModelName: 'X-MODEL',
      productArticle: 'X-ARTICLE', standardName: 'X-STANDARD', productSortName: 'X-SORT', serialNumbers: 'X-SERIALS',
    })
    // Пустая строка ячейки — null (сервер не получит пустую строку).
    await typeIn(cell(1, 'model'), '  ')
    expect(row().productModelName).toBeNull()
    expect(cell(1, 'article').maxLength).toBe(50)
    expect(cell(1, 'standard').maxLength).toBe(40)
  })

  it('колонки и доступность: роли grid/row/columnheader/gridcell, подписи ячеек, № и наименование закреплены', async () => {
    await mount(goods([{ name: 'А' }, { name: 'Б' }]))
    const heads = [...document.querySelectorAll('[data-chars-grid-head] [role="columnheader"]')].map((h) => h.textContent!.trim())
    expect(heads).toEqual(['№', 'Наименование', 'Кол-во', 'Ед.', 'Стоимость', 'Производитель', 'Тов. знак', 'Марка', 'Модель', 'Артикул', 'Стандарт', 'Сорт', 'Серийные №', 'Действия со строкой'])
    const grid = q('[data-chars-grid]')!
    expect(grid.getAttribute('aria-rowcount')).toBe('3')
    expect(grid.querySelectorAll('[role="row"]')).toHaveLength(3)
    expect(cell(1, 'quantity').getAttribute('aria-label')).toBe('Кол-во, строка 2')
    expect(cell(0, 'name').closest('[role="gridcell"]')!.className).toContain('sticky')
    expect(grid.querySelector('[data-char-row="0"] [role="rowheader"]')!.className).toContain('sticky')
  })

  it('единственная строка без количества и стоимости — подсказки гр. 41 / гр. 42 в пустых ячейках', async () => {
    await mount(goods([{ tradeMarkName: 'SUNO' }], { quantity: 5443, unitCode: '112', customsValue: 4233.6 }))
    expect(nb(cell(0, 'quantity').placeholder)).toBe('гр. 41: 5 443')
    expect(cell(0, 'unit').placeholder).toBe('Л')
    expect(nb(cell(0, 'value').placeholder)).toBe('гр. 42: 4 233,6')
    expect(item.characteristics![0].quantity ?? null).toBeNull()
  })
})

describe('строки гр. 31: таблица — клавиши', () => {
  it('Tab / Shift+Tab — по ячейкам с переходом на соседнюю строку; Enter / Shift+Enter и ↑/↓ — по колонке', async () => {
    await mount(goods([{ name: 'А' }, { name: 'Б' }, { name: 'В' }]))
    cell(0, 'name').focus()
    await settle()
    await key({ key: 'Tab' })
    expect(focused()).toBe('0:quantity')
    await key({ key: 'Tab' })
    expect(focused()).toBe('0:unit')
    await key({ key: 'Tab', shiftKey: true })
    expect(focused()).toBe('0:quantity')
    // Последняя ячейка строки (кнопка «Удалить») → первая ячейка следующей.
    q<HTMLElement>('[data-char-remove="0"]')!.focus()
    await key({ key: 'Tab' })
    expect(focused()).toBe('1:name')
    await key({ key: 'Tab', shiftKey: true })
    expect(focused()).toBe('0:remove')

    cell(0, 'model').focus()
    await settle()
    await key({ key: 'Enter' })
    expect(focused()).toBe('1:model')
    await key({ key: 'ArrowDown' })
    expect(focused()).toBe('2:model')
    await key({ key: 'Enter', shiftKey: true })
    expect(focused()).toBe('1:model')
    await key({ key: 'ArrowUp' })
    expect(focused()).toBe('0:model')
    // В ячейке единицы стрелки — списку единиц.
    cell(0, 'unit').focus()
    await settle()
    await key({ key: 'ArrowDown' })
    expect(focused()).toBe('0:unit')
  })

  it('Enter на последней строке — новая строка, фокус в той же колонке; Ctrl/⌘+↑/↓ и кнопки ↑/↓ переставляют строку', async () => {
    await mount(goods([{ name: 'А' }, { name: 'Б' }]))
    cell(1, 'quantity').focus()
    await settle()
    await key({ key: 'Enter' })
    expect(item.characteristics).toHaveLength(3)
    expect(focused()).toBe('2:quantity')

    cell(0, 'name').focus()
    await settle()
    await key({ key: 'ArrowDown', ctrlKey: true })
    expect(item.characteristics!.map((r) => r.name ?? null)).toEqual(['Б', 'А', null])
    expect(focused()).toBe('1:name')
    await key({ key: 'ArrowUp', metaKey: true })
    expect(item.characteristics!.map((r) => r.name ?? null)).toEqual(['А', 'Б', null])
    expect(focused()).toBe('0:name')
    // Кнопки над таблицей двигают строку, где курсор.
    expect(q<HTMLButtonElement>('[data-chars-move-up]')!.disabled).toBe(true)
    await click('[data-chars-move-down]')
    expect(item.characteristics!.map((r) => r.name ?? null)).toEqual(['Б', 'А', null])
    expect(focused()).toBe('1:name')
    // Ctrl+Enter — не наш (следующий товар редактора).
    const e = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })
    cell(1, 'name').dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })
})

describe('строки гр. 31: таблица — строки', () => {
  it('копировать строку (копия ниже, фокус в ней), удалить строку, «Добавить строку», «Удалить все» с вопросом', async () => {
    await mount(goods([{ name: 'ДУХОВКА', productModelName: 'M1', quantity: 5, unitCode: '796' }]))
    await click('[data-char-copy="0"]')
    expect(item.characteristics).toHaveLength(2)
    expect(item.characteristics![1]).toMatchObject({ name: 'ДУХОВКА', productModelName: 'M1', quantity: 5 })
    expect(item.characteristics![1]).not.toBe(item.characteristics![0])
    expect(focused()).toBe('1:name')
    await typeIn(cell(1, 'model'), 'm2')
    expect(item.characteristics!.map((r) => r.productModelName)).toEqual(['M1', 'M2'])

    await click('[data-chars-add]')
    expect(item.characteristics).toHaveLength(3)
    expect(focused()).toBe('2:name')
    await click('[data-char-remove="0"]')
    expect(item.characteristics!.map((r) => r.productModelName ?? null)).toEqual(['M2', null])

    const pending = click('[data-chars-remove-all]')
    await settle()
    expect(confirmState.open).toBe(true)
    expect(confirmState.content).toContain('2')
    confirmState.resolve(false)
    await pending
    expect(item.characteristics).toHaveLength(2)
    const again = click('[data-chars-remove-all]')
    await settle()
    confirmState.resolve(true)
    await again
    await settle()
    expect(item.characteristics).toHaveLength(0)
    expect(q('[data-chars-empty]')).not.toBeNull()
    // Строк нет — «Добавить строку» создаёт первую и ставит в неё фокус.
    await click('[data-chars-add]')
    expect(item.characteristics).toHaveLength(1)
    expect(focused()).toBe('0:name')
  })

  it('предел 500 строк: «Добавить» и копирование недоступны, Enter на последней строке не добавляет, сказано почему', async () => {
    await mount(goods(many(500)))
    expect(q<HTMLButtonElement>('[data-chars-add]')!.disabled).toBe(true)
    expect(q('[data-chars-cap]')!.textContent).toContain('500')
    expect(q<HTMLButtonElement>('[data-char-copy="0"]')!.disabled).toBe(true)
    // К последней строке — Ctrl+End нет; ведём фокус Enter-ами через окно прокрутки: проверим край.
    await click('[data-char-remove="0"]')
    expect(item.characteristics).toHaveLength(499)
    expect(q<HTMLButtonElement>('[data-chars-add]')!.disabled).toBe(false)
    await click('[data-chars-add]')
    expect(item.characteristics).toHaveLength(500)
    expect(focused()).toBe('499:name')
    await key({ key: 'Enter' })
    expect(item.characteristics).toHaveLength(500)
  })

  it('просмотр: ячейки только для чтения, кнопок и колонки действий нет', async () => {
    await mount(goods([{ name: 'А' }, { name: 'Б' }]), { readonly: true })
    expect(cell(0, 'name').readOnly).toBe(true)
    expect(q('[data-chars-toolbar]')).toBeNull()
    expect(q('[data-char-remove="0"]')).toBeNull()
    expect(q('datalist')).toBeNull()
    cell(0, 'name').focus()
    await settle()
    await key({ key: 'Enter' })
    expect(focused()).toBe('1:name')
    await key({ key: 'Enter' })
    expect(item.characteristics).toHaveLength(2)
  })
})

describe('строки гр. 31: итоги', () => {
  it('количество по единицам и стоимость против гр. 41 / гр. 42; расхождение — предупреждение (не блок)', async () => {
    await mount(goods([
      { quantity: 100, unitCode: '796', invoiceValue: 300 },
      { quantity: 150, unitCode: '796', invoiceValue: 600 },
      { quantity: 2.5, unitCode: '166' },
    ]))
    expect(q('[data-chars-sum-rows]')!.textContent).toBe('Строк: 3')
    expect(nb(q('[data-chars-sum-qty]')!.textContent)).toBe('Количество: 250 ШТ · 2,5 КГ (гр. 41: 300 ШТ)')
    expect(nb(q('[data-chars-sum-value]')!.textContent)).toBe('Стоимость: 900 USD (гр. 42: 900)')
    expect(q('[data-chars-qty-warning]')!.textContent).toContain('250')
    expect(q('[data-chars-value-warning]')).toBeNull()
    await typeIn(cell(1, 'quantity'), '200')
    expect(q('[data-chars-qty-warning]')).toBeNull()
    await typeIn(cell(2, 'value'), '50')
    expect(q('[data-chars-value-warning]')!.textContent).toContain('950')
  })
})

describe('строки гр. 31: «Заполнить через текст / из Excel»', () => {
  const openPaste = async () => {
    await click('[data-chars-paste]')
    expect(q('[data-chars-paste-modal]')).not.toBeNull()
  }
  const paste = async (text: string) => {
    const ta = q<HTMLTextAreaElement>('[data-chars-paste-text]')!
    ta.value = text
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
  }

  it('Excel: просмотр, нераспознанные ячейки выделены; «Добавить к строкам» — после имеющихся (пустая строка нового товара уходит)', async () => {
    await mount(goods([{}]))
    await openPaste()
    await paste('парта\t10\tшт\t250,5\nстул\t2\tящик\tabc\n')
    expect(q('[data-chars-paste-delimiter]')!.textContent).toContain('табуляция')
    expect(q('[data-chars-paste-summary]')!.textContent).toContain('Строк к загрузке: 2')
    expect(q('[data-chars-paste-summary]')!.textContent).toContain('не распознано ячеек: 2')
    expect([...document.querySelectorAll('[data-chars-paste-row="1"] [data-chars-paste-bad]')].map((e) => e.getAttribute('data-chars-paste-bad'))).toEqual(['unit', 'value'])
    expect(q('[data-chars-paste-issues]')!.textContent).toContain('«ящик» — нет такой единицы ОКЕИ')
    await click('[data-chars-paste-append]')
    expect(item.characteristics).toEqual([
      expect.objectContaining({ name: 'ПАРТА', quantity: 10, unitCode: '796', invoiceValue: 250.5 }),
      expect.objectContaining({ name: 'СТУЛ', quantity: 2, unitCode: null, invoiceValue: null }),
    ])
    expect(toast.success).toHaveBeenCalledWith('Добавлено строк: 2')
  })

  it('«;» и свой порядок колонок; «Заменить строки» — вместо имеющихся', async () => {
    await mount(goods([{ name: 'СТАРАЯ' }]))
    await openPaste()
    await paste('M1;5;кг\nM2;7;КГ')
    expect(q('[data-chars-paste-delimiter]')!.textContent).toContain('«;»')
    // Колонка 1 — модель (по умолчанию была наименованием).
    const select = q<HTMLInputElement>('[data-chars-paste-map="0"]') ?? q<HTMLElement>('[data-chars-paste-col="0"] [role="combobox"]')!
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await settle()
    const opt = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.trim() === 'Модель')!
    opt.click()
    await settle()
    await click('[data-chars-paste-replace]')
    expect(item.characteristics).toEqual([
      expect.objectContaining({ name: null, productModelName: 'M1', quantity: 5, unitCode: '166' }),
      expect.objectContaining({ name: null, productModelName: 'M2', quantity: 7, unitCode: '166' }),
    ])
  })

  it('предел 500: добавить нельзя, если вместе больше; заменить нельзя, если в тексте больше — с объяснением', async () => {
    await mount(goods(many(499)))
    await openPaste()
    await paste('А\nБ')
    expect(q('[data-chars-paste-cap]')!.textContent).toContain('можно ещё 1')
    expect(q<HTMLButtonElement>('[data-chars-paste-append]')!.disabled).toBe(true)
    expect(q<HTMLButtonElement>('[data-chars-paste-replace]')!.disabled).toBe(false)
    await paste(Array.from({ length: 501 }, (_, i) => `Т${i}`).join('\n'))
    expect(q('[data-chars-paste-cap]')!.textContent).toContain('В тексте строк: 501')
    expect(q<HTMLButtonElement>('[data-chars-paste-replace]')!.disabled).toBe(true)
    expect(item.characteristics).toHaveLength(499)
  })
})

describe('строки гр. 31: 500 строк', () => {
  // Как замеры «200 товаров»: время — в логе; граница — защита от катастрофы (jsdom под параллельным прогоном
  // `npm test` медленнее в разы).
  const CATASTROPHIC_MS = 3000

  it('таблица 500 строк: рисуется окно строк, правка ячейки и переход Enter до конца — время в логе', async () => {
    const t0 = performance.now()
    await mount(goods(many(500)))
    const mountMs = performance.now() - t0
    const rendered = document.querySelectorAll('[data-chars-grid] [data-char-row]').length
    expect(rendered).toBeGreaterThan(10)
    expect(rendered).toBeLessThan(60)
    expect(q('[data-chars-grid]')!.getAttribute('aria-rowcount')).toBe('501')

    const t1 = performance.now()
    for (let i = 0; i < 20; i++) await typeIn(cell(0, 'model'), `M-${i}`)
    const editMs = (performance.now() - t1) / 20
    expect(item.characteristics![0].productModelName).toBe('M-19')

    // Переход вниз за окно: строка дорисовывается, фокус в ней.
    cell(0, 'quantity').focus()
    await settle()
    const t2 = performance.now()
    for (let i = 0; i < 40; i++) await key({ key: 'Enter' })
    const stepMs = (performance.now() - t2) / 40
    expect(focused()).toBe('40:quantity')
    expect(document.querySelectorAll('[data-chars-grid] [data-char-row]').length).toBeLessThan(60)

    console.info(`[perf 500 chars, jsdom] mount ${mountMs.toFixed(0)} ms, rows in DOM ${rendered}, edit ${editMs.toFixed(1)} ms, Enter ${stepMs.toFixed(1)} ms`)
    expect(mountMs).toBeLessThan(CATASTROPHIC_MS)
    expect(editMs).toBeLessThan(CATASTROPHIC_MS / 3)
  }, 60_000)
})
