import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { NationalMeasure } from '@/api/nationalLists'

const api = vi.hoisted(() => ({ measures: vi.fn(), create: vi.fn(), update: vi.fn(), extend: vi.fn(), remove: vi.fn(), restore: vi.fn() }))
const perms = vi.hoisted(() => ({ manage: true }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const confirmFn = vi.hoisted(() => vi.fn())
vi.mock('@/api/nationalLists', async (orig) => ({ ...(await orig<typeof import('@/api/nationalLists')>()), nationalListsApi: api }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: (p: string) => p === 'tnved.manage' && perms.manage }) }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/ui/confirm', () => ({ useConfirm: () => ({ confirm: confirmFn }) }))

import NationalMeasuresTab from '../NationalMeasuresTab.vue'

const measure = (p: Partial<NationalMeasure> = {}): NationalMeasure => ({
  id: 1, seedKey: 'msh-273-wheat', kind: 'ban', direction: 'IN', codeText: '1001', goods: 'Пшеница',
  name: 'Запрет ввоза автомобильным, железнодорожным и водным транспортом', exceptions: 'Ж/д в адрес элеваторов', note: 'Срок рассчитан',
  actName: 'Приказ Министра сельского хозяйства РК', actNumber: '273', actDate: '2026-07-11', actUrl: 'https://adilet.zan.kz/rus/docs/V2600039292',
  validFrom: '2026-07-27', validTo: '2027-01-26', extensions: [], isActive: true, state: 'active', updatedAtUtc: '2026-10-17T10:00:00Z', updatedBy: 'admin', ...p,
})

let w: VueWrapper
const mountIt = () => { w = mountWithI18n(NationalMeasuresTab, { attachTo: document.body }) }
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  perms.manage = true
})

describe('NationalMeasuresTab', () => {
  it('карточка меры: состояние, вид, коды, товар, период, акт со ссылкой, исключения, оговорки, продления', async () => {
    api.measures.mockResolvedValue([
      measure({ extensions: [{ actName: 'Приказ МСХ РК', actNumber: '300', actDate: '2027-01-10', actUrl: null, previousValidTo: '2027-01-26', validTo: '2027-07-26', atUtc: '2027-01-10T00:00:00Z', by: 'admin' }] }),
      measure({ id: 2, goods: 'Яйца кур свежие', codeText: '0407 21', state: 'expired', validTo: '2026-10-20' }),
    ])
    mountIt()
    await flushPromises()
    const card = w.get('[data-nm="1"]')
    expect(card.attributes('data-nm-state')).toBe('active')
    expect(card.get('[data-nm-state-tag]').text()).toBe('Действует')
    expect(card.get('[data-nm-codes]').text()).toBe('1001')
    expect(card.get('[data-nm-goods]').text()).toBe('Пшеница')
    expect(card.get('[data-nm-period]').text()).toBe('С 27.07.2026 по 26.01.2027')
    expect(card.get('[data-nm-act] a').attributes('href')).toBe('https://adilet.zan.kz/rus/docs/V2600039292')
    expect(card.get('[data-nm-act]').text()).toContain('Приказ Министра сельского хозяйства РК № 273 от 11.07.2026')
    expect(card.get('[data-nm-exceptions]').text()).toBe('Исключения: Ж/д в адрес элеваторов')
    expect(card.get('[data-nm-extensions]').text()).toContain('Продлена: Приказ МСХ РК № 300 от 10.01.2027 — срок был до 26.01.2027, стал до 26.07.2027')
    expect(w.get('[data-nm="2"]').attributes('data-nm-state')).toBe('expired')
  })

  it('без tnved.manage — только просмотр', async () => {
    perms.manage = false
    api.measures.mockResolvedValue([measure()])
    mountIt()
    await flushPromises()
    expect(w.find('[data-nm-add]').exists()).toBe(false)
    expect(w.find('[data-nm-edit]').exists()).toBe(false)
    expect(w.find('[data-nm-toggle]').exists()).toBe(false)
  })

  it('снять — после подтверждения; вернуть — без него', async () => {
    api.measures.mockResolvedValue([measure()])
    api.remove.mockResolvedValue(measure({ isActive: false, state: 'removed' }))
    api.restore.mockResolvedValue(measure())
    confirmFn.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    mountIt()
    await flushPromises()
    await w.get('[data-nm-toggle]').trigger('click')
    await flushPromises()
    expect(api.remove).not.toHaveBeenCalled()
    await w.get('[data-nm-toggle]').trigger('click')
    await flushPromises()
    expect(api.remove).toHaveBeenCalledWith(1)
    expect(w.get('[data-nm="1"]').attributes('data-nm-state')).toBe('removed')
    expect(w.find('[data-nm-extend]').exists()).toBe(false)
    await w.get('[data-nm-toggle]').trigger('click')
    await flushPromises()
    expect(api.restore).toHaveBeenCalledWith(1)
    expect(msg.success).toHaveBeenLastCalledWith('Мера возвращена')
  })

  it('добавить: пустая форма не уходит; ошибка сервера по кодам — под полем', async () => {
    api.measures.mockResolvedValue([])
    api.create.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Коды не прочитаны', errors: { codeText: ['Коды не прочитаны: код «12ab»'] } } } })
    mountIt()
    await flushPromises()
    expect(w.find('[data-nm-empty]').exists()).toBe(true)
    await w.get('[data-nm-add]').trigger('click')
    await flushPromises()
    const ok = () => [...document.querySelectorAll('[data-national-measure-modal] button')].find((b) => b.textContent?.trim() === 'Добавить') as HTMLButtonElement
    ok().click()
    await flushPromises()
    expect(api.create).not.toHaveBeenCalled()
    expect(document.querySelector('[data-national-measure-modal]')!.textContent).toContain('Заполните поле')

    const fill = (sel: string, v: string) => {
      const el = document.querySelector(`${sel} input, input${sel}`) as HTMLInputElement
      el.value = v
      el.dispatchEvent(new Event('input'))
    }
    fill('[data-nm-codes]', '12ab')
    fill('[data-nm-goods]', 'Цемент')
    fill('[data-nm-name]', 'Квота')
    fill('[data-nm-act-name]', 'Приказ')
    fill('[data-nm-act-number]', '5')
    const from = w.findAllComponents({ name: 'ZDate' }).find((c) => c.vm.$attrs['data-nm-from'] !== undefined)!
    from.vm.$emit('update:value', '2026-10-01')
    await flushPromises()
    ok().click()
    await flushPromises()
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ codeText: '12ab', goods: 'Цемент', validFrom: '2026-10-01', kind: 'ban', direction: 'IN' }))
    expect(document.querySelector('[data-national-measure-modal]')!.textContent).toContain('Коды не прочитаны: код «12ab»')
  })
})
