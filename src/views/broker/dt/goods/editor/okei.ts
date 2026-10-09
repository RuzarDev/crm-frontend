// Единицы ОКЕИ для поля ДЕИ (гр. 41): справочник грузится один раз на сессию и тихо (подпись «796 — шт» — подсказка,
// без справочника поле показывает код и наименование из товара).
import { shallowRef } from 'vue'
import { referencesApi } from '@/api/references'
import type { RefCodeItem } from '@/types/api'

const units = shallowRef<ReadonlyMap<string, string>>(new Map())
let loading: Promise<void> | null = null

export function ensureOkeiUnits(): Promise<void> {
  if (!loading) {
    loading = Promise.resolve()
      .then(() => referencesApi.listOkeiUnits({ silent: true }))
      .then((list: RefCodeItem[]) => { units.value = new Map(list.map((u) => [u.code, u.name])) })
      .catch((e) => {
        console.error('Failed to load OKEI units', e)
        loading = null // следующий товар попробует снова
      })
  }
  return loading
}

/** Наименование единицы по коду ОКЕИ; нет в справочнике (или не загрузился) — null. */
export const okeiName = (code: string | null | undefined): string | null => {
  const c = (code ?? '').trim()
  return c ? units.value.get(c) ?? null : null
}

/** Для тестов. */
export function resetOkeiUnits(): void {
  units.value = new Map()
  loading = null
}
