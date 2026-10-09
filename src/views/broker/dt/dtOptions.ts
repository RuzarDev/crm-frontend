import type { ZOption } from '@/ui/options'

/** «код — название» без повтора кода: в справочнике название бывает уже вида «ИМ — импорт (ввоз)». */
export const classifierLabel = (code: string, nameRu: string): string => {
  const name = (nameRu ?? '').trim()
  return name.toLocaleLowerCase('ru').startsWith(`${code.toLocaleLowerCase('ru')} —`) ? name : `${code} — ${name}`
}

/** Опции классификатора из стора (value — код); подпись без повтора кода. */
export const dedupeOptions = (items: ZOption[]): ZOption[] =>
  items.map((o) => {
    const prefix = `${String(o.value)} — `
    const rest = o.label.startsWith(prefix) ? o.label.slice(prefix.length) : o.label
    return { ...o, label: classifierLabel(String(o.value), rest) }
  })

/**
 * Список для выбора без свободного ввода: значение, которого нет в списке (старая ДТ, другой формат), всё равно
 * показывается — отдельным пунктом — и помечается unknown (ярлык-предупреждение у поля). Пока список не загружен
 * (пуст), значение показывается как есть и не помечается.
 */
export const withCurrent = (options: ZOption[], value: string | null | undefined): { options: ZOption[]; unknown: boolean } => {
  const v = (value ?? '').trim()
  if (!v || options.some((o) => o.value === v)) return { options, unknown: false }
  return { options: [{ value: v, label: v }, ...options], unknown: options.length > 0 }
}
