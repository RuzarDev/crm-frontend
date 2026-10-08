import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ReestrStatusHistoryDto } from '@/types/api'

const api = vi.hoisted(() => ({ getStatusHistory: vi.fn() }))
vi.mock('@/api/reestr', () => ({ reestrApi: api }))

import RecordHistory from '../RecordHistory.vue'

const row = (o: Partial<ReestrStatusHistoryDto> = {}): ReestrStatusHistoryDto => ({
  id: 'h1', oldStatus: 0, newStatus: 1, changedByUserId: 'u1', changedByRole: 'importer', changedByUsername: 'aigerim',
  changedAtUtc: '2026-10-08T09:14:00', ...o,
})

let w: VueWrapper
const mount = async (refreshKey = 0) => {
  w = mountWithI18n(RecordHistory, { props: { reestrId: 'r1', refreshKey }, attachTo: document.body })
  await flushPromises()
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

describe('RecordHistory', () => {
  it('строки: дата, автор, было, стало; первая запись — «—» вместо «было»', async () => {
    api.getStatusHistory.mockResolvedValue([
      row({ id: 'h2', oldStatus: 1, newStatus: 2, changedByUsername: 'erlan', changedAtUtc: '2026-10-09T11:05:00' }),
      row({ id: 'h1', oldStatus: null, newStatus: 0, changedByUsername: null, changedByRole: 'administrator' }),
    ])
    await mount()
    expect(api.getStatusHistory).toHaveBeenCalledWith('r1')
    const rows = w.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    const first = rows[0].text()
    expect(first).toContain('09.10.2026 11:05')
    expect(first).toContain('erlan')
    expect(first).toContain('Подан')
    expect(first).toContain('Выпущен')
    const second = rows[1].text()
    expect(second).toContain('Администратор')
    expect(second).toContain('—')
    expect(second).toContain('В работе')
  })

  it('пусто — «История пуста»; ошибка загрузки тоже даёт пустой список', async () => {
    api.getStatusHistory.mockResolvedValue([])
    await mount()
    expect(w.text()).toContain('История пуста')
    w.unmount()
    api.getStatusHistory.mockRejectedValue(new Error('x'))
    await mount()
    expect(w.text()).toContain('История пуста')
  })

  it('перечитывается при смене refreshKey; поздний ответ прежнего запроса не затирает свежий', async () => {
    let resolveFirst!: (v: ReestrStatusHistoryDto[]) => void
    api.getStatusHistory
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockResolvedValueOnce([row({ id: 'new', changedByUsername: 'fresh' })])
    await mount(0)
    await w.setProps({ refreshKey: 1 })
    await flushPromises()
    expect(api.getStatusHistory).toHaveBeenCalledTimes(2)
    resolveFirst([row({ id: 'old', changedByUsername: 'stale' })])
    await flushPromises()
    expect(w.text()).toContain('fresh')
    expect(w.text()).not.toContain('stale')
  })
})
