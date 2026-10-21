import { afterEach, describe, expect, it, vi } from 'vitest'

const lib = vi.hoisted(() => ({ convert: vi.fn() }))
vi.mock('@/utils/heicLoader', () => ({ loadHeic2any: async () => lib.convert }))

import { heicToJpeg, isHeic, isIOS, jpegName } from '../heic'

afterEach(() => { lib.convert.mockReset(); vi.unstubAllGlobals() })

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

  it('браузер сам HEIC не открывает — heic2any (лениво); результат — JPEG-файл .jpg', async () => {
    lib.convert.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
    const src = new File(['heic'], 'IMG_7.HEIC', { type: 'image/heic', lastModified: 1700000000000 })
    const out = await heicToJpeg(src)
    expect(lib.convert).toHaveBeenCalledWith({ blob: src, toType: 'image/jpeg', quality: 0.9 })
    expect(out.name).toBe('IMG_7.jpg')
    expect(out.type).toBe('image/jpeg')
    expect(out.lastModified).toBe(1700000000000)
  })

  it('heic2any вернул несколько кадров — берётся первый; ошибка — исключение', async () => {
    lib.convert.mockResolvedValue([new Blob(['first'], { type: 'image/jpeg' }), new Blob(['second-frame'])])
    const out = await heicToJpeg(new File(['h'], 'live.heic'))
    expect(out.size).toBe(5)
    lib.convert.mockRejectedValue(new Error('ERR_LIBHEIF format not supported'))
    await expect(heicToJpeg(new File(['h'], 'bad.heic'))).rejects.toThrow('ERR_LIBHEIF')
  })

  it('браузер открыл HEIC сам (Safari) — без библиотеки', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 8000, height: 6000, close })))
    const draw = vi.fn()
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: draw } as never)
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) { cb(new Blob(['native'], { type: 'image/jpeg' })) })
    try {
      const out = await heicToJpeg(new File(['h'], 'IMG_9.heic', { type: 'image/heic' }))
      expect(out.size).toBe(6) // 'native'
      expect(lib.convert).not.toHaveBeenCalled()
      // 48 Мп ужаты до ~16 Мп (предел холста iOS)
      const [, , , w, h] = draw.mock.calls[0] as number[]
      expect(w * h).toBeLessThanOrEqual(16_000_000)
      expect(close).toHaveBeenCalled()
    } finally {
      getContext.mockRestore()
      toBlob.mockRestore()
    }
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
