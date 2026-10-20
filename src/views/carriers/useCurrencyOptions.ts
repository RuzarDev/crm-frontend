import { shallowRef } from 'vue'
import { tnvedApi } from '@/api/tnved'
import type { ZOption } from '@/ui/options'

// Валюты НБ РК для счетов перевозчика и страховки (+ KZT); сбой — только KZT и уже выбранные.
let cache: ZOption[] | null = null

export function useCurrencyOptions() {
  const options = shallowRef<ZOption[]>(cache ?? [{ value: 'KZT', label: 'KZT' }])
  const load = async () => {
    if (cache) { options.value = cache; return }
    try {
      const res = await tnvedApi.currencies({ silent: true })
      cache = [...res.data.map((c) => ({ value: c.codeLat, label: `${c.codeLat} — ${c.name}` })), { value: 'KZT', label: 'KZT' }]
      options.value = cache
    } catch { /* остаётся KZT */ }
  }
  /** Опции с выбранным кодом, даже если его нет в списке НБ РК. */
  const withValue = (code: string | null | undefined): ZOption[] =>
    code && !options.value.some((o) => o.value === code) ? [{ value: code, label: code }, ...options.value] : options.value
  return { options, load, withValue }
}
