export type ZOptionValue = string | number
export interface ZOption {
  value: ZOptionValue
  label: string
  disabled?: boolean
  [key: string]: unknown
}
/** Как :filter-option у a-select: true — фильтр по умолчанию, false — без фильтра, функция — своя. */
export type ZFilterOption = boolean | ((input: string, option: ZOption) => boolean)

export const defaultFilter = (input: string, option: ZOption, prop = 'label'): boolean =>
  String(option[prop] ?? '').toLocaleLowerCase('ru').includes(input.toLocaleLowerCase('ru'))

export const filterOptions = (options: ZOption[], input: string, filter: ZFilterOption, prop = 'label'): ZOption[] => {
  if (!input || filter === false) return options
  if (typeof filter === 'function') return options.filter((o) => filter(input, o))
  return options.filter((o) => defaultFilter(input, o, prop))
}

export type ZSelectValue = ZOptionValue | ZOptionValue[] | null | undefined

/** Reka не принимает '' значением пункта, а старые экраны его используют ({ value: '', label: 'Все' }) —
 *  на границе с Reka '' подменяется служебным ключом и обратно. */
export const EMPTY_KEY = '\u0000z-empty'
export const toKey = (v: ZOptionValue): ZOptionValue => (v === '' ? EMPTY_KEY : v)
export const fromKey = (k: unknown): ZOptionValue => (k === EMPTY_KEY ? '' : (k as ZOptionValue))

export const indexOptions = (options: ZOption[]): Map<ZOptionValue, ZOption> => new Map(options.map((o) => [o.value, o]))
/** Опция по значению; для значения без опции (tags, ещё не загруженный справочник) — подпись из самого значения. */
export const optionFor = (index: Map<ZOptionValue, ZOption>, v: ZOptionValue): ZOption => index.get(v) ?? { value: v, label: String(v) }

/** Значение не изменилось (как triggerChange у AntD — тогда change не шлём). null и undefined — одно и то же. */
export const sameValue = (a: ZSelectValue, b: ZSelectValue): boolean => {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])
  }
  return (a ?? null) === (b ?? null)
}
