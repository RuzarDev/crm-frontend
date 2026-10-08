import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({
  getList: vi.fn(),
  changeStatus: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/reestr', () => ({ reestrApi: { getList: api.getList, changeStatus: api.changeStatus } }))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import { useReestrStore } from '../reestr'

// Ответ сервера повторяет запрошенные страницу и размер — как настоящий GET /reestr.
const echo = async (p: { page: number; pageSize: number }) => ({ items: [], totalCount: 120, page: p.page, pageSize: p.pageSize, totalPages: 5 })

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  api.getList.mockImplementation(echo)
  api.changeStatus.mockResolvedValue(undefined)
})

describe('useReestrStore: страницы', () => {
  it('переход на страницу 3 при прежнем размере не сбрасывает на первую', async () => {
    const s = useReestrStore()
    s.setPageAndSize(3, s.pageSize)
    await s.fetchList()
    expect(api.getList).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 }))
    expect(s.currentPage).toBe(3)
  })

  it('смена размера страницы — с первой страницы', async () => {
    const s = useReestrStore()
    s.setPageAndSize(4, s.pageSize)
    s.setPageAndSize(4, 50)
    await s.fetchList()
    expect(api.getList).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 50 }))
    expect(s.currentPage).toBe(1)
  })
})
