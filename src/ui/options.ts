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
