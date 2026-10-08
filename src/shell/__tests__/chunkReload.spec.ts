import { describe, expect, it, vi } from 'vitest'
import { CHUNK_RELOAD_KEY, installChunkReload, reloadOnceOnChunkError } from '../chunkReload'

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, m }
}
const event = () => new Event('vite:preloadError', { cancelable: true })

describe('reloadOnceOnChunkError', () => {
  it('первая ошибка — отметка времени и перезагрузка, ошибка погашена', () => {
    const storage = memory()
    const reload = vi.fn()
    const e = event()
    expect(reloadOnceOnChunkError(e, { storage, reload, now: () => 1_000_000 })).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented).toBe(true)
    expect(storage.m.get(CHUNK_RELOAD_KEY)).toBe('1000000')
  })

  it('повтор в течение минуты после перезагрузки — без перезагрузки (нет цикла)', () => {
    const storage = memory({ [CHUNK_RELOAD_KEY]: '1000000' })
    const reload = vi.fn()
    const e = event()
    expect(reloadOnceOnChunkError(e, { storage, reload, now: () => 1_030_000 })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(false)
    // позже (новая выкладка) — снова можно
    expect(reloadOnceOnChunkError(event(), { storage, reload, now: () => 1_090_000 })).toBe(true)
  })

  it('sessionStorage недоступен — не перезагружаем', () => {
    const storage = { getItem: () => { throw new Error('denied') }, setItem: () => {} }
    const reload = vi.fn()
    expect(reloadOnceOnChunkError(event(), { storage, reload, now: () => 1 })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('installChunkReload слушает vite:preloadError окна', () => {
    const add = vi.fn()
    installChunkReload({ addEventListener: add } as unknown as Window)
    expect(add).toHaveBeenCalledWith('vite:preloadError', expect.any(Function))
  })
})
