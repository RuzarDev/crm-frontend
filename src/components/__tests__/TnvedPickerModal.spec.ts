import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { TnvedNodeDto, TnvedPathNodeDto } from '@/types/api'

// Окно выбора кода ТН ВЭД (общее: товары ДТ, товары записи транзита, калькулятор продаж).
// Контракт: v-model:open, initialQuery; select({ code, name }) — только для 10-значного кода, после него окно закрывается.
const api = vi.hoisted(() => ({ children: vi.fn(), path: vi.fn(), search: vi.fn(), rates: vi.fn(), reference: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: api }))

import TnvedPickerModal from '../TnvedPickerModal.vue'

const node = (id: number, code: string, name: string, extra: Partial<TnvedNodeDto> = {}): TnvedNodeDto => ({
  id, code, name, treeName: name, parentId: 0, is10: false, isLast: false, unitShort: null, nodeLevel: 0, ...extra,
})
const leaf = node(1000, '8471300000', 'Ноутбуки и планшеты', { is10: true, isLast: true, unitShort: 'шт' })
const leaf2 = node(1001, '8471410000', 'Прочие вычислительные машины', { is10: true, isLast: true })
const group = node(100, '8471', 'Машины вычислительные')
const tree: Record<number, TnvedNodeDto[]> = {
  0: [node(1, 'XVI', 'Машины и оборудование')],
  1: [node(10, '84', 'Реакторы ядерные, котлы')],
  10: [group],
  100: [leaf, leaf2],
}
const pathOf: Record<string, TnvedPathNodeDto[]> = {
  '8471300000': [1, 10, 100, 1000].map((id) => ({ id, code: '', treeName: '', nodeLevel: 0 })),
  '8471': [1, 10, 100].map((id) => ({ id, code: '', treeName: '', nodeLevel: 0 })),
}
const ok = <T,>(data: T) => Promise.resolve({ data })
const later = <T,>() => {
  let resolve!: (v: { data: T }) => void
  const promise = new Promise<{ data: T }>((res) => { resolve = res })
  return { promise, resolve: (data: T) => resolve({ data }) }
}
const rate = (code: string, rateStr: string) => ({ code, treeName: null, rateStr, rateSourceName: null, rateSourceUrl: null, vtoStatus: null, unitCode: null, unitName: null, updatedAtUtc: null })
const httpError = (status: number) => Object.assign(new Error(String(status)), { response: { status } })

let w: VueWrapper
beforeEach(() => {
  api.children.mockReset().mockImplementation((id: number) => ok(tree[id] ?? []))
  api.path.mockReset().mockImplementation((code: string) => ok(pathOf[code] ?? []))
  api.search.mockReset().mockImplementation(() => ok([group, leaf]))
  api.rates.mockReset().mockImplementation((code: string) => ok({ code, treeName: null, rateStr: '5%', rateSourceName: null, rateSourceUrl: null, vtoStatus: '0%', unitCode: null, unitName: null, updatedAtUtc: null }))
  api.reference.mockReset().mockImplementation(() => ok({ nonTariffMeasures: [{ docType: 'RESTRICTION', name: 'Сертификат соответствия' }] }))
})
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

const mountPicker = (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(TnvedPickerModal, {
    props: { open: false, ...props, 'onUpdate:open': (v: boolean) => w.setProps({ open: v }) },
    attachTo: document.body,
  })
  return w
}
const open = async (extra: Record<string, unknown> = {}) => {
  await w.setProps({ open: true, ...extra })
  await flushPromises()
  await flushPromises()
}
const body = () => document.body
const dialog = () => body().querySelector('[role="dialog"]') as HTMLElement | null
const q = (sel: string) => body().querySelector(sel) as HTMLElement | null
const all = (sel: string) => [...body().querySelectorAll(sel)] as HTMLElement[]
const chooseBtn = () => all('button').find((b) => b.textContent?.includes('Выбрать этот код')) as HTMLButtonElement
const click = async (el: HTMLElement | null) => {
  el!.click()
  await flushPromises()
  await flushPromises()
}

