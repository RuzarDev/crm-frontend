import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({
  getList: vi.fn(),
  changeStatus: vi.fn(),
  del: vi.fn(),
  bulkDelete: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/reestr', () => ({
  reestrApi: { getList: api.getList, changeStatus: api.changeStatus, delete: api.del, bulkDelete: api.bulkDelete, create: api.create, update: api.update },
}))
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
    expect(api.getList.mock.lastCall?.[0]).toMatchObject({ page: 3 })
    expect(s.currentPage).toBe(3)
  })

  it('смена размера страницы — с первой страницы', async () => {
    const s = useReestrStore()
    s.setPageAndSize(4, s.pageSize)
    s.setPageAndSize(4, 50)
    await s.fetchList()
    expect(api.getList.mock.lastCall?.[0]).toMatchObject({ page: 1, pageSize: 50 })
    expect(s.currentPage).toBe(1)
  })
})

describe('useReestrStore: список', () => {
  it('по умолчанию 25 строк; запрос тихий (ошибку рисует экран); время удачной загрузки', async () => {
    const s = useReestrStore()
    expect(s.pageSize).toBe(25)
    await s.fetchList()
    expect(api.getList).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 25 }), { silent: true })
    expect(s.loadError).toBe(false)
    expect(s.loadedAt).not.toBeNull()
  })

  it('сбой — loadError, прежние строки остаются; удачный повтор снимает ошибку', async () => {
    const s = useReestrStore()
    api.getList.mockResolvedValueOnce({ items: [{ id: 'a' }], totalCount: 1, page: 1, pageSize: 25, totalPages: 1 })
    await s.fetchList()
    const at = s.loadedAt
    api.getList.mockRejectedValueOnce(new Error('500'))
    await s.fetchList()
    expect(s.loadError).toBe(true)
    expect(s.entries.map((e) => e.id)).toEqual(['a'])
    expect(s.loadedAt).toBe(at)
    await s.fetchList()
    expect(s.loadError).toBe(false)
  })

  it('ответ устаревшего запроса отбрасывается', async () => {
    const s = useReestrStore()
    let release!: (v: unknown) => void
    api.getList.mockImplementationOnce(() => new Promise((r) => { release = r }))
    api.getList.mockResolvedValueOnce({ items: [{ id: 'new' }], totalCount: 1, page: 1, pageSize: 25, totalPages: 1 })
    const first = s.fetchList()
    await s.fetchList()
    release({ items: [{ id: 'old' }], totalCount: 1, page: 1, pageSize: 25, totalPages: 1 })
    await first
    expect(s.entries.map((e) => e.id)).toEqual(['new'])
    expect(s.loading).toBe(false)
  })
})

describe('useReestrStore: changeStatus', () => {
  it('смена статуса одной записи не ждёт перечёта списка (страница записи сразу перечитывает запись)', async () => {
    const s = useReestrStore()
    api.getList.mockReturnValueOnce(new Promise(() => {}))
    const ok = await s.changeStatus('a', 2)
    expect(ok).toBe(true)
    expect(api.changeStatus).toHaveBeenCalledWith('a', 2)
    expect(api.getList).toHaveBeenCalledTimes(1)
  })
})

describe('useReestrStore: changeStatuses', () => {
  it('по запросу на каждую запись, один fetchList в конце, один тост', async () => {
    const s = useReestrStore()
    const ok = await s.changeStatuses(['a', 'b', 'c'], 2)
    expect(ok).toBe(3)
    expect(api.changeStatus.mock.calls).toEqual([['a', 2, { silent: true }], ['b', 2, { silent: true }], ['c', 2, { silent: true }]])
    expect(api.getList).toHaveBeenCalledTimes(1)
    expect(api.toast.success).toHaveBeenCalledTimes(1)
    expect(api.toast.success).toHaveBeenCalledWith('Статус изменён: 3 из 3')
    expect(api.toast.warning).not.toHaveBeenCalled()
  })

  it('частичная неудача — предупреждение с итогом, список всё равно перечитывается', async () => {
    const s = useReestrStore()
    api.changeStatus.mockImplementation(async (id: string) => { if (id === 'b') throw new Error('403') })
    const ok = await s.changeStatuses(['a', 'b'], 7)
    expect(ok).toBe(1)
    expect(api.toast.warning).toHaveBeenCalledWith('Статус изменён: 1 из 2')
    expect(api.toast.success).not.toHaveBeenCalled()
    expect(api.getList).toHaveBeenCalledTimes(1)
  })
})

describe('useReestrStore: удаление', () => {
  // Сервер: всего total записей; страница за последней — пустая.
  const server = (total: number) => async (p: { page: number; pageSize: number }) => {
    const from = (p.page - 1) * p.pageSize
    const n = Math.max(0, Math.min(p.pageSize, total - from))
    return { items: Array.from({ length: n }, (_, i) => ({ id: `r${from + i}` })), totalCount: total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total / p.pageSize) }
  }

  it('удалили последнюю строку последней страницы — шаг назад и перечёт', async () => {
    const s = useReestrStore()
    api.getList.mockImplementation(server(26))
    s.setPageAndSize(2, 25)
    await s.fetchList()
    expect(s.entries).toHaveLength(1)
    api.del.mockResolvedValue(undefined)
    api.getList.mockImplementation(server(25))
    expect(await s.deleteEntry('r25')).toBe(true)
    expect(s.currentPage).toBe(1)
    expect(api.getList.mock.lastCall?.[0]).toMatchObject({ page: 1 })
    expect(s.entries).toHaveLength(25)
  })

  it('удаление пачки опустошило страницу — назад, но не дальше последней', async () => {
    const s = useReestrStore()
    api.getList.mockImplementation(server(80))
    s.setPageAndSize(4, 25)
    await s.fetchList()
    api.bulkDelete.mockResolvedValue({ deleted: 30 })
    api.getList.mockImplementation(server(50))
    expect(await s.deleteEntries(['a'])).toBe(true)
    expect(s.currentPage).toBe(2)
    expect(s.entries).toHaveLength(25)
  })

  it('на первой странице и при непустой странице лишнего запроса нет', async () => {
    const s = useReestrStore()
    api.getList.mockImplementation(server(0))
    await s.fetchList()
    const calls = api.getList.mock.calls.length
    api.del.mockResolvedValue(undefined)
    await s.deleteEntry('x')
    expect(api.getList.mock.calls.length).toBe(calls + 1)
    expect(s.currentPage).toBe(1)
  })
})

describe('useReestrStore: ошибка сохранения записи', () => {
  const httpError = (status: number, data?: unknown) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } })

  it('5xx — «ошибка сервера», а не сырой текст или трассировка; 4xx — текст сервера; без ответа — «нет связи»', async () => {
    const s = useReestrStore()
    api.create.mockRejectedValueOnce(httpError(500, 'System.NullReferenceException\n   at CRM.API.Foo()'))
    expect(await s.create({} as never)).toBe(false)
    expect(s.saveError).toBe('ошибка сервера')
    api.update.mockRejectedValueOnce(httpError(502))
    expect(await s.update('a', {} as never)).toBe(false)
    expect(s.saveError).toBe('ошибка сервера')
    api.update.mockRejectedValueOnce(httpError(400, { error: 'Код ТН ВЭД не найден' }))
    await s.update('a', {} as never)
    expect(s.saveError).toBe('Код ТН ВЭД не найден')
    api.update.mockRejectedValueOnce(new Error('Network Error'))
    await s.update('a', {} as never)
    expect(s.saveError).toBe('нет связи с сервером')
  })
})
