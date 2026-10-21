// Ленивая загрузка heic2any (MIT, ~1,3 МБ со встроенным декодером libheif, LGPL-3.0 — см. THIRD_PARTY_NOTICES.md) —
// отдельным чанком, только когда выбран HEIC-файл и браузер сам его не открыл. Вынесено в свой модуль, чтобы тесты
// подменяли загрузчик целиком. Типы модуля — src/types/heic2any.d.ts.
export type Heic2Any = (options: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]>

export const loadHeic2any = async (): Promise<Heic2Any> => {
  const mod = await import('heic2any')
  // Пакет UMD/CommonJS: функция — default-экспорт (у некоторых сборщиков — сам модуль).
  return (mod.default ?? mod) as Heic2Any
}
