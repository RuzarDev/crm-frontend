// HEIC/HEIF — формат фото iPhone. Хранилище берёт только JPG/PNG, поэтому такие фото переводятся в JPEG до сохранения.
// Сначала — средствами самого браузера (Safari открывает HEIC без библиотек, 21.10). Не смог (Chrome, Firefox) —
// исходник уходит на сервер как есть и переводится там (Zircon AI, свежий libheif; 22.10, fix-wave-2 e2e-1).
// Браузерная библиотека heic2any убрана: её libheif 1.10 не открывал фото iPhone 15/16 (iOS 18, HDR).

const HEIC_MIME = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']

/** Для accept поля выбора файла и проверки типа в ZUpload. */
export const HEIC_ACCEPT = ['.heic', '.heif', 'image/heic', 'image/heif']

/** Фото HEIC/HEIF: по типу или (тип пуст у многих браузеров на компьютере) по расширению. */
export const isHeic = (f: Pick<File, 'name' | 'type'>): boolean =>
  HEIC_MIME.includes((f.type || '').toLowerCase()) || /\.(heic|heif)$/i.test(f.name)

/** Имя JPEG-копии: IMG_0001.HEIC → IMG_0001.jpg (то же имя даёт сервер, если переводит он). */
export const jpegName = (name: string): string => `${name.replace(/\.(heic|heif)$/i, '') || 'photo'}.jpg`

/**
 * iPhone/iPad: Safari сам отдаёт фото в JPEG, если в accept нет HEIC; если HEIC там есть — отдаст исходник.
 * Поэтому на iOS HEIC в accept не добавляем (лишняя перекодировка большого фото на телефоне).
 */
export const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Холст больше ~16 млн точек iOS не рисует; фото погрузки такое разрешение и не нужно (сервер ужимает так же). */
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
    return null // браузер не умеет HEIC (Chrome, Firefox) — переведёт сервер
  } finally {
    bmp?.close?.()
  }
}

/**
 * Фото HEIC/HEIF к загрузке: браузер открыл сам — JPEG-файл с тем же именем и .jpg; не открыл — исходный файл
 * (сервер переведёт его в JPEG при сохранении). Не бросает.
 */
export const heicForUpload = async (file: File): Promise<File> => {
  const blob = await nativeToJpeg(file)
  return blob ? new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified }) : file
}

/**
 * Отказ сервера по фото HEIC ({ code: 'heic', name } — не перевелось или служба перевода недоступна): имя файла
 * для текста z.heicFailed на языке интерфейса; иначе null.
 */
export const heicErrorName = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.code !== 'heic') return null
  return typeof d.name === 'string' ? d.name : ''
}
