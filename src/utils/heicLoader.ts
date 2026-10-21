// Ленивая загрузка heic2any (MIT, ~1,3 МБ со встроенным декодером libheif) — отдельным чанком, только когда выбран
// HEIC-файл и браузер сам его не открыл. Вынесено в свой модуль, чтобы тесты подменяли загрузчик целиком.
export type Heic2Any = (options: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]>

export const loadHeic2any = async (): Promise<Heic2Any> => {
  // @ts-ignore -- пакет heic2any добавлен в package.json; до `npm install` в рабочей копии модуль может отсутствовать.
  const mod = await import('heic2any')
  return (mod.default ?? mod) as Heic2Any
}