describe('TnvedPickerModal', () => {
  it('закрыто — ничего не грузит; открыли — заголовок и корень дерева', async () => {
    mountPicker()
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(api.children).not.toHaveBeenCalled()
    await open()
    expect(dialog()?.textContent).toContain('Справочник ТН ВЭД — выбор кода')
    expect(api.children).toHaveBeenCalledWith(0, { silent: true })
    expect(q('[data-z-tree-id="1"]')?.textContent).toContain('Машины и оборудование')
    expect(q('[data-picker-detail-empty]')?.textContent).toContain('Выберите товар')
  })

  it('initialQuery (не полный код) — поиск при открытии; результат открывается на своём месте в дереве', async () => {
    mountPicker({ initialQuery: ' 847130 ' })
    await open()
    expect(api.search).toHaveBeenCalledWith('847130', false, 40, { silent: true })
    expect((q('input[type="search"]') as HTMLInputElement).value).toBe('847130')
    const results = all('[data-picker-result]')
    expect(results.map((r) => r.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['8471 Машины вычислительные', '8471 30 000 0 Ноутбуки и планшеты'])
    await click(results[1])
    expect(api.path).toHaveBeenCalledWith('8471300000')
    expect(q('[data-z-tree-id="1000"]')?.getAttribute('aria-selected')).toBe('true')
    expect(q('[data-picker-detail]')?.textContent).toContain('8471 30 000 0')
    expect(api.rates).toHaveBeenCalledWith('8471300000', { silent: true })
    expect(api.reference).toHaveBeenCalledWith('8471300000', { silent: true })
  })

  it('10-значный код в запросе — сразу раскрыт в дереве; «Выбрать этот код» — select({ code, name }) и закрытие', async () => {
    mountPicker({ initialQuery: '8471 30 000 0' })
    await open()
    expect(api.search).not.toHaveBeenCalled()
    expect(q('[data-z-tree-id="1000"]')?.getAttribute('aria-selected')).toBe('true')
    const detail = q('[data-picker-detail]')!.textContent!
    expect(detail).toContain('Ноутбуки и планшеты')
    expect(detail).toContain('5%')
    expect(detail).toContain('ВТО: 0%')
    expect(detail).toContain('RESTRICTION: Сертификат соответствия')
    expect(chooseBtn().disabled).toBe(false)
    await click(chooseBtn())
    expect(w.emitted('select')).toEqual([[{ code: '8471300000', name: 'Ноутбуки и планшеты' }]])
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('группа (не 10 знаков) — подсказка раскрыть, выбрать нельзя, ставки не грузятся', async () => {
    mountPicker()
    await open()
    await click(q('[data-z-tree-id="1"]'))
    expect(q('[data-picker-detail]')?.textContent).toContain('Это группа')
    expect(chooseBtn().disabled).toBe(true)
    chooseBtn().click()
    expect(w.emitted('select')).toBeUndefined()
    expect(api.rates).not.toHaveBeenCalled()
  })

  it('повторное открытие — сброс поиска и выбора', async () => {
    mountPicker({ initialQuery: '8471' })
    await open()
    await click(all('[data-picker-result]')[1])
    await w.setProps({ open: false })
    await open({ initialQuery: '' })
    expect((q('input[type="search"]') as HTMLInputElement).value).toBe('')
    expect(all('[data-picker-result]')).toHaveLength(0)
    expect(q('[data-picker-detail-empty]')).not.toBeNull()
    expect(q('[aria-selected="true"]')).toBeNull()
  })

  it('ставок нет (404) — «Ставки не найдены»; сбой — «Не удалось загрузить» и «Повторить»', async () => {
    api.rates.mockImplementationOnce(() => Promise.reject(httpError(404)))
    mountPicker({ initialQuery: '8471300000' })
    await open()
    expect(q('[data-picker-detail]')?.textContent).toContain('Ставки не найдены')
    api.rates.mockImplementationOnce(() => Promise.reject(httpError(500)))
    api.reference.mockImplementationOnce(() => Promise.reject(httpError(500)))
    await w.setProps({ open: false })
    await open({ initialQuery: '8471300000' })
    expect(q('[data-picker-detail]')?.textContent).toContain('Не удалось загрузить')
    await click(q('[data-picker-retry]'))
    expect(q('[data-picker-detail]')?.textContent).toContain('5%')
  })

  it('поиск упёрся в лимит (429) — своё сообщение; пусто — «Ничего не найдено»', async () => {
    api.search.mockImplementationOnce(() => Promise.reject(httpError(429)))
    mountPicker({ initialQuery: 'ноутбук' })
    await open()
    expect(q('[data-picker-results]')?.textContent).toContain('Слишком много запросов')
    api.search.mockImplementationOnce(() => ok([]))
    await w.setProps({ open: false })
    await open({ initialQuery: 'ничего' })
    expect(q('[data-picker-results]')?.textContent).toContain('Ничего не найдено')
  })

  describe('(баг) защита от устаревших ответов', () => {
    it('поиск: поздний ответ прежнего запроса не подменяет выдачу нового', async () => {
      const first = later<TnvedNodeDto[]>()
      api.search.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => ok([leaf2]))
      mountPicker({ initialQuery: 'ноутбук' })
      await open()
      const input = q('input[type="search"]') as HTMLInputElement
      input.value = 'машины'
      input.dispatchEvent(new Event('input'))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      await flushPromises()
      first.resolve([group])
      await flushPromises()
      const texts = all('[data-picker-result]').map((r) => r.textContent?.replace(/\s+/g, ' ').trim())
      expect(texts).toEqual(['8471 41 000 0 Прочие вычислительные машины'])
    })

    it('выбор: ставки прежнего кода, пришедшие позже, не попадают под новый код', async () => {
      const a = later<ReturnType<typeof rate>>()
      api.rates.mockImplementation((code: string) => (code === '8471300000' ? a.promise : ok(rate(code, '10%'))))
      mountPicker({ initialQuery: '8471300000' })
      await open()
      await click(q('[data-z-tree-id="1001"]'))
      a.resolve(rate('8471300000', '5%'))
      await flushPromises()
      const detail = q('[data-picker-detail]')!.textContent!
      expect(detail).toContain('8471 41 000 0')
      expect(detail).toContain('10%')
      expect(detail).not.toContain('5%')
    })
  })

  it('(баг) смонтировали сразу открытым (GoodsCard: v-if и open в одном такте) — дерево и начальный поиск', async () => {
    mountPicker({ open: true, initialQuery: '8471' })
    await flushPromises()
    await flushPromises()
    expect(api.children).toHaveBeenCalledWith(0, { silent: true })
    expect(api.search).toHaveBeenCalledWith('8471', false, 40, { silent: true })
    expect(all('[data-picker-result]')).toHaveLength(2)
  })
})
