// Курсы НБ РК для страницы ДТ — НА ДАТУ гр.А (/import40/rates-on-date) поверх текущих из справочника валют.
// Перенос из Import40DtView.vue (loadRatesOnDate, currencyBoxCodes, справочник валют) — волна 6а, Task 2.
//
// Решение владельца 16.10.2026: ручного курса нет. Дата курсов — дата гр.А, а пустая гр.А — сегодня (сервер отвечает
// на запрос без даты курсами на сегодня и называет этот день). Гр.23 — курс валюты сделки (гр.22) на эту дату (dealRate),
// только чтение; экран показывает и считает гр.12 по нему, сервер (печать, 1С, полнота) — так же сам. Сохранённый
// form.exchangeRate — колонка для совместимости, на неё не опираемся: она обновляется только вслед за правкой
// пользователя (смена даты гр.А или валюты гр.22), а при загрузке ДТ не пишется — открытие ДТ не должно её сохранять.
import { computed, ref, watch } from 'vue'
import { import40Api } from '@/api/import40'
import { tnvedApi } from '@/api/tnved'
import { CURRENCY_NUMERIC } from '@/types/api'
import { toIsoDate } from './dtPayload'

export interface RateInfo {
  rate: number
  /** Дата курса: дата гр.А для курсов на дату, иначе дата обновления справочника. */
  date: string
}
export type RateMap = Record<string, RateInfo>

/** Что useDtRates читает из формы ДТ (и пишет: exchangeRate). */
export interface DtRatesForm {
  submissionDate?: string | null
  currency?: string | null
  exchangeRate?: number | null
  goodsItems?: { currency?: string | null }[]
  expenses?: { currencyCode?: string | null }[] | null
}

export interface DtRatesOptions {
  /** Идёт загрузка ДТ в форму. */
  applying: () => boolean
  /** Право править ДТ: только с ним сохранённая гр.23 следует за правкой даты/валюты. По умолчанию — да. */
  canWrite?: () => boolean
}

const up = (c: string | null | undefined) => (c ? c.toUpperCase() : '')

export function useDtRates(form: DtRatesForm, opts: DtRatesOptions) {
  const currencyOptions = ref<{ value: string; label: string }[]>([])
  /** Текущие курсы справочника валют (на день заполнения). */
  const currentRates = ref<RateMap>({})
  /** Курсы на дату курсов ДТ (гр.А или сегодня) — последний успешный ответ. */
  const onDateRates = ref<RateMap>({})
  /** false — НБ РК недоступен, сервер отдал курсы не на дату гр.А. */
  const official = ref(true)

  const rates = computed<RateMap>(() => ({ ...currentRates.value, ...onDateRates.value }))
  const usdRate = computed(() => rates.value.USD?.rate ?? null)
  const nbUnavailable = computed(() => !official.value)
  /**
   * Гр.23 — курс валюты сделки (гр.22) на дату курсов ДТ: только из ответа «на дату» (не текущий справочника — его день
   * другой). null — валюта не выбрана или ответа ещё нет.
   */
  const dealRate = computed<RateInfo | null>(() => (form.currency ? onDateRates.value[up(form.currency)] ?? null : null))

  /** Валюты, чьи курсы нужны ДТ: USD (гр.46), EUR (специфические ставки), гр.22, товары, расходы. */
  const rateCodes = computed(() => {
    const set = new Set<string>(['USD', 'EUR'])
    const add = (c: string | null | undefined) => { if (c && c.toUpperCase() !== 'KZT') set.add(c.toUpperCase()) }
    add(form.currency)
    for (const g of form.goodsItems ?? []) add(g.currency)
    for (const e of form.expenses ?? []) add(e.currencyCode)
    return Array.from(set).sort()
  })

  /** Коды для полосы курсов у гр.А: USD, EUR, гр.22 и валюты расходов; без KZT и повторов. */
  const boxCodes = computed(() => {
    const raw = ['USD', 'EUR', form.currency, ...(form.expenses ?? []).map((e) => e.currencyCode)]
    const set = new Set<string>()
    for (const c of raw) {
      if (!c) continue
      const u = c.toUpperCase()
      if (u === 'KZT') continue
      set.add(u)
    }
    return Array.from(set)
  })

  /** Справочник валют НБ РК: варианты выбора и текущие курсы. Сбой — форма работает без них. */
  const loadCurrencies = async () => {
    try {
      const currencies = (await tnvedApi.currencies()).data
      currencyOptions.value = currencies.map((c) => {
        const num = CURRENCY_NUMERIC[c.codeLat]
        // В label — и буквенный, и цифровой код: поиск по label находит и «USD», и «840»
        return { value: c.codeLat, label: `${c.codeLat}${num ? ' / ' + num : ''} — ${c.name}` }
      })
      const map: RateMap = { KZT: { rate: 1, date: '' } }
      for (const c of currencies) map[c.codeLat] = { rate: c.rate, date: c.updatedAtUtc }
      currentRates.value = map
    } catch {
      /* справочник валют НБ РК не загрузился — расходы и гр.23 не блокируют форму */
    }
  }

  // Пользователь сменил дату гр.А или валюту гр.22 — сохранённая гр.23 (совместимость) встанет на курс сделки, как только
  // он известен. Загрузка ДТ флаг не ставит: открытие ДТ гр.23 не пишет и автосейв не будит.
  let syncPending = false
  const syncDealRate = () => {
    if (!syncPending) return
    if (opts.canWrite && !opts.canWrite()) { syncPending = false; return }
    const deal = dealRate.value
    if (!deal) return
    syncPending = false
    if (Number(form.exchangeRate) !== deal.rate) form.exchangeRate = deal.rate
  }

  let seq = 0
  const refresh = async () => {
    const my = ++seq
    // Пустая гр.А — запрос без даты: сервер берёт курсы на сегодня и возвращает этот день.
    const date = toIsoDate(form.submissionDate)
    try {
      const res = await import40Api.ratesOnDate(date, rateCodes.value)
      if (my !== seq) return
      const day = res.date ?? date ?? ''
      const next: RateMap = {}
      for (const [code, rate] of Object.entries(res.rates)) next[code] = { rate, date: day }
      onDateRates.value = next
      official.value = res.official
      syncDealRate()
    } catch {
      /* курсы на дату не загрузились — остаются прежние; расчёты на сервере всё равно по той же дате */
    }
  }

  watch(
    () => [toIsoDate(form.submissionDate), rateCodes.value.join(',')] as const,
    (next, prev) => {
      if (!opts.applying() && prev && next[0] !== prev[0]) syncPending = true
      void refresh()
    },
  )
  // Смена валюты сделки пользователем — гр.23 за ней (сразу, если курс уже загружен, иначе по ответу).
  watch(() => up(form.currency), () => {
    if (opts.applying()) return
    syncPending = true
    syncDealRate()
  })

  return {
    currencyOptions,
    rates,
    official,
    nbUnavailable,
    usdRate,
    dealRate,
    rateCodes,
    boxCodes,
    loadCurrencies,
    refresh,
  }
}
