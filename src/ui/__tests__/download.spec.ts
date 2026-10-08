import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveBlob } from '@/ui/download'

describe('saveBlob', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('кликает по ссылке с именем файла и освобождает URL только после клика, следующей задачей', () => {
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:x')
    const revoke = vi.fn()
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('чек.pdf')
      expect(this.href).toBe('blob:x')
      expect(revoke).not.toHaveBeenCalled()
    })

    saveBlob(new Blob(['x']), 'чек.pdf')

    expect(click).toHaveBeenCalledOnce()
    expect(revoke).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:x')
  })
})
