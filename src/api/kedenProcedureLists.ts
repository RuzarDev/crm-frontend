import apiClient from './client'

/**
 * Гр.36.1–36.4, 37.1.2, 37.2: какие коды КЕДЕН предлагает в блоке товара при данной процедуре гр.1.
 * Ключ — «ИМ40», «ЭК10»… (направление + 2 цифры процедуры); поля — коды наших классификаторов
 * (pref-fee, pref-duty, pref-excise, pref-vat, movement-features) и prev (предшествующая процедура).
 * Сняты в КЕДЕН 07.10.2026; сочетания, которых нет в списке, не ограничиваются.
 */
export type KedenProcedureLists = Record<string, Record<string, string[]>>

let cache: Promise<KedenProcedureLists> | null = null

export const kedenProcedureListsApi = {
  get(): Promise<KedenProcedureLists> {
    cache ??= apiClient
      .get<KedenProcedureLists>('/ref/keden-procedure-lists', { silent: true })
      .then((r) => r.data)
      .catch((e) => {
        cache = null
        throw e
      })
    return cache
  },
}

export const kedenListKey = (direction: string | null | undefined, procedure: string | null | undefined) => {
  const p = (procedure ?? '').trim()
  return p.length < 2 ? null : `${(direction ?? '').trim().toUpperCase() || 'ИМ'}${p.slice(0, 2)}`
}
