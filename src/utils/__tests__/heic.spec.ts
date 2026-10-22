import { afterEach, describe, expect, it, vi } from 'vitest'

import { heicErrorName, heicForUpload, isHeic, isIOS, jpegName } from '../heic'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('heic — фото iPhone', () => {
  it('HEIC узнаётся по типу и по расширению (тип часто пуст на компьютере)', () => {
    expect(isHeic({ name: 'IMG_0001.HEIC', type: '' })).toBe(true)
    expect(isHeic({ name: 'photo.heif', type: '' })).toBe(true)
    expect(isHeic({ name: 'blob', type: 'image/heic' })).toBe(true)
    expect(isHeic({ name: 'x', type: 'image/heif-sequence' })).toBe(true)
    expect(isHeic({ name: 'IMG_0001.jpg', type: 'image/jpeg' })).toBe(false)
    expect(isHeic({ name: 'heic.pdf', type: 'application/pdf' })).toBe(false)
  })

  it('имя JPEG-копии', () => {
    expect(jpegName('IMG_0001.HEIC')).toBe('IMG_0001.jpg')
    expect(jpegName('a.b.heif')).toBe('a.b.jpg')
    expect(jpegName('noext')).toBe('noext.jpg')
    expect(jpegName('.heic')).toBe('photo.jpg')
  })

  it('браузер HEIC не открывает (Chrome, Firefox) — файл уходит как есть, в JPEG переведёт сервер', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new DOMException('The source image could not be decoded.', 'InvalidStateError') }))
    const src = new File(['heic'], 'IMG_7.HEIC', { type: 'image/heic', lastModified: 1700000000000 })
    await expect(heicForUpload(src)).resolves.toBe(src)
  })

  it('без createImageBitmap — тоже исходник', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    const src = new File(['heic'], 'IMG_8.heic')
    await expect(heicForUpload(src)).resolves.toBe(src)
  })

  it('браузер открыл HEIC сам (Safari) — JPEG с тем же именем и .jpg, не больше 16 Мп', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 8000, height: 6000, close })))
    const draw = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: draw } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) { cb(new Blob(['native'], { type: 'image/jpeg' })) })
    const out = await heicForUpload(new File(['h'], 'IMG_9.heic', { type: 'image/heic', lastModified: 1700000000000 }))
    expect(out.name).toBe('IMG_9.jpg')
    expect(out.type).toBe('image/jpeg')
    expect(out.size).toBe(6) // 'native'
    expect(out.lastModified).toBe(1700000000000)
    // 48 Мп ужаты до ~16 Мп (предел холста iOS; сервер ужимает так же)
    const [, , , w, h] = draw.mock.calls[0] as number[]
    expect(w * h).toBeLessThanOrEqual(16_000_000)
    expect(close).toHaveBeenCalled()
  })

  it('холст не отдал JPEG — исходник (переведёт сервер)', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) { cb(null) })
    const src = new File(['h'], 'IMG_10.heic')
    await expect(heicForUpload(src)).resolves.toBe(src)
  })

  it('отказ сервера по HEIC: { code: "heic", name } → имя файла; остальное — null', () => {
    expect(heicErrorName({ error: 'по-русски', code: 'heic', name: 'IMG_1.HEIC' })).toBe('IMG_1.HEIC')
    expect(heicErrorName({ code: 'heic' })).toBe('')
    expect(heicErrorName({ error: 'другое', code: 'limit' })).toBeNull()
    expect(heicErrorName('строка')).toBeNull()
    expect(heicErrorName(null)).toBeNull()
  })

  it('iOS: iPhone и iPad (в том числе «настольный» iPad)', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 })
    expect(isIOS()).toBe(true)
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })
    expect(isIOS()).toBe(true)
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })
    expect(isIOS()).toBe(false)
  })
})
