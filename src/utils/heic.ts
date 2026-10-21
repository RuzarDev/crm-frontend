// HEIC/HEIF — формат фото iPhone. Сервер принимает только JPG/PNG, поэтому такие фото переводим в JPEG в браузере
// до загрузки (21.10). Сначала — средствами самого браузера (Safari открывает HEIC без библиотек), иначе — heic2any.

const HEIC_MIME = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']

/** Для accept поля выбора файла и проверки типа в ZUpload. */
export const HEIC_ACCEPT = ['.heic', '.heif', 'image/heic', 'image/heif']

/** Фото HEIC/HEIF: по типу или (тип пуст у многих браузеров на компьютере) по расширению. */
export const isHeic = (f: Pick<File, 'name' | 'type'>): boolean =>
  HEIC_MIME.includes((f.type || '').toLowerCase()) || /\.(heic|heif)$/i.test(f.name)

/** Имя JPEG-копии: IMG_0001.HEIC → IMG_0001.jpg. */
export const jpegName = (name: string): string => `${name.replace(/\.(heic|heif)$/i, '') || 'photo'}.jpg`

/**
 * iPhone/iPad: Safari сам отдаёт фото в JPEG, если в accept нет HEIC; если HEIC там есть — отдаст исходник.
 * Поэтому на iOS HEIC в accept не добавляем (лишняя перекодировка большого фото на телефоне).
 */
export const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Холст больше ~16 млн точек iOS не рисует; фото погрузки такое разрешение и не нужно. */
const MAX_PIXELS = 16_000_000
const QUALITY = 0.9

const nativeToJpeg = async (file: File): Promise<Blob | null> => {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
  let bmp: ImageBitmap | null = null
  try {
    bmp = await createImageBitmap(file)
    const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (bmp.width * bmp.height)))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(bmp.width * scale))
    canvas.height = Math.max(1, Math.floor(bmp.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', QUALITY))
  } catch {
    return null // браузер не умеет HEIC (Chrome, Firefox) — дальше heic2any
  } finally {
    bmp?.close?.()
  }
}

const libToJpeg = async (file: File): Promise<Blob> => {
  // Загрузчик — динамически: библиотека и её модуль попадают в отдельный чанк и грузятся только здесь.
  const { loadHeic2any } = await import('./heicLoader')
  const heic2any = await loadHeic2any()
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: QUALITY })
  const blob = Array.isArray(out) ? out[0] : out
  if (!blob) throw new Error('heic2any: пустой результат')
  return blob
}

/** HEIC/HEIF → JPEG-файл с тем же именем и расширением .jpg. Не получилось — исключение (экран показывает сообщение). */
export const heicToJpeg = async (file: File): Promise<File> => {
  const blob = (await nativeToJpeg(file)) ?? (await libToJpeg(file))
  return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified })
}
