import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBlock } from '../useBlock'

const deferred = <T>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

afterEach(() => vi.restoreAllMocks())

describe('useBlock', () => {
  it('выключенный блок не грузится и не висит в загрузке', async () => {
    const fetcher = vi.fn()
    const b = useBlock(false, fetcher)
    expect(b.loading).toBe(false)
    await b.load()
    expect(fetcher).not.toHaveBeenCalled()
    expect(b.data).toBeNull()
  })

  it('успех и ошибка: data / error / loading', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce(7)
    const b = useBlock(true, fetcher)
    expect(b.loading).toBe(true)
    await b.load()
    expect(b).toMatchObject({ loading: false, error: true, data: null })
    expect(console.error).toHaveBeenCalledTimes(1)
    await b.load()
    expect(b).toMatchObject({ loading: false, error: false, data: 7 })
  })

  it('повтор во время первого запроса: старый ответ отбрасывается', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const b = useBlock(true, fetcher)
    const p1 = b.load()
    const p2 = b.load()
    second.resolve('новый')
    await p2
    expect(b).toMatchObject({ data: 'новый', loading: false, error: false })
    first.resolve('старый')
    await p1
    expect(b.data).toBe('новый')
    expect(b.loading).toBe(false)
  })

  it('устаревшая ошибка не перетирает свежий ответ', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const first = deferred<string>()
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce('новый')
    const b = useBlock(true, fetcher)
    const p1 = b.load()
    await b.load()
    first.reject(new Error('timeout'))
    await p1
    expect(b).toMatchObject({ data: 'новый', error: false, loading: false })
  })
})
