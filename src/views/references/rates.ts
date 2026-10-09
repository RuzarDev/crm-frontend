import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TnvedCurrencyDto } from '@/types/api'
import { calendarLocale } from '@/ui/date'
import { useBlock } from '@/views/home/useBlock'
import { isRateLimited } from '@/views/references/tnvedShared'
import { byCurrencyRank, currencyName, loadCurrencies, resetCurrenciesCache } from '@/views/client/tnved/currency'

// Курсы НБ РК: общие для «Курсов валют» клиента и сотрудника (волна 5а) — загрузка, поиск (?q=), строки и подписи.

export interface RateRow { code: string; name: string; serverName: string; rate: string }

/** Курс в тенге за единицу: 2–4 знака, разделители по языку интерфейса; неразрывные пробелы — обычные. */
export function formatRate(n: number, locale: string): string {
  return new Intl.NumberFormat(calendarLocale(locale), { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    .format(n)
    .replace(/[  ]/g, ' ')
}

/** Строки таблицы: частые валюты сверху, остальные по коду; название — по языку интерфейса. */
export function rateRows(data: TnvedCurrencyDto[] | null | undefined, locale: string): RateRow[] {
  return [...(data ?? [])]
    .sort((a, b) => byCurrencyRank(a.codeLat, b.codeLat))
    .map((c) => ({
      code: c.codeLat,
      name: currencyName(c.codeLat, c.name, locale),
      serverName: c.name,
      rate: formatRate(c.rate, locale),
    }))
}

const norm = (s: string): string => s.toLocaleLowerCase('ru').replace(/\s+/g, ' ').trim()

/** Поиск по коду и названию (на любом языке интерфейса и по-русски); пустой запрос — все строки. */
export function filterRates(rows: RateRow[], q: string): RateRow[] {
  const n = norm(q)
  if (!n) return rows
  return rows.filter((r) => [r.code, r.name, r.serverName].some((f) => norm(f).includes(n)))
}

/** «Обновлено» — по самому свежему курсу, в местном времени, по языку интерфейса («08.10.2026 08:00»); нет дат — пусто. */
export function ratesUpdated(data: TnvedCurrencyDto[] | null | undefined, locale: string): string {
  const times = (data ?? []).map((c) => Date.parse(c.updatedAtUtc)).filter((n) => Number.isFinite(n))
  if (!times.length) return ''
  return new Intl.DateTimeFormat(calendarLocale(locale), {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(Math.max(...times))).replace(', ', ' ')
}

/** Загрузка курсов и поиск в адресе (?q=, replace — «Назад» уводит с экрана, а не листает поиск). */
export function useRatesData() {
  const route = useRoute()
  const router = useRouter()

  // 429 отличаем от прочих ошибок: «попробуйте через минуту», а не «не удалось».
  const limited = ref(false)
  const block = useBlock(true, async () => {
    limited.value = false
    try {
      return await loadCurrencies()
    } catch (e) {
      limited.value = isRateLimited(e)
      throw e
    }
  })
  void block.load()
  /** «Обновить»: забыть кэш на несколько минут и спросить заново. */
  const refresh = () => {
    resetCurrenciesCache()
    return block.load()
  }

  const queryQ = () => (typeof route.query.q === 'string' ? route.query.q : '')
  const q = ref(queryQ())
  let ownReplaces = 0
  watch(() => route.query.q, () => {
    if (ownReplaces) return
    const v = queryQ()
    if (v !== q.value) q.value = v
  })
  const onSearch = async (v: string) => {
    q.value = v
    ownReplaces += 1
    try {
      await router.replace({ query: { ...route.query, q: v.trim() ? v : undefined } })
    } finally {
      ownReplaces -= 1
    }
  }
  const hasData = computed(() => !!block.data?.length)
  return { block, limited, q, onSearch, refresh, hasData }
}
