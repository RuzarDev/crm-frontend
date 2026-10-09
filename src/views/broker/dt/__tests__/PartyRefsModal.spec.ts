import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import PartyRefsModal from '../sections/PartyRefsModal.vue'

const refs = vi.hoisted(() => ({ search: vi.fn(), upsert: vi.fn() }))
const lookup = vi.hoisted(() => ({ byBin: vi.fn() }))
vi.mock('@/api/partyRefs', () => ({ partyRefsApi: refs }))
vi.mock('@/api/companyLookup', async (orig) => ({ ...(await orig<typeof import('@/api/companyLookup')>()), companyLookupApi: lookup }))
vi.mock('@/ui/message', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

const row = (id: string, name: string, bin: string | null = null) => ({
  id, name, shortName: null, bin, countryCode: '156', city: 'SHENZHEN', region: null, street: null, house: null, apt: null, categoryCode: null, katoCode: null,
})
let w: VueWrapper
afterEach(() => { w?.unmount(); document.body.innerHTML = ''; vi.clearAllMocks(); vi.useRealTimers() })
beforeEach(() => { refs.search.mockResolvedValue([]) })

const mount = (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(PartyRefsModal, { props: { open: true, target: 'receiver', initialQuery: 'SHEN', ...props }, attachTo: document.body })
}
const search = () => document.body.querySelector('[data-party-refs-search]') as HTMLInputElement
const type = (text: string) => {
  search().value = text
  search().dispatchEvent(new Event('input', { bubbles: true }))
}
const names = () => [...document.body.querySelectorAll('[data-party-ref] > span:first-child')].map((e) => e.textContent)

describe('PartyRefsModal', () => {
  it('открытие — сразу поиск по наименованию стороны; выбор строки — pick', async () => {
    refs.search.mockResolvedValue([row('1', 'SHENZHEN BRIGHT', '123456789012')])
    mount()
    await flushPromises()
    expect(refs.search).toHaveBeenCalledWith('SHEN')
    expect(document.body.textContent).toContain('Справочник получателей')
    expect(document.body.textContent).toContain('123456789012')
    ;(document.body.querySelector('[data-party-ref]') as HTMLElement).click()
    expect(w.emitted('pick')?.[0]?.[0]).toMatchObject({ id: '1' })
  })

  it('ввод — поиск после паузы, а не на каждое нажатие', async () => {
    mount()
    await flushPromises()
    vi.useFakeTimers()
    refs.search.mockClear()
    type('S'); type('SH'); type('SHE')
    await vi.advanceTimersByTimeAsync(100)
    expect(refs.search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(refs.search).toHaveBeenCalledTimes(1)
    expect(refs.search).toHaveBeenCalledWith('SHE')
  })

  it('ответ устаревшего поиска не перезаписывает свежий', async () => {
    mount()
    await flushPromises()
    vi.useFakeTimers()
    let slow!: (v: unknown) => void
    refs.search.mockImplementationOnce(() => new Promise((r) => { slow = r }))
    refs.search.mockResolvedValueOnce([row('2', 'NEW CO')])
    type('OLD')
    await vi.advanceTimersByTimeAsync(400)
    type('NEW')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(names()).toEqual(['NEW CO'])
    slow([row('1', 'OLD CO')])
    await flushPromises()
    expect(names()).toEqual(['NEW CO'])
  })

  it('пусто и 12 цифр — подсказка и «Найти в ГБД ЮЛ» (found с карточкой)', async () => {
    lookup.byBin.mockResolvedValue({ bin: '201140012345', nameRu: 'ТОО X', kind: 'ul', isActive: true })
    mount({ initialQuery: '201140012345' })
    await flushPromises()
    expect(document.body.querySelector('[data-party-refs-empty]')?.textContent).toContain('Ничего не найдено')
    ;(document.body.querySelector('[data-party-refs-registry]') as HTMLElement).click()
    await flushPromises()
    expect(w.emitted('found')?.[0]?.[0]).toMatchObject({ bin: '201140012345' })
  })
})
